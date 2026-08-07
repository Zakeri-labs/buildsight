import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ProjectReadAccessContext = {
  project: {
    id: string
    name: string
    code: string | null
    supervising_organization_id: string
  }
  projectAccessRole: string | null
  supervisingOrganizationRole: string | null
  viewerOwner: boolean
}

export function isProjectUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

/**
 * Canonical server-side project read authorization.
 *
 * Existing non-Viewer access paths are preserved. An authenticated user whose
 * active role in the project's supervising organization is `viewer` is a
 * special case: project access is allowed only when that exact profile/auth
 * user id is linked to a project_owners row through viewer_user_id.
 */
export async function resolveProjectReadAccessForUser(
  userId: string,
  projectId: string,
): Promise<ProjectReadAccessContext | null> {
  if (!isProjectUuid(userId) || !isProjectUuid(projectId)) return null

  const admin = createAdminClient()
  const [projectResult, projectMembershipResult, participantResult, organizationMembershipResult] = await Promise.all([
    admin
      .from("projects")
      .select("id, name, code, supervising_organization_id")
      .eq("id", projectId)
      .maybeSingle(),
    admin
      .from("project_user_memberships")
      .select("access_role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    admin
      .from("project_participants")
      .select("id")
      .eq("project_id", projectId)
      .eq("key_contact_user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    admin
      .from("organization_memberships")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("status", "active"),
  ])

  if (projectResult.error) throw projectResult.error
  if (projectMembershipResult.error) throw projectMembershipResult.error
  if (participantResult.error) throw participantResult.error
  if (organizationMembershipResult.error) throw organizationMembershipResult.error
  const project = projectResult.data
  if (!project) return null

  const memberships = organizationMembershipResult.data ?? []
  const supervisingMembership = memberships.find(
    (membership) => membership.organization_id === project.supervising_organization_id,
  )

  if (supervisingMembership?.role === "viewer") {
    const { data: ownerLink, error: ownerError } = await admin
      .from("project_owners")
      .select("id")
      .eq("project_id", projectId)
      .eq("viewer_user_id", userId)
      .limit(1)
      .maybeSingle()
    if (ownerError) throw ownerError
    if (!ownerLink) return null

    return {
      project,
      projectAccessRole: projectMembershipResult.data?.access_role ?? null,
      supervisingOrganizationRole: "viewer",
      viewerOwner: true,
    }
  }

  if (projectMembershipResult.data || participantResult.data) {
    return {
      project,
      projectAccessRole: projectMembershipResult.data?.access_role ?? null,
      supervisingOrganizationRole: supervisingMembership?.role ?? null,
      viewerOwner: false,
    }
  }

  const organizationIds = Array.from(
    new Set(
      memberships
        .map((membership) => membership.organization_id)
        .filter((organizationId): organizationId is string => isProjectUuid(organizationId)),
    ),
  )

  if (organizationIds.includes(project.supervising_organization_id)) {
    return {
      project,
      projectAccessRole: null,
      supervisingOrganizationRole: supervisingMembership?.role ?? null,
      viewerOwner: false,
    }
  }

  if (organizationIds.length > 0) {
    const { data: projectOrganizationMembership, error: projectOrganizationError } = await admin
      .from("project_organization_memberships")
      .select("id")
      .eq("project_id", projectId)
      .in("organization_id", organizationIds)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
    if (projectOrganizationError) throw projectOrganizationError
    if (projectOrganizationMembership) {
      return {
        project,
        projectAccessRole: null,
        supervisingOrganizationRole: null,
        viewerOwner: false,
      }
    }
  }

  return null
}

/** Returns immutable Owner-linked project ids for an active Viewer in one org. */
export async function getViewerOwnedProjectIds(userId: string, organizationId: string): Promise<string[]> {
  if (!isProjectUuid(userId) || !isProjectUuid(organizationId)) return []
  const admin = createAdminClient()

  const { data: membership, error: membershipError } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("role", "viewer")
    .eq("status", "active")
    .limit(1)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) return []

  const { data: ownerRows, error: ownerError } = await admin
    .from("project_owners")
    .select("project_id, projects!inner(supervising_organization_id)")
    .eq("viewer_user_id", userId)
    .eq("projects.supervising_organization_id", organizationId)
  if (ownerError) throw ownerError

  return Array.from(
    new Set(
      (ownerRows ?? [])
        .map((row: any) => row.project_id)
        .filter((projectId): projectId is string => isProjectUuid(projectId)),
    ),
  )
}
