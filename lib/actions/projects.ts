"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertOrgAdmin, assertProjectAdmin, audit, AuthzError } from "@/lib/auth/guards"
import { createInvitation } from "@/lib/actions/invitations"
import { createOrganization } from "@/lib/actions/organizations"
import type { ProjectAccessRole, ProjectOrgRole } from "@/lib/db/types"
import { PROJECT_ACCESS_ROLES, PROJECT_ORG_ROLES } from "@/lib/db/types"
import type { ActionResult } from "@/lib/actions/invitations"
import { coordinateLabel } from "@/lib/locations/types"
import { SELECTED_PROJECT_COOKIE } from "@/lib/project-scope"
import { isProjectTypeValue, isSupervisionTypeValue } from "@/lib/projects/project-options"
import { validateOwnerIdCardFile } from "@/lib/projects/owner-id-card"

function normalizeProjectCoordinates(latitude?: number | null, longitude?: number | null) {
  const hasLatitude = latitude != null
  const hasLongitude = longitude != null
  if (hasLatitude !== hasLongitude) {
    return { ok: false as const, error: "Latitude and longitude must be provided together." }
  }
  if (!hasLatitude || !hasLongitude) {
    return { ok: true as const, latitude: null, longitude: null }
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false as const, error: "Invalid project coordinates." }
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false as const, error: "Project coordinates are outside the valid range." }
  }
  return { ok: true as const, latitude, longitude }
}

