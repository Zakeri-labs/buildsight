"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { assertProjectAdmin, audit, AuthzError } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  isAddParticipantRole,
  isAddParticipantType,
  isContractorRole,
  type AddParticipantRole,
  type AddParticipantType,
  type ContractorRole,
} from "@/lib/projects/project-participant-types"
import type { ProjectOrgRole } from "@/lib/db/types"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SUPERVISOR_ROLES = new Set<AddParticipantRole>(["Supervisor", "Project Manager", "Site Engineer", "QA/QC Engineer", "HSE Officer"])
const OTHER_ROLES = new Set<AddParticipantRole>(["Supplier", "Other"])

type ParticipantSource = "existing_user" | "external_contact"

type AddParticipantInput = {
  projectId: string
  participantType: string
  source: ParticipantSource
  userId?: string
  participantRole?: string
  contractorRole?: string
  customContractorType?: string
  companyName?: string
  contactPerson?: string
  email?: string
  phone?: string
}

type EditContractorInput = {
  projectId: string
  participantId: string
  contractorRole: string
  customContractorType?: string
  companyName?: string
  contactPerson?: string
  email?: string
  phone?: string
}

export type ProjectParticipantActionResult = { ok: true } | { ok: false; error: string }

type ParticipantStorageRole = {
  participantType: "client" | "contractor" | "consultancy" | "subcontractor" | "government" | "supplier" | "third_party"
  projectRole: ProjectOrgRole
  label: AddParticipantRole
}

function storageRole(participantType: AddParticipantType, requestedRole?: string): ParticipantStorageRole | null {
  switch (participantType) {
    case "client":
      return { participantType: "client", projectRole: "client", label: "Client / Owner" }
    case "consultant":
      return { participantType: "consultancy", projectRole: "consultant", label: "Consultant" }
    case "contractor":
      return { participantType: "contractor", projectRole: "contractor", label: "Contractor" }
    case "supervisor": {
      if (!requestedRole || !isAddParticipantRole(requestedRole) || !SUPERVISOR_ROLES.has(requestedRole)) return null
      return { participantType: "consultancy", projectRole: "consultant", label: requestedRole }
    }
    case "other": {
      if (!requestedRole || !isAddParticipantRole(requestedRole) || !OTHER_ROLES.has(requestedRole)) return null
      return requestedRole === "Supplier"
        ? { participantType: "supplier", projectRole: "supplier", label: requestedRole }
        : { participantType: "third_party", projectRole: "third_party", label: requestedRole }
    }
  }
}

function membershipPriority(role: string): number {
  return role === "org_admin" ? 0 : role === "org_manager" ? 1 : role === "org_member" ? 2 : 3
}

function normalizedOptional(value: string | undefined, maxLength: number): string | null {
  const normalized = value?.trim() || ""
  return normalized ? normalized.slice(0, maxLength) : null
}

function validateContractorRole(role: string | undefined, custom: string | undefined): { role: ContractorRole; custom: string | null } | null {
  if (!role || !isContractorRole(role)) return null
  const normalizedCustom = normalizedOptional(custom, 150)
  if (role === "other" && !normalizedCustom) return null
  return { role, custom: role === "other" ? normalizedCustom : null }
}

function validateExternalContact(input: AddParticipantInput | EditContractorInput): string | null {
  const companyName = input.companyName?.trim() || ""
  if (!companyName) return "Enter the contractor company name."
  if (companyName.length > 160) return "Company name must be 160 characters or fewer."
  if ((input.contactPerson?.trim().length ?? 0) > 160) return "Contact person must be 160 characters or fewer."
  const email = input.email?.trim() || ""
  if (email && !EMAIL_PATTERN.test(email)) return "Enter a valid email address."
  if (email.length > 254) return "Email must be 254 characters or fewer."
  if ((input.phone?.trim().length ?? 0) > 50) return "Phone must be 50 characters or fewer."
  return null
}

async function nextSortOrder(admin: ReturnType<typeof createAdminClient>, projectId: string): Promise<number> {
  const { data, error } = await admin
    .from("project_participants")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return Math.max(50, Number(data?.sort_order ?? 40) + 10)
}

