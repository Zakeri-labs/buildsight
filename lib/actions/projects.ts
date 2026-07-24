"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { assertOrgAdmin, assertProjectAdmin, audit, AuthzError } from "@/lib/auth/guards"
import { createInvitation } from "@/lib/actions/invitations"
import { createOrganization } from "@/lib/actions/organizations"
import type { ProjectAccessRole, ProjectOrgRole } from "@/lib/db/types"
import { PROJECT_ACCESS_ROLES, PROJECT_ORG_ROLES } from "@/lib/db/types"
import type { ActionResult } from "@/lib/actions/invitations"

/** Create a project owned (supervised) by the caller's supervising org. */
export async function createProject(input: {
  supervisingOrgId: string
  name: string
  code?: string
  location?: string
}): Promise<ActionResult<{ id: string }>> {
  try {
    const name = input.name.trim()
    if (name.length < 2) return { ok: false, error: "Project name is too short." }
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

    const { data: created, error } = await admin
      .from("projects")
      .insert({
        name,
        code: input.code?.trim() || null,
        location: input.location?.trim() || null,
        status: "active",
        supervising_organization_id: input.supervisingOrgId,
        created_by: actorId,
      })
      .select("id")
      .single()
    if (error) throw error

    // The supervising org is itself a participant in every project it creates.
    await admin.from("project_organization_memberships").insert({
      project_id: created.id,
      organization_id: input.supervisingOrgId,
      project_role: "consultant",
      status: "active",
      created_by: actorId,
    })
    await admin.from("project_user_memberships").insert({
      project_id: created.id,
      user_id: actorId,
      organization_id: input.supervisingOrgId,
      access_role: "project_admin",
      status: "active",
      created_by: actorId,
    })

    await audit({
      actorId,
      action: "project.created",
      entityType: "project",
      entityId: created.id,
      organizationId: input.supervisingOrgId,
      projectId: created.id,
      metadata: { name },
    })
    revalidatePath("/users-roles")
    return { ok: true, data: { id: created.id } }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not create project." }
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
    revalidatePath("/users-roles")
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

    revalidatePath("/users-roles")
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
    revalidatePath("/users-roles")
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
    revalidatePath("/users-roles")
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
    revalidatePath("/users-roles")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not remove user." }
  }
}