export async function updateProject(input: {
  projectId: string
  name: string
  code?: string
  location?: string
  latitude?: number | null
  longitude?: number | null
}): Promise<ActionResult> {
  try {
    const name = input.name.trim()
    if (name.length < 2) return { ok: false, error: "Project name is too short." }
    const coordinates = normalizeProjectCoordinates(input.latitude, input.longitude)
    if (!coordinates.ok) return { ok: false, error: coordinates.error }
    const location =
      input.location?.trim() ||
      (coordinates.latitude != null && coordinates.longitude != null
        ? coordinateLabel(coordinates.latitude, coordinates.longitude)
        : null)
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()

    const { data: project, error: lookupError } = await admin
      .from("projects")
      .select("supervising_organization_id")
      .eq("id", input.projectId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!project) return { ok: false, error: "Project not found." }

    const { error } = await admin
      .from("projects")
      .update({
        name,
        code: input.code?.trim() || null,
        location,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.projectId)
    if (error) throw error

    await audit({
      actorId,
      action: "project.updated",
      entityType: "project",
      entityId: input.projectId,
      organizationId: project.supervising_organization_id,
      projectId: input.projectId,
      metadata: { name },
    })
    revalidatePath("/users")
    revalidatePath("/projects")
    revalidatePath(`/projects/${input.projectId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not update project." }
  }
}

/** Create a project owned (supervised) by the caller's supervising org. */
export async function createProject(input: {
  supervisingOrgId: string
  name: string
  code?: string
  projectType?: string
  supervisionType?: string
  region?: string
  description?: string
  location?: string
  latitude?: number | null
  longitude?: number | null
  assignedUserId?: string | null
  assignedSupervisorId?: string | null
  owners?: Array<{
    name: string
    contactName?: string
    contactEmail?: string
    contactPhone?: string
  }>
  contractor?: {
    organizationId?: string | null
    companyName?: string
    registrationNumber?: string
    address?: string
    postalCode?: string
    phone?: string
  }
}): Promise<ActionResult<{ id: string; ownerIds: string[] }>> {
  let createdProjectId: string | null = null
  try {
    const name = input.name.trim()
    if (name.length < 2) return { ok: false, error: "Project name is too short." }
    if (input.projectType && !isProjectTypeValue(input.projectType)) {
      return { ok: false, error: "Select a valid project type." }
    }
    if (input.supervisionType && !isSupervisionTypeValue(input.supervisionType)) {
      return { ok: false, error: "Select a valid supervision type." }
    }

    const owners = (input.owners ?? []).map((owner) => ({
      name: owner.name.trim(),
      contactName: owner.contactName?.trim() || null,
      contactEmail: owner.contactEmail?.trim().toLowerCase() || null,
      contactPhone: owner.contactPhone?.trim() || null,
    }))
    if (owners.length > 10) return { ok: false, error: "A project can have up to 10 owners during creation." }
    if (owners.some((owner) => owner.name.length < 2)) {
      return { ok: false, error: "Enter a valid name for every owner." }
    }
    if (owners.some((owner) => owner.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.contactEmail))) {
      return { ok: false, error: "Enter a valid owner email address." }
    }

    const coordinates = normalizeProjectCoordinates(input.latitude, input.longitude)
    if (!coordinates.ok) return { ok: false, error: coordinates.error }
    const location =
      input.location?.trim() ||
      (coordinates.latitude != null && coordinates.longitude != null
        ? coordinateLabel(coordinates.latitude, coordinates.longitude)
        : null)
    const actorId = await assertOrgAdmin(input.supervisingOrgId)
    const admin = createAdminClient()

    const { data: org } = await admin
      .from("organizations")
      .select("type")
      .eq("id", input.supervisingOrgId)
      .maybeSingle()
    if (org?.type !== "supervising") {
      return { ok: false, error: "Only a supervising organization can create projects." }
    }

    const assignedUserId = input.assignedUserId?.trim() || null
    const assignedSupervisorId = input.assignedSupervisorId?.trim() || null
    const requestedAssigneeIds = Array.from(
      new Set([assignedUserId, assignedSupervisorId].filter((value): value is string => Boolean(value))),
    )
    if (requestedAssigneeIds.length) {
      const { data: assigneeMemberships, error: assigneeMembershipError } = await admin
        .from("organization_memberships")
        .select("user_id, role")
        .eq("organization_id", input.supervisingOrgId)
        .eq("status", "active")
        .in("user_id", requestedAssigneeIds)
      if (assigneeMembershipError) throw assigneeMembershipError

      const membershipByUser = new Map(
        (assigneeMemberships ?? []).map((membership) => [membership.user_id, membership.role] as const),
      )
      if (requestedAssigneeIds.some((userId) => !membershipByUser.has(userId))) {
        return { ok: false, error: "One of the selected project users is no longer available." }
      }
      if (
        assignedSupervisorId &&
        !["org_admin", "org_manager"].includes(membershipByUser.get(assignedSupervisorId) ?? "")
      ) {
        return { ok: false, error: "Select an organization administrator or manager as supervisor." }
      }
    }

    const contractorOrganizationId = input.contractor?.organizationId?.trim() || null
    let contractorOrganizationName: string | null = null
    if (contractorOrganizationId) {
      const { data: contractorOrganization, error: contractorLookupError } = await admin
        .from("organizations")
        .select("id, name, type, status")
        .eq("id", contractorOrganizationId)
        .maybeSingle()
      if (contractorLookupError) throw contractorLookupError
      if (!contractorOrganization || contractorOrganization.type !== "external" || contractorOrganization.status === "suspended") {
        return { ok: false, error: "The selected contractor organization is unavailable." }
      }
      contractorOrganizationName = contractorOrganization.name
    }

    const contractorName = contractorOrganizationName || input.contractor?.companyName?.trim() || null
    const { data: created, error } = await admin
      .from("projects")
      .insert({
        name,
        code: input.code?.trim() || null,
        project_type: input.projectType || null,
        supervision_type: input.supervisionType || null,
        region: input.region?.trim() || null,
        description: input.description?.trim() || null,
        location,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        contractor: contractorName,
        client: owners[0]?.name || null,
        contractor_organization_id: contractorOrganizationId,
        contractor_registration_number: input.contractor?.registrationNumber?.trim() || null,
        contractor_address: input.contractor?.address?.trim() || null,
        contractor_postal_code: input.contractor?.postalCode?.trim() || null,
        contractor_phone: input.contractor?.phone?.trim() || null,
        assigned_user_id: assignedUserId,
        assigned_supervisor_id: assignedSupervisorId,
        status: "active",
        supervising_organization_id: input.supervisingOrgId,
        created_by: actorId,
      })
      .select("id")
      .single()
    if (error) throw error
    createdProjectId = created.id

    // The supervising org is itself a participant in every project it creates.
    const { error: supervisingMembershipError } = await admin.from("project_organization_memberships").insert({
      project_id: created.id,
      organization_id: input.supervisingOrgId,
      project_role: "consultant",
      status: "active",
      created_by: actorId,
    })
    if (supervisingMembershipError) throw supervisingMembershipError

    const { error: userMembershipError } = await admin.from("project_user_memberships").insert({
      project_id: created.id,
      user_id: actorId,
      organization_id: input.supervisingOrgId,
      access_role: "project_admin",
      status: "active",
      created_by: actorId,
    })
    if (userMembershipError) throw userMembershipError

    const projectAssignments = new Map<string, "project_manager" | "contributor">()
    if (assignedUserId && assignedUserId !== actorId) {
      projectAssignments.set(assignedUserId, "contributor")
    }
    if (assignedSupervisorId && assignedSupervisorId !== actorId) {
      projectAssignments.set(assignedSupervisorId, "project_manager")
    }
    if (projectAssignments.size) {
      const { error: assignmentMembershipError } = await admin.from("project_user_memberships").insert(
        Array.from(projectAssignments, ([userId, accessRole]) => ({
          project_id: created.id,
          user_id: userId,
          organization_id: input.supervisingOrgId,
          access_role: accessRole,
          status: "active",
          created_by: actorId,
        })),
      )
      if (assignmentMembershipError) throw assignmentMembershipError
    }

    if (contractorOrganizationId && contractorOrganizationId !== input.supervisingOrgId) {
      const { error: contractorMembershipError } = await admin.from("project_organization_memberships").insert({
        project_id: created.id,
        organization_id: contractorOrganizationId,
        project_role: "contractor",
        status: "active",
        created_by: actorId,
      })
      if (contractorMembershipError) throw contractorMembershipError
    }

    let createdOwners: Array<{ id: string; owner_order: number }> = []
    if (owners.length) {
      const { data: ownerRows, error: ownersError } = await admin.from("project_owners").insert(
        owners.map((owner, index) => ({
          project_id: created.id,
          owner_order: index + 1,
          name: owner.name,
          contact_name: owner.contactName,
          contact_email: owner.contactEmail,
          contact_phone: owner.contactPhone,
        })),
      ).select("id, owner_order")
      if (ownersError) throw ownersError
      createdOwners = ownerRows ?? []
    }

    await audit({
      actorId,
      action: "project.created",
      entityType: "project",
      entityId: created.id,
      organizationId: input.supervisingOrgId,
      projectId: created.id,
      metadata: {
        name,
        projectType: input.projectType || null,
        supervisionType: input.supervisionType || null,
        ownerCount: owners.length,
        contractorOrganizationId,
        assignedUserId,
        assignedSupervisorId,
      },
    })

    const cookieStore = await cookies()
    cookieStore.set(SELECTED_PROJECT_COOKIE, created.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    })

    revalidatePath("/", "layout")
    revalidatePath("/users")
    revalidatePath("/projects")
    return {
      ok: true,
      data: {
        id: created.id,
        ownerIds: createdOwners
          .sort((a, b) => a.owner_order - b.owner_order)
          .map((owner) => owner.id),
      },
    }
  } catch (err) {
    if (createdProjectId) {
      try {
        const admin = createAdminClient()
        await admin.from("projects").delete().eq("id", createdProjectId)
      } catch {
        // Preserve the original error if cleanup is unavailable.
      }
    }
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not create project." }
  }
}

export type OwnerIdCardUploadInput = {
  ownerId: string
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
}

export async function attachProjectOwnerIdCards(input: {
  projectId: string
  files: OwnerIdCardUploadInput[]
}): Promise<ActionResult<{ count: number }>> {
  try {
    if (!Array.isArray(input.files) || input.files.length === 0) {
      return { ok: false, error: "Select at least one owner ID card to upload." }
    }
    if (input.files.length > 10) {
      return { ok: false, error: "A project can have up to 10 owner ID cards during creation." }
    }

    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const ownerIds = Array.from(new Set(input.files.map((file) => file.ownerId.trim()).filter(Boolean)))
    if (ownerIds.length !== input.files.length) {
      return { ok: false, error: "Each uploaded ID card must belong to a different project owner." }
    }

    const { data: ownerRows, error: ownerLookupError } = await admin
      .from("project_owners")
      .select("id")
      .eq("project_id", input.projectId)
      .in("id", ownerIds)
    if (ownerLookupError) throw ownerLookupError
    if ((ownerRows ?? []).length !== ownerIds.length) {
      return { ok: false, error: "One of the selected owners is no longer available." }
    }

    const expectedPrefix = `${input.projectId}/${actorId}/owner-id-cards/`
    for (const file of input.files) {
      const validationError = validateOwnerIdCardFile({
        name: file.originalFilename,
        size: file.sizeBytes,
        type: file.mimeType,
      })
      if (validationError) return { ok: false, error: validationError }
      if (
        !file.storagePath.startsWith(expectedPrefix) ||
        file.storagePath.includes("..") ||
        !file.storagePath.includes(`/${file.ownerId}/`)
      ) {
        return { ok: false, error: "One of the uploaded owner ID cards does not belong to this project." }
      }
    }

    const uploadedAt = new Date().toISOString()
    for (const file of input.files) {
      const { error: updateError } = await admin
        .from("project_owners")
        .update({
          id_card_storage_path: file.storagePath,
          id_card_original_filename: file.originalFilename.trim(),
          id_card_mime_type: file.mimeType.trim() || "application/octet-stream",
          id_card_size_bytes: file.sizeBytes,
          id_card_uploaded_by: actorId,
          id_card_uploaded_at: uploadedAt,
          updated_at: uploadedAt,
        })
        .eq("id", file.ownerId)
        .eq("project_id", input.projectId)
      if (updateError) throw updateError
    }

    await audit({
      actorId,
      action: "project_owner.id_cards_uploaded",
      entityType: "project",
      entityId: input.projectId,
      projectId: input.projectId,
      metadata: { count: input.files.length, ownerIds },
    })
    revalidatePath("/projects")
    revalidatePath(`/projects/${input.projectId}`)
    return { ok: true, data: { count: input.files.length } }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AuthzError ? err.message : "Could not link the owner ID card uploads.",
    }
  }
}

/** Option 1: add an EXISTING organization to a project with a project role. */
export async function addExistingOrganizationToProject(input: {
  projectId: string
  organizationId: string
  projectRole: ProjectOrgRole
}): Promise<ActionResult> {
  try {
    if (!PROJECT_ORG_ROLES.includes(input.projectRole)) return { ok: false, error: "Invalid project role." }
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()

    const { data: org } = await admin
      .from("organizations")
      .select("id")
      .eq("id", input.organizationId)
      .maybeSingle()
    if (!org) return { ok: false, error: "Organization not found." }

    const { data: existing } = await admin
      .from("project_organization_memberships")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .maybeSingle()
    if (existing) return { ok: false, error: "This organization is already on the project." }

    const { error } = await admin.from("project_organization_memberships").insert({
      project_id: input.projectId,
      organization_id: input.organizationId,
      project_role: input.projectRole,
      status: "active",
      created_by: actorId,
    })
    if (error) throw error

    await audit({
      actorId,
      action: "project_org.added",
      entityType: "project_organization_membership",
      organizationId: input.organizationId,
      projectId: input.projectId,
      metadata: { projectRole: input.projectRole },
    })
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not add organization." }
  }
}

/**
 * Option 2: create a NEW organization, add it to the project with a role, and
 * invite its first org admin by email — all in one server-verified step.
 */
export async function createOrgAndAddToProject(input: {
  supervisingOrgId: string
  projectId: string
  organizationName: string
  projectRole: ProjectOrgRole
  adminEmail: string
}): Promise<ActionResult<{ organizationId: string; token: string; userExists: boolean }>> {
  try {
    // assertProjectAdmin also covers supervising-org admins of this project.
    await assertProjectAdmin(input.projectId)

    const orgResult = await createOrganization({
      supervisingOrgId: input.supervisingOrgId,
      name: input.organizationName,
    })
    if (!orgResult.ok || !orgResult.data) return orgResult as ActionResult<never>
    const organizationId = orgResult.data.id

    const addResult = await addExistingOrganizationToProject({
      projectId: input.projectId,
      organizationId,
      projectRole: input.projectRole,
    })
    if (!addResult.ok) return addResult as ActionResult<never>

    const inviteResult = await createInvitation({
      email: input.adminEmail,
      organizationId,
      organizationRole: "org_admin",
      projectId: input.projectId,
    })
    if (!inviteResult.ok || !inviteResult.data) return inviteResult as ActionResult<never>

    // Mark the new organization as invited (admin invitation pending).
    const admin = createAdminClient()
    await admin.from("organizations").update({ status: "invited" }).eq("id", organizationId)

    revalidatePath("/users")
    return {
      ok: true,
      data: {
        organizationId,
        token: inviteResult.data.token,
        userExists: inviteResult.data.userExists,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not create organization." }
  }
}

/** Update an organization's role within a project. */
export async function updateProjectOrgRole(input: {
  projectId: string
  membershipId: string
  projectRole: ProjectOrgRole
}): Promise<ActionResult> {
  try {
    if (!PROJECT_ORG_ROLES.includes(input.projectRole)) return { ok: false, error: "Invalid project role." }
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { error } = await admin
      .from("project_organization_memberships")
      .update({ project_role: input.projectRole })
      .eq("id", input.membershipId)
      .eq("project_id", input.projectId)
    if (error) throw error
    await audit({
      actorId,
      action: "project_org.role_updated",
      entityType: "project_organization_membership",
      entityId: input.membershipId,
      projectId: input.projectId,
      metadata: { projectRole: input.projectRole },
    })
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not update role." }
  }
}

/**
 * Assign an EXISTING org member to a project with a project access role.
 * The user must already be an active member of `organizationId`.
 */
export async function assignUserToProject(input: {
  projectId: string
  organizationId: string
  userId: string
  accessRole: ProjectAccessRole
}): Promise<ActionResult> {
  try {
    if (!PROJECT_ACCESS_ROLES.includes(input.accessRole)) return { ok: false, error: "Invalid access role." }
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()

    // The org must be a participant on the project.
    const { data: pom } = await admin
      .from("project_organization_memberships")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .maybeSingle()
    if (!pom) return { ok: false, error: "That organization is not on this project." }

    // The user must be an active member of the org.
    const { data: om } = await admin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.userId)
      .eq("status", "active")
      .maybeSingle()
    if (!om) return { ok: false, error: "That user is not a member of the organization." }

    const { data: existing } = await admin
      .from("project_user_memberships")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.userId)
      .eq("status", "active")
      .maybeSingle()
    if (existing) {
      const { error } = await admin
        .from("project_user_memberships")
        .update({ access_role: input.accessRole })
        .eq("id", existing.id)
      if (error) throw error
    } else {
      const { error } = await admin.from("project_user_memberships").insert({
        project_id: input.projectId,
        organization_id: input.organizationId,
        user_id: input.userId,
        access_role: input.accessRole,
        status: "active",
        created_by: actorId,
      })
      if (error) throw error
    }

    await audit({
      actorId,
      action: "project_user.assigned",
      entityType: "project_user_membership",
      organizationId: input.organizationId,
      projectId: input.projectId,
      metadata: { userId: input.userId, accessRole: input.accessRole },
    })
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not assign user." }
  }
}

/** Remove a user's access to a project. */
export async function removeProjectUser(input: {
  projectId: string
  membershipId: string
}): Promise<ActionResult> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { error } = await admin
      .from("project_user_memberships")
      .update({ status: "inactive" })
      .eq("id", input.membershipId)
      .eq("project_id", input.projectId)
    if (error) throw error
    await audit({
      actorId,
      action: "project_user.removed",
      entityType: "project_user_membership",
      entityId: input.membershipId,
      projectId: input.projectId,
    })
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not remove user." }
  }
}