async function ensureContractorProjectAccess({
  admin,
  projectId,
  organizationId,
  userId,
  actorId,
}: {
  admin: ReturnType<typeof createAdminClient>
  projectId: string
  organizationId: string
  userId: string
  actorId: string
}): Promise<string | null> {
  const { data: existingUserMembership, error: existingUserMembershipError } = await admin
    .from("project_user_memberships")
    .select("id")
    .eq("project_id", projectId)
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle()
  if (existingUserMembershipError) throw existingUserMembershipError
  if (existingUserMembership) return null

  const { data: createdMembership, error: membershipInsertError } = await admin
    .from("project_user_memberships")
    .insert({
      project_id: projectId,
      organization_id: organizationId,
      user_id: userId,
      access_role: "contributor",
      status: "active",
      created_by: actorId,
    })
    .select("id")
    .single()
  if (membershipInsertError) throw membershipInsertError
  return createdMembership.id as string
}

function revalidateParticipantViews(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/projects")
  revalidatePath("/users")
}

export async function addProjectParticipantAction(input: AddParticipantInput): Promise<ProjectParticipantActionResult> {
  if (!UUID_PATTERN.test(input.projectId)) return { ok: false, error: "Select a valid project." }
  if (!isAddParticipantType(input.participantType)) return { ok: false, error: "Select a valid participant type." }

  const mappedRole = storageRole(input.participantType, input.participantRole)
  if (!mappedRole) return { ok: false, error: "Select a valid participant role." }

  const contractor = input.participantType === "contractor"
    ? validateContractorRole(input.contractorRole, input.customContractorType)
    : null
  if (input.participantType === "contractor" && !contractor) {
    return { ok: false, error: input.contractorRole === "other" ? "Enter the custom contractor type." : "Select a contractor role." }
  }

  if (input.source === "external_contact" && input.participantType !== "contractor") {
    return { ok: false, error: "External contacts can currently be added only as Contractors." }
  }
  if (input.source === "external_contact") {
    const externalError = validateExternalContact(input)
    if (externalError) return { ok: false, error: externalError }
  } else if (!input.userId || !UUID_PATTERN.test(input.userId)) {
    return { ok: false, error: "Select a valid registered user." }
  }

  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const sortOrder = await nextSortOrder(admin, input.projectId)

    if (input.source === "external_contact") {
      const companyName = input.companyName!.trim()
      const contactPerson = normalizedOptional(input.contactPerson, 160)
      const email = normalizedOptional(input.email, 254)
      const phone = normalizedOptional(input.phone, 50)

      const { error: insertError } = await admin.from("project_participants").insert({
        project_id: input.projectId,
        organization_id: null,
        organization_name: companyName,
        participant_type: "contractor",
        project_role: "contractor",
        participant_role_label: "Contractor",
        contractor_role: contractor!.role,
        contractor_role_other: contractor!.custom,
        key_contact_user_id: null,
        key_contact_name: contactPerson,
        key_contact_email: email,
        key_contact_phone: phone,
        status: "active",
        source_key: `external-contractor:${randomUUID()}`,
        sort_order: sortOrder,
        created_by: actorId,
      })
      if (insertError) throw insertError

      await audit({
        actorId,
        action: "project_participant.added",
        entityType: "project_participant",
        projectId: input.projectId,
        metadata: { participantType: "contractor", source: "external_contact", companyName, contractorRole: contractor!.role },
      })
      revalidateParticipantViews(input.projectId)
      return { ok: true }
    }

    const userId = input.userId!
    const [{ data: project, error: projectError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from("projects").select("id, supervising_organization_id").eq("id", input.projectId).maybeSingle(),
      admin.from("profiles").select("id, full_name, email").eq("id", userId).maybeSingle(),
    ])
    if (projectError) throw projectError
    if (profileError) throw profileError
    if (!project) return { ok: false, error: "Project not found." }
    if (!profile) return { ok: false, error: "The selected user is no longer registered." }

    const [{ data: memberships, error: membershipError }, { data: projectOrganizations, error: projectOrganizationsError }] = await Promise.all([
      admin.from("organization_memberships").select("organization_id, role").eq("user_id", userId).eq("status", "active"),
      admin.from("project_organization_memberships").select("organization_id").eq("project_id", input.projectId).eq("status", "active"),
    ])
    if (membershipError) throw membershipError
    if (projectOrganizationsError) throw projectOrganizationsError
    if (!memberships?.length) return { ok: false, error: "Only registered users with an active platform role can be added." }

    const projectOrganizationIds = new Set<string>([
      project.supervising_organization_id,
      ...((projectOrganizations ?? []) as Array<{ organization_id: string }>).map((row) => row.organization_id),
    ])
    const selectedMembership = [...memberships].sort((a, b) => {
      const aRelated = projectOrganizationIds.has(a.organization_id as string) ? 0 : 1
      const bRelated = projectOrganizationIds.has(b.organization_id as string) ? 0 : 1
      return aRelated - bRelated || membershipPriority(a.role as string) - membershipPriority(b.role as string)
    })[0]

    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .select("id, name")
      .eq("id", selectedMembership.organization_id)
      .maybeSingle()
    if (organizationError) throw organizationError
    if (!organization) return { ok: false, error: "The selected user's organization could not be found." }

    const { data: existingParticipant, error: duplicateError } = await admin
      .from("project_participants")
      .select("id, status")
      .eq("project_id", input.projectId)
      .eq("source_key", `user:${userId}`)
      .maybeSingle()
    if (duplicateError) throw duplicateError
    if (existingParticipant?.status === "active") return { ok: false, error: "This user is already a project participant." }

    let createdAccessMembershipId: string | null = null
    if (input.participantType === "contractor") {
      createdAccessMembershipId = await ensureContractorProjectAccess({
        admin,
        projectId: input.projectId,
        organizationId: organization.id,
        userId: profile.id,
        actorId,
      })
    }

    const contactName = profile.full_name?.trim() || profile.email?.trim() || "Platform user"
    const participantPayload = {
      organization_id: organization.id,
      organization_name: organization.name,
      participant_type: mappedRole.participantType,
      project_role: mappedRole.projectRole,
      participant_role_label: mappedRole.label,
      contractor_role: contractor?.role ?? null,
      contractor_role_other: contractor?.custom ?? null,
      access_membership_id: createdAccessMembershipId,
      key_contact_user_id: profile.id,
      key_contact_name: contactName,
      key_contact_email: profile.email?.trim() || null,
      key_contact_phone: null,
      status: "active",
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    }
    const participantWrite = existingParticipant
      ? admin.from("project_participants").update(participantPayload).eq("id", existingParticipant.id).eq("project_id", input.projectId)
      : admin.from("project_participants").insert({
          project_id: input.projectId,
          ...participantPayload,
          source_key: `user:${profile.id}`,
          created_by: actorId,
        })
    const { error: insertError } = await participantWrite
    if (insertError) {
      if (createdAccessMembershipId) {
        await admin.from("project_user_memberships").delete().eq("id", createdAccessMembershipId)
      }
      if (insertError.code === "23505") return { ok: false, error: "This user is already a project participant." }
      throw insertError
    }

    await audit({
      actorId,
      action: "project_participant.added",
      entityType: "project_participant",
      organizationId: organization.id,
      projectId: input.projectId,
      metadata: {
        userId: profile.id,
        participantType: input.participantType,
        participantRole: mappedRole.label,
        contractorRole: contractor?.role ?? null,
      },
    })

    revalidateParticipantViews(input.projectId)
    return { ok: true }
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to add the project participant." }
  }
}

