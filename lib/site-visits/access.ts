import "server-only"

import { AuthzError, getUserIdOrThrow } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import type { SiteVisitProjectAccess } from "@/lib/site-visits/types"

export const SITE_VISIT_MANAGER_PROJECT_ROLES = [
  "project_admin",
  "project_manager",
  "inspector",
] as const

// Request creation is intentionally narrower than request management. Keeping
// these lists separate makes future requester-role expansion explicit and safe.
export const SITE_VISIT_REQUESTER_PROJECT_ROLES = ["project_admin"] as const
export const SITE_VISIT_REQUESTER_ORGANIZATION_ROLES = ["org_admin"] as const

const SITE_VISIT_MANAGER_PARTICIPANT_LABELS = new Set([
  "project manager",
  "site engineer",
])

const CLIENT_PARTICIPANT_LABELS = new Set(["client", "client / owner", "owner", "project owner"])

export type SiteVisitAccessMap = Map<string, SiteVisitProjectAccess>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export async function getAssignedSiteVisitSupervisorProjectIds(userId: string): Promise<Set<string>> {
  if (!UUID_PATTERN.test(userId)) return new Set()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("projects")
    .select("id")
    .eq("assigned_supervisor_id", userId)

  if (error) throw error
  return new Set((data ?? []).map((row: any) => row.id as string).filter((id) => UUID_PATTERN.test(id)))
}

