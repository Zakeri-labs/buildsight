"use server"

import { revalidatePath } from "next/cache"
import { assertProjectAdmin, audit, AuthzError } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAddParticipantRole, type AddParticipantRole } from "@/lib/projects/project-participant-types"
import type { ProjectOrgRole } from "@/lib/db/types"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type AddParticipantInput = {
  projectId: string
  userId: string
  participantRole: string
}

export type AddParticipantResult = { ok: true } | { ok: false; error: string }

type ParticipantStorageRole = {
  participantType: "client" | "contractor" | "consultancy" | "subcontractor" | "government" | "supplier" | "third_party"
  projectRole: ProjectOrgRole
}

function storageRole(role: AddParticipantRole): ParticipantStorageRole {
  switch (role) {
    case "Client / Owner":
      return { participantType: "client", projectRole: "client" }
    case "Contractor":
      return { participantType: "contractor", projectRole: "contractor" }
    case "Supplier":
      return { participantType: "supplier", projectRole: "supplier" }
    case "Subcontractor":
      return { participantType: "subcontractor", projectRole: "subcontractor" }
    case "Other":
      return { participantType: "third_party", projectRole: "third_party" }
    default:
      return { participantType: "consultancy", projectRole: "consultant" }
  }
}

function membershipPriority(role: string): number {
  return role === "org_admin" ? 0 : role === "org_manager" ? 1 : role === "org_member" ? 2 : 3
}

export async function addProjectParticipantAction(input: AddParticipantInput): Promise<AddParticipantResult> {
  if (!UUID_PATTERN.test(input.projectId) || !UUID_PATTERN.test(input.userId)) {
    return { ok: false, error: "Select a valid registered user." }
  }
  if (!isAddParticipantRole(input.participantRole)) {
    return { ok: false, error: "Select a valid participant role." }
  }

  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()

    const [{ data: project, error: projectError }, { data: profile, error: profileError }] = await Promise.all([
      admin.from("projects").select("id, supervising_organization_id").eq("id", input.projectId).maybeSingle(),
      admin.from("profiles").select("id, full_name, email").eq("id", input.userId).maybeSingle(),
    ])
    if (projectError) throw projectError
    if (profileError) throw profileError
    if (!project) return { ok: false, error: "Project not found." }
    if (!profile) return { ok: false, error: "The selected user is no longer registered." }

    const [{ data: memberships, error: membershipError }, { data: projectOrganizations, error: projectOrganizationsError }] = await Promise.all([
      admin.from("organization_memberships").select("organization_id, role").eq("user_id", input.userId).eq("status", "active"),
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

    const { data: duplicate, error: duplicateError } = await admin
      .from("project_participants")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("key_contact_user_id", input.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
    if (duplicateError) throw duplicateError
    if (duplicate) return { ok: false, error: "This user is already a project participant." }

    const { data: lastParticipant, error: sortError } = await admin
      .from("project_participants")
      .select("sort_order")
      .eq("project_id", input.projectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (sortError) throw sortError

    const mappedRole = storageRole(input.participantRole)
    const contactName = profile.full_name?.trim() || profile.email?.trim() || "Platform user"
    const { error: insertError } = await admin.from("project_participants").insert({
      project_id: input.projectId,
      organization_id: organization.id,
      organization_name: organization.name,
      participant_type: mappedRole.participantType,
      project_role: mappedRole.projectRole,
      participant_role_label: input.participantRole,
      key_contact_user_id: profile.id,
      key_contact_name: contactName,
      key_contact_email: profile.email?.trim() || null,
      key_contact_phone: null,
      status: "active",
      source_key: `user:${profile.id}`,
      sort_order: Math.max(50, Number(lastParticipant?.sort_order ?? 40) + 10),
      created_by: actorId,
    })
    if (insertError) {
      if (insertError.code === "23505") return { ok: false, error: "This user is already a project participant." }
      throw insertError
    }

    await audit({
      actorId,
      action: "project_participant.added",
      entityType: "project_participant",
      organizationId: organization.id,
      projectId: input.projectId,
      metadata: { userId: profile.id, participantRole: input.participantRole },
    })

    revalidatePath(`/projects/${input.projectId}`)
    return { ok: true }
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to add the project participant." }
  }
}