export async function editProjectContractorAction(input: EditContractorInput): Promise<ProjectParticipantActionResult> {
  if (!UUID_PATTERN.test(input.projectId) || !UUID_PATTERN.test(input.participantId)) {
    return { ok: false, error: "The selected contractor is invalid." }
  }
  const contractor = validateContractorRole(input.contractorRole, input.customContractorType)
  if (!contractor) {
    return { ok: false, error: input.contractorRole === "other" ? "Enter the custom contractor type." : "Select a contractor role." }
  }

  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { data: participant, error: participantError } = await admin
      .from("project_participants")
      .select("id, key_contact_user_id, organization_id, participant_type")
      .eq("id", input.participantId)
      .eq("project_id", input.projectId)
      .eq("status", "active")
      .maybeSingle()
    if (participantError) throw participantError
    if (!participant || !["contractor", "subcontractor"].includes(participant.participant_type as string)) {
      return { ok: false, error: "Contractor not found." }
    }

    const update: Record<string, unknown> = {
      contractor_role: contractor.role,
      contractor_role_other: contractor.custom,
      updated_at: new Date().toISOString(),
    }

    if (!participant.key_contact_user_id) {
      const externalError = validateExternalContact(input)
      if (externalError) return { ok: false, error: externalError }
      update.organization_name = input.companyName!.trim()
      update.key_contact_name = normalizedOptional(input.contactPerson, 160)
      update.key_contact_email = normalizedOptional(input.email, 254)
      update.key_contact_phone = normalizedOptional(input.phone, 50)
    }

    const { error: updateError } = await admin
      .from("project_participants")
      .update(update)
      .eq("id", input.participantId)
      .eq("project_id", input.projectId)
    if (updateError) throw updateError

    await audit({
      actorId,
      action: "project_participant.updated",
      entityType: "project_participant",
      organizationId: participant.organization_id ?? undefined,
      projectId: input.projectId,
      metadata: { participantId: input.participantId, contractorRole: contractor.role },
    })
    revalidateParticipantViews(input.projectId)
    return { ok: true }
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to update the contractor." }
  }
}