export async function getSiteVisitProjectAccess(userId: string): Promise<SiteVisitAccessMap> {
  if (!UUID_PATTERN.test(userId)) return new Map()

  try {
    const admin = createAdminClient()

  const [organizationMembershipResult, projectMembershipResult, participantResult, assignedSupervisorProjectResult, viewerOwnerResult] = await Promise.all([
    admin
      .from("organization_memberships")
      .select("organization_id, role")
      .eq("user_id", userId)
      .eq("status", "active"),
    admin
      .from("project_user_memberships")
      .select("project_id, organization_id, access_role")
      .eq("user_id", userId)
      .eq("status", "active"),
    admin
      .from("project_participants")
      .select("project_id, project_role, participant_role_label")
      .eq("key_contact_user_id", userId)
      .eq("status", "active"),
    admin
      .from("projects")
      .select("id")
      .eq("assigned_supervisor_id", userId),
    admin
      .from("project_owners")
      .select("project_id")
      .eq("viewer_user_id", userId),
  ])

  if (organizationMembershipResult.error) throw organizationMembershipResult.error
  if (projectMembershipResult.error) throw projectMembershipResult.error
  if (participantResult.error) throw participantResult.error
  if (assignedSupervisorProjectResult.error) throw assignedSupervisorProjectResult.error
  if (viewerOwnerResult.error) throw viewerOwnerResult.error

  const viewerOwnedProjectIds = new Set((viewerOwnerResult.data ?? []).map((row: any) => row.project_id as string))
  const organizationMemberships = organizationMembershipResult.data ?? []
  const projectMemberships = projectMembershipResult.data ?? []
  const participants = participantResult.data ?? []
  const organizationIds = Array.from(
    new Set(organizationMemberships.map((membership: any) => membership.organization_id as string)),
  )

  const [projectOrganizationResult, supervisingProjectsResult] = await Promise.all([
    organizationIds.length
      ? admin
          .from("project_organization_memberships")
          .select("project_id, organization_id, project_role")
          .in("organization_id", organizationIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] as any[], error: null }),
    organizationIds.length
      ? admin
          .from("projects")
          .select("id, name, code, supervising_organization_id, assigned_supervisor_id")
          .in("supervising_organization_id", organizationIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])

  if (projectOrganizationResult.error) throw projectOrganizationResult.error
  if (supervisingProjectsResult.error) throw supervisingProjectsResult.error

  const projectOrganizations = projectOrganizationResult.data ?? []
  const candidateProjectIds = new Set<string>()
  for (const membership of projectMemberships as any[]) candidateProjectIds.add(membership.project_id)
  for (const participant of participants as any[]) candidateProjectIds.add(participant.project_id)
  for (const project of assignedSupervisorProjectResult.data ?? []) candidateProjectIds.add((project as any).id)
  for (const membership of projectOrganizations as any[]) candidateProjectIds.add(membership.project_id)
  for (const project of supervisingProjectsResult.data ?? []) candidateProjectIds.add((project as any).id)
  for (const projectId of viewerOwnedProjectIds) candidateProjectIds.add(projectId)

  if (!candidateProjectIds.size) return new Map()

  const { data: projectRows, error: projectsError } = await admin
    .from("projects")
    .select("id, name, code, supervising_organization_id, assigned_supervisor_id")
    .in("id", Array.from(candidateProjectIds))
    .order("name", { ascending: true })
  if (projectsError) throw projectsError

  const orgRoleById = new Map<string, string>(
    organizationMemberships.map((membership: any) => [membership.organization_id as string, membership.role as string]),
  )
  const projectMembershipsByProject = new Map<string, any[]>()
  for (const membership of projectMemberships as any[]) {
    const rows = projectMembershipsByProject.get(membership.project_id) ?? []
    rows.push(membership)
    projectMembershipsByProject.set(membership.project_id, rows)
  }
  const participantsByProject = new Map<string, any[]>()
  for (const participant of participants as any[]) {
    const rows = participantsByProject.get(participant.project_id) ?? []
    rows.push(participant)
    participantsByProject.set(participant.project_id, rows)
  }
  const projectOrganizationsByProject = new Map<string, any[]>()
  for (const membership of projectOrganizations as any[]) {
    const rows = projectOrganizationsByProject.get(membership.project_id) ?? []
    rows.push(membership)
    projectOrganizationsByProject.set(membership.project_id, rows)
  }

  const result: SiteVisitAccessMap = new Map()
  for (const project of projectRows ?? []) {
    const projectId = (project as any).id as string
    const directMemberships = projectMembershipsByProject.get(projectId) ?? []
    const linkedParticipants = participantsByProject.get(projectId) ?? []
    const projectOrgMemberships = projectOrganizationsByProject.get(projectId) ?? []
    const supervisingOrgRole = orgRoleById.get((project as any).supervising_organization_id as string)

    // A Viewer never inherits project scope from organization/participant/project
    // membership alone. Their project must be explicitly linked through the
    // immutable project Owner relationship.
    if (supervisingOrgRole === "viewer" && !viewerOwnedProjectIds.has(projectId)) continue

    const isViewerOwner = supervisingOrgRole === "viewer" && viewerOwnedProjectIds.has(projectId)

    const isClientRequester =
      linkedParticipants.some(
        (participant) =>
          participant.project_role === "client" || CLIENT_PARTICIPANT_LABELS.has(normalized(participant.participant_role_label)),
      ) ||
      projectOrgMemberships.some(
        (membership) => membership.project_role === "client" && orgRoleById.has(membership.organization_id),
      )

    const isAdminRequester =
      directMemberships.some((membership) =>
        (SITE_VISIT_REQUESTER_PROJECT_ROLES as readonly string[]).includes(membership.access_role),
      ) ||
      (SITE_VISIT_REQUESTER_ORGANIZATION_ROLES as readonly string[]).includes(supervisingOrgRole ?? "") ||
      projectOrgMemberships.some(
        (membership) =>
          membership.project_role === "consultant" &&
          (SITE_VISIT_REQUESTER_ORGANIZATION_ROLES as readonly string[]).includes(
            orgRoleById.get(membership.organization_id) ?? "",
          ),
      )

    // A canonical Viewer-backed Owner is a client requester for that exact
    // project even when the Owner contact snapshot is not separately linked as
    // a client participant. The immutable project_owners.viewer_user_id link is
    // the authorization source of truth.
    const canRequest = isViewerOwner || isClientRequester || isAdminRequester

    const isAssignedProjectSupervisor = (project as any).assigned_supervisor_id === userId

    // Viewer Owners may request a visit, but the Viewer organization role never
    // grants scheduling/approval authority. This keeps stale participant or
    // project-membership rows from accidentally promoting a Viewer.
    const canManage = supervisingOrgRole === "viewer"
      ? false
      : isAssignedProjectSupervisor ||
        directMemberships.some((membership) =>
          (SITE_VISIT_MANAGER_PROJECT_ROLES as readonly string[]).includes(membership.access_role),
        ) ||
        supervisingOrgRole === "org_admin" ||
        supervisingOrgRole === "org_manager" ||
        projectOrgMemberships.some(
          (membership) =>
            membership.project_role === "consultant" &&
            ["org_admin", "org_manager"].includes(orgRoleById.get(membership.organization_id) ?? ""),
        ) ||
        linkedParticipants.some((participant) =>
          SITE_VISIT_MANAGER_PARTICIPANT_LABELS.has(normalized(participant.participant_role_label)),
        )

    if (canRequest || canManage) {
      result.set(projectId, {
        id: projectId,
        name: (project as any).name as string,
        code: typeof (project as any).code === "string" && (project as any).code.trim() ? (project as any).code.trim() : null,
        canRequest,
        canManage,
      })
    }
  }

  return result
  } catch (error) {
    console.error("getSiteVisitProjectAccess error:", error)
    return new Map()
  }
}

export async function assertSiteVisitRequester(projectId: string): Promise<string> {
  const userId = await getUserIdOrThrow()
  const access = await getSiteVisitProjectAccess(userId)
  if (!access.get(projectId)?.canRequest) throw new AuthzError("You cannot request a site visit for this project")
  return userId
}

export async function assertSiteVisitManager(projectId: string): Promise<string> {
  const userId = await getUserIdOrThrow()
  const access = await getSiteVisitProjectAccess(userId)
  if (!access.get(projectId)?.canManage) throw new AuthzError("You do not have permission to manage site visits for this project")

  // Organization Members are intentionally narrower than the broader Site
  // Visit manager access paths: a Member may manage requests only for the
  // Project where they are the canonical assigned Supervisor.
  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("assigned_supervisor_id, supervising_organization_id")
    .eq("id", projectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project) throw new AuthzError("Project not found")

  const { data: membership, error: membershipError } = await admin
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", project.supervising_organization_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()
  if (membershipError) throw membershipError

  if (membership?.role === "org_member" && project.assigned_supervisor_id !== userId) {
    throw new AuthzError("Only the assigned Project Supervisor can manage Site Visit Requests for this project")
  }

  return userId
}
