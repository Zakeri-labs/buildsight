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
import { isProjectSupervisorOrganizationRole } from "@/lib/projects/supervisor-candidates"
import { setProjectSupervisorAssignment } from "@/lib/projects/supervisor-assignment"

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

export type ProjectParticipantActionResult = { ok: true; ownerId?: string } | { ok: false; error: string }

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

function validateExternalClient(input: AddParticipantInput): string | null {
  const clientName = input.companyName?.trim() || ""
  if (!clientName || clientName.length < 2) return "Enter a valid client name (at least 2 characters)."
  if (clientName.length > 160) return "Client name must be 160 characters or fewer."
  if ((input.contactPerson?.trim().length ?? 0) > 160) return "Contact name must be 160 characters or fewer."
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

  if (input.source === "external_contact" && input.participantType !== "contractor" && input.participantType !== "client") {
    return { ok: false, error: "External contacts can currently be added only as Contractors or Clients." }
  }
  if (input.source === "external_contact") {
    const externalError = input.participantType === "client"
      ? validateExternalClient(input)
      : validateExternalContact(input)
    if (externalError) return { ok: false, error: externalError }
  } else if (!input.userId || !UUID_PATTERN.test(input.userId)) {
    return { ok: false, error: "Select a valid registered user." }
  }

  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const sortOrder = await nextSortOrder(admin, input.projectId)

    if (input.source === "external_contact") {
      if (input.participantType === "client") {
        const [{ data: project, error: projectError }, { data: ownerRows, error: ownerRowsError }] = await Promise.all([
          admin.from("projects").select("id, supervising_organization_id").eq("id", input.projectId).maybeSingle(),
          admin
            .from("project_owners")
            .select("id, owner_order, name, contact_name, contact_email, contact_phone, viewer_user_id")
            .eq("project_id", input.projectId)
            .order("owner_order", { ascending: true })
            .order("created_at", { ascending: true }),
        ])
        if (projectError) throw projectError
        if (ownerRowsError) throw ownerRowsError
        if (!project) return { ok: false, error: "Project not found." }

        if ((ownerRows ?? []).length >= 10) {
          return { ok: false, error: "A project can have up to 10 owners." }
        }

        const usedOwnerOrders = new Set((ownerRows ?? []).map((owner) => Number(owner.owner_order)))
        const ownerOrder = Array.from({ length: 10 }, (_, index) => index + 1).find((order) => !usedOwnerOrders.has(order)) ?? 0
        if (!ownerOrder) return { ok: false, error: "A project can have up to 10 owners." }

        const clientName = input.companyName!.trim()
        const contactPerson = normalizedOptional(input.contactPerson, 160)
        const email = normalizedOptional(input.email?.toLowerCase(), 254)
        const phone = normalizedOptional(input.phone, 50)

        const { data: createdOwner, error: ownerInsertError } = await admin
          .from("project_owners")
          .insert({
            project_id: input.projectId,
            owner_order: ownerOrder,
            name: clientName,
            contact_name: contactPerson,
            contact_email: email,
            contact_phone: phone,
            viewer_user_id: null,
            viewer_invitation_id: null,
          })
          .select("id")
          .single()
        if (ownerInsertError) throw ownerInsertError

        const ownerSourceKey = `owner:${createdOwner.id}`
        const { error: insertError } = await admin.from("project_participants").insert({
          project_id: input.projectId,
          organization_id: null,
          organization_name: clientName,
          participant_type: "client",
          project_role: "client",
          participant_role_label: "Client / Owner",
          contractor_role: null,
          contractor_role_other: null,
          access_membership_id: null,
          key_contact_user_id: null,
          key_contact_name: contactPerson || clientName,
          key_contact_email: email,
          key_contact_phone: phone,
          status: "active",
          source_key: ownerSourceKey,
          sort_order: 20 + ownerOrder,
          created_by: actorId,
        })

        if (insertError) {
          await admin.from("project_owners").delete().eq("id", createdOwner.id).eq("project_id", input.projectId)
          throw insertError
        }

        await audit({
          actorId,
          action: "project_owner.added",
          entityType: "project_owner",
          entityId: createdOwner.id,
          organizationId: project.supervising_organization_id,
          projectId: input.projectId,
          metadata: {
            name: clientName,
            ownerOrder,
            source: "manual_external_client",
          },
        })

        revalidateParticipantViews(input.projectId)
        return { ok: true, ownerId: createdOwner.id }
      }

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
      admin.from("projects").select("id, supervising_organization_id, assigned_supervisor_id").eq("id", input.projectId).maybeSingle(),
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

    if (input.participantType === "client") {
      // Client / Owner access is canonicalized through project_owners.viewer_user_id.
      // A project_participants row is only the display/contact projection and must
      // never be the authorization-bearing relationship for a Viewer.
      const viewerMembership = memberships.find(
        (membership) =>
          membership.organization_id === project.supervising_organization_id &&
          membership.role === "viewer",
      )
      if (!viewerMembership) {
        return {
          ok: false,
          error: "Select an active Viewer from the supervising organization as the Project Owner / Client.",
        }
      }

      const contactName = profile.full_name?.trim() || profile.email?.trim() || "Project Owner"
      const contactEmail = profile.email?.trim() || null
      const { data: ownerRows, error: ownerRowsError } = await admin
        .from("project_owners")
        .select("id, owner_order, name, contact_name, contact_email, contact_phone, viewer_user_id")
        .eq("project_id", input.projectId)
        .order("owner_order", { ascending: true })
        .order("created_at", { ascending: true })
      if (ownerRowsError) throw ownerRowsError

      const existingOwner = (ownerRows ?? []).find((owner) => owner.viewer_user_id === profile.id) ?? null
      let ownerId = existingOwner?.id ?? null
      let ownerOrder = Number(existingOwner?.owner_order ?? 0)
      let ownerWasCreated = false

      if (!ownerId) {
        if ((ownerRows ?? []).length >= 10) {
          return { ok: false, error: "A project can have up to 10 owners." }
        }

        const usedOwnerOrders = new Set((ownerRows ?? []).map((owner) => Number(owner.owner_order)))
        ownerOrder = Array.from({ length: 10 }, (_, index) => index + 1).find((order) => !usedOwnerOrders.has(order)) ?? 0
        if (!ownerOrder) return { ok: false, error: "A project can have up to 10 owners." }

        const { data: createdOwner, error: ownerInsertError } = await admin
          .from("project_owners")
          .insert({
            project_id: input.projectId,
            owner_order: ownerOrder,
            name: contactName,
            contact_name: contactName,
            contact_email: contactEmail,
            contact_phone: null,
            viewer_user_id: profile.id,
            viewer_invitation_id: null,
          })
          .select("id")
          .single()
        if (ownerInsertError) {
          if (ownerInsertError.code === "23505") {
            return { ok: false, error: "This Viewer is already assigned as a Project Owner / Client." }
          }
          throw ownerInsertError
        }
        ownerId = createdOwner.id
        ownerWasCreated = true
      }

      const ownerName = existingOwner?.name?.trim() || contactName
      const ownerContactName = existingOwner?.contact_name?.trim() || contactName
      const ownerContactEmail = existingOwner?.contact_email?.trim() || contactEmail
      const ownerContactPhone = existingOwner?.contact_phone?.trim() || null
      const ownerSourceKey = `owner:${ownerId}`
      const canonicalParticipantPayload = {
        organization_id: null,
        organization_name: ownerName,
        participant_type: "client",
        project_role: "client",
        participant_role_label: "Client / Owner",
        contractor_role: null,
        contractor_role_other: null,
        access_membership_id: null,
        key_contact_user_id: profile.id,
        key_contact_name: ownerContactName,
        key_contact_email: ownerContactEmail,
        key_contact_phone: ownerContactPhone,
        status: "active",
        sort_order: 20 + ownerOrder,
        updated_at: new Date().toISOString(),
      }

      try {
        const { data: canonicalParticipant, error: canonicalParticipantError } = await admin
          .from("project_participants")
          .select("id")
          .eq("project_id", input.projectId)
          .eq("source_key", ownerSourceKey)
          .maybeSingle()
        if (canonicalParticipantError) throw canonicalParticipantError

        if (canonicalParticipant) {
          const { error: participantUpdateError } = await admin
            .from("project_participants")
            .update(canonicalParticipantPayload)
            .eq("id", canonicalParticipant.id)
            .eq("project_id", input.projectId)
          if (participantUpdateError) throw participantUpdateError
        } else {
          // Repair the exact legacy/broken direct-add shape when present: the
          // user was stored as a generic client participant but no Owner row
          // carried the immutable Viewer identity used by authorization.
          const { data: legacyClientParticipant, error: legacyParticipantError } = await admin
            .from("project_participants")
            .select("id")
            .eq("project_id", input.projectId)
            .eq("participant_type", "client")
            .eq("key_contact_user_id", profile.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle()
          if (legacyParticipantError) throw legacyParticipantError

          const participantWrite = legacyClientParticipant
            ? admin
                .from("project_participants")
                .update({ ...canonicalParticipantPayload, source_key: ownerSourceKey })
                .eq("id", legacyClientParticipant.id)
                .eq("project_id", input.projectId)
            : admin.from("project_participants").insert({
                project_id: input.projectId,
                ...canonicalParticipantPayload,
                source_key: ownerSourceKey,
                created_by: actorId,
              })
          const { error: participantWriteError } = await participantWrite
          if (participantWriteError) throw participantWriteError
        }
      } catch (participantError) {
        if (ownerWasCreated && ownerId) {
          await admin.from("project_owners").delete().eq("id", ownerId).eq("project_id", input.projectId)
        }
        throw participantError
      }

      await audit({
        actorId,
        action: ownerWasCreated ? "project_owner.added" : "project_owner.synced",
        entityType: "project_owner",
        entityId: ownerId,
        organizationId: project.supervising_organization_id,
        projectId: input.projectId,
        metadata: {
          viewerUserId: profile.id,
          ownerOrder,
          source: "direct_client_assignment",
        },
      })

      revalidateParticipantViews(input.projectId)
      return { ok: true }
    }

    if (input.participantType === "supervisor" || mappedRole.label === "Supervisor") {
      const supervisorMembership = memberships.find(
        (membership) =>
          membership.organization_id === project.supervising_organization_id &&
          isProjectSupervisorOrganizationRole(membership.role),
      )
      if (!supervisorMembership) {
        return { ok: false, error: "Select an active Admin, Manager, or Member from the supervising organization as Project Supervisor." }
      }

      if (!project.assigned_supervisor_id) {
        await admin.from("projects").update({ assigned_supervisor_id: profile.id, updated_at: new Date().toISOString() }).eq("id", input.projectId)
      }
    }

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

    const roleSlug = mappedRole.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const targetSourceKey = `user:${userId}:${roleSlug}`

    const { data: existingUserRoleParticipants, error: duplicateError } = await admin
      .from("project_participants")
      .select("id, status, participant_role_label")
      .eq("project_id", input.projectId)
      .eq("key_contact_user_id", userId)
      .eq("status", "active")

    if (duplicateError) throw duplicateError

    const isDuplicate = (existingUserRoleParticipants ?? []).some(
      (row) =>
        row.participant_role_label === mappedRole.label ||
        (!row.participant_role_label && mappedRole.label === "Supervisor"),
    )

    if (isDuplicate) {
      return { ok: false, error: `This user is already assigned as a ${mappedRole.label}.` }
    }

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
    const participantWrite = admin.from("project_participants").insert({
      project_id: input.projectId,
      ...participantPayload,
      source_key: targetSourceKey,
      created_by: actorId,
    })
    const { error: insertError } = await participantWrite
    if (insertError) {
      if (createdAccessMembershipId) {
        await admin.from("project_user_memberships").delete().eq("id", createdAccessMembershipId)
      }
      if (insertError.code === "23505") return { ok: false, error: `This user is already assigned as a ${mappedRole.label}.` }
      throw insertError
    }

    if (project.assigned_supervisor_id && project.assigned_supervisor_id !== profile.id) {
      const { data: existingPrimaryParticipant } = await admin
        .from("project_participants")
        .select("id")
        .eq("project_id", input.projectId)
        .eq("key_contact_user_id", project.assigned_supervisor_id)
        .limit(1)
        .maybeSingle()

      if (!existingPrimaryParticipant) {
        const { data: primaryProfile } = await admin
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", project.assigned_supervisor_id)
          .maybeSingle()

        if (primaryProfile) {
          const primaryName = primaryProfile.full_name?.trim() || primaryProfile.email?.trim() || "Supervisor"
          await admin.from("project_participants").insert({
            project_id: input.projectId,
            organization_id: project.supervising_organization_id,
            organization_name: organization.name,
            participant_type: "consultancy",
            project_role: "consultant",
            participant_role_label: "Supervisor",
            key_contact_user_id: primaryProfile.id,
            key_contact_name: primaryName,
            key_contact_email: primaryProfile.email?.trim() || null,
            status: "active",
            source_key: `user:${primaryProfile.id}:supervisor`,
            sort_order: sortOrder - 1,
            created_by: actorId,
          }).then(() => undefined, () => undefined)
        }
      }
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
    revalidatePath("/calendar")
    return { ok: true }
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to add the project participant." }
  }
}

export type EditExternalParticipantInput = {
  projectId: string
  participantId: string
  companyName: string
  contactPerson?: string
  email?: string
  phone?: string
  contractorRole?: string
  customContractorType?: string
}

export async function editExternalParticipantAction(input: EditExternalParticipantInput): Promise<ProjectParticipantActionResult> {
  if (!UUID_PATTERN.test(input.projectId) || !UUID_PATTERN.test(input.participantId)) {
    return { ok: false, error: "The selected participant is invalid." }
  }

  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { data: participant, error: participantError } = await admin
      .from("project_participants")
      .select("id, key_contact_user_id, organization_id, participant_type, source_key")
      .eq("id", input.participantId)
      .eq("project_id", input.projectId)
      .eq("status", "active")
      .maybeSingle()
    if (participantError) throw participantError
    if (!participant) {
      return { ok: false, error: "Participant not found." }
    }

    if (participant.key_contact_user_id) {
      return { ok: false, error: "Registered users cannot be edited here. Profile details are managed on their user profile." }
    }

    const isClient = participant.participant_type === "client" || participant.source_key?.startsWith("owner:")
    const isContractor = ["contractor", "subcontractor"].includes(participant.participant_type as string)

    if (isClient) {
      const externalError = validateExternalClient({
        projectId: input.projectId,
        participantType: "client",
        source: "external_contact",
        companyName: input.companyName,
        contactPerson: input.contactPerson,
        email: input.email,
        phone: input.phone,
      })
      if (externalError) return { ok: false, error: externalError }

      const clientName = input.companyName.trim()
      const contactPerson = normalizedOptional(input.contactPerson, 160)
      const email = normalizedOptional(input.email?.toLowerCase(), 254)
      const phone = normalizedOptional(input.phone, 50)

      const { error: updateError } = await admin
        .from("project_participants")
        .update({
          organization_name: clientName,
          key_contact_name: contactPerson || clientName,
          key_contact_email: email,
          key_contact_phone: phone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.participantId)
        .eq("project_id", input.projectId)
      if (updateError) throw updateError

      let ownerId: string | undefined = undefined
      if (participant.source_key?.startsWith("owner:")) {
        ownerId = participant.source_key.replace("owner:", "")
        const { error: ownerUpdateError } = await admin
          .from("project_owners")
          .update({
            name: clientName,
            contact_name: contactPerson,
            contact_email: email,
            contact_phone: phone,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ownerId)
          .eq("project_id", input.projectId)
        if (ownerUpdateError) throw ownerUpdateError
      }

      await audit({
        actorId,
        action: "project_participant.updated",
        entityType: "project_participant",
        projectId: input.projectId,
        metadata: { participantId: input.participantId, participantType: "client", name: clientName },
      })

      revalidateParticipantViews(input.projectId)
      return { ok: true, ownerId }
    }

    if (isContractor) {
      const contractor = validateContractorRole(input.contractorRole, input.customContractorType)
      if (!contractor) {
        return { ok: false, error: input.contractorRole === "other" ? "Enter the custom contractor type." : "Select a contractor role." }
      }

      const externalError = validateExternalContact(input)
      if (externalError) return { ok: false, error: externalError }

      const companyName = input.companyName.trim()
      const contactPerson = normalizedOptional(input.contactPerson, 160)
      const email = normalizedOptional(input.email, 254)
      const phone = normalizedOptional(input.phone, 50)

      const { error: updateError } = await admin
        .from("project_participants")
        .update({
          organization_name: companyName,
          key_contact_name: contactPerson,
          key_contact_email: email,
          key_contact_phone: phone,
          contractor_role: contractor.role,
          contractor_role_other: contractor.custom,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.participantId)
        .eq("project_id", input.projectId)
      if (updateError) throw updateError

      await audit({
        actorId,
        action: "project_participant.updated",
        entityType: "project_participant",
        projectId: input.projectId,
        metadata: { participantId: input.participantId, contractorRole: contractor.role, companyName },
      })

      revalidateParticipantViews(input.projectId)
      return { ok: true }
    }

    return { ok: false, error: "This participant type cannot be edited." }
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to update the participant." }
  }
}

export async function editProjectContractorAction(input: EditContractorInput): Promise<ProjectParticipantActionResult> {
  return editExternalParticipantAction(input)
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
      const { data: otherSupervisors } = await admin
        .from("project_participants")
        .select("id")
        .eq("project_id", input.projectId)
        .eq("status", "active")
        .not("id", "eq", input.participantId)
        .in("participant_type", ["consultancy", "supervisor"])
        .limit(1)

      if (!otherSupervisors || otherSupervisors.length === 0) {
        return { ok: false, error: "Projects must have at least one Supervisor. Add another Supervisor before removing this one." }
      }
    }

    const { error: updateError } = await admin
      .from("project_participants")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("id", input.participantId)
      .eq("project_id", input.projectId)
    if (updateError) throw updateError

    if (participant.source_key.startsWith("owner:")) {
      const ownerId = participant.source_key.replace("owner:", "")
      await admin.from("project_owners").delete().eq("id", ownerId).eq("project_id", input.projectId)
    } else if (participant.key_contact_user_id) {
      await admin.from("project_owners").delete().eq("viewer_user_id", participant.key_contact_user_id).eq("project_id", input.projectId)
    }

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

    if (participant.key_contact_user_id) {
      const { data: project } = await admin
        .from("projects")
        .select("assigned_supervisor_id")
        .eq("id", input.projectId)
        .maybeSingle()

      if (project?.assigned_supervisor_id === participant.key_contact_user_id) {
        const { data: nextSupervisor } = await admin
          .from("project_participants")
          .select("key_contact_user_id")
          .eq("project_id", input.projectId)
          .eq("status", "active")
          .in("participant_type", ["consultancy", "supervisor"])
          .not("key_contact_user_id", "is", null)
          .limit(1)
          .maybeSingle()

        await admin
          .from("projects")
          .update({ assigned_supervisor_id: nextSupervisor?.key_contact_user_id ?? null })
          .eq("id", input.projectId)
      }
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
    revalidatePath("/calendar")
    return { ok: true }
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to remove the project participant." }
  }
}