export async function removeProjectParticipantAction(input: {
  projectId: string
  participantId: string
}): Promise<ProjectParticipantActionResult> {
  if (!UUID_PATTERN.test(input.projectId) || !UUID_PATTERN.test(input.participantId)) {
    return { ok: false, error: "The selected participant is invalid." }
  }

  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { data: participant, error: participantError } = await admin
      .from("project_participants")
      .select("id, organization_id, key_contact_user_id, access_membership_id, source_key")
      .eq("id", input.participantId)
      .eq("project_id", input.projectId)
      .eq("status", "active")
      .maybeSingle()
    if (participantError) throw participantError
    if (!participant) return { ok: false, error: "Participant not found." }
    if (participant.source_key === "consultant") {
      return { ok: false, error: "The supervising consultant is managed through Edit Project and cannot be removed here." }
    }

    const { error: updateError } = await admin
      .from("project_participants")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", input.participantId)
      .eq("project_id", input.projectId)
    if (updateError) throw updateError

    if (participant.source_key === "contractor") {
      const { error: projectUpdateError } = await admin
        .from("projects")
        .update({
          contractor: null,
          contractor_organization_id: null,
          contractor_registration_number: null,
          contractor_address: null,
          contractor_postal_code: null,
          contractor_phone: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.projectId)
      if (projectUpdateError) throw projectUpdateError

      if (participant.organization_id) {
        const { data: anotherContractor, error: contractorLookupError } = await admin
          .from("project_participants")
          .select("id")
          .eq("project_id", input.projectId)
          .eq("organization_id", participant.organization_id)
          .eq("status", "active")
          .in("participant_type", ["contractor", "subcontractor"])
          .limit(1)
          .maybeSingle()
        if (contractorLookupError) throw contractorLookupError
        if (!anotherContractor) {
          const { error: organizationAccessError } = await admin
            .from("project_organization_memberships")
            .update({ status: "inactive", updated_at: new Date().toISOString() })
            .eq("project_id", input.projectId)
            .eq("organization_id", participant.organization_id)
            .eq("project_role", "contractor")
            .eq("status", "active")
          if (organizationAccessError) throw organizationAccessError
        }
      }
    }

    if (participant.access_membership_id) {
      const { error: membershipError } = await admin
        .from("project_user_memberships")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("id", participant.access_membership_id)
        .eq("project_id", input.projectId)
      if (membershipError) throw membershipError
    }

    await audit({
      actorId,
      action: "project_participant.removed",
      entityType: "project_participant",
      organizationId: participant.organization_id ?? undefined,
      projectId: input.projectId,
      metadata: { participantId: input.participantId, userId: participant.key_contact_user_id ?? null },
    })
    revalidateParticipantViews(input.projectId)
    return { ok: true }
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to remove the project participant." }
  }
}
