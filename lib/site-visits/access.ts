import "server-only"

import { AuthzError, getUserIdOrThrow } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import type { SiteVisitProjectAccess } from "@/lib/site-visits/types"

export const SITE_VISIT_MANAGER_PROJECT_ROLES = [
  "project_admin",
  "project_manager",
  "inspector",
] as const

const SITE_VISIT_MANAGER_PARTICIPANT_LABELS = new Set([
  "project manager",
  "project supervisor",
  "supervisor",
  "site engineer",
])

const CLIENT_PARTICIPANT_LABELS = new Set(["client", "client / owner", "owner", "project owner"])

export type SiteVisitAccessMap = Map<string, SiteVisitProjectAccess>

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export async function getSiteVisitProjectAccess(userId: string): Promise<SiteVisitAccessMap> {
  const admin = createAdminClient()

  const [organizationMembershipResult, projectMembershipResult, participantResult] = await Promise.all([
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
  ])

  if (organizationMembershipResult.error) throw organizationMembershipResult.error
  if (projectMembershipResult.error) throw projectMembershipResult.error
  if (participantResult.error) throw participantResult.error

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
          .select("id, name, supervising_organization_id")
          .in("supervising_organization_id", organizationIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])

  if (projectOrganizationResult.error) throw projectOrganizationResult.error
  if (supervisingProjectsResult.error) throw supervisingProjectsResult.error

  const projectOrganizations = projectOrganizationResult.data ?? []
  const candidateProjectIds = new Set<string>()
  for (const membership of projectMemberships as any[]) candidateProjectIds.add(membership.project_id)
  for (const participant of participants as any[]) candidateProjectIds.add(participant.project_id)
  for (const membership of projectOrganizations as any[]) candidateProjectIds.add(membership.project_id)
  for (const project of supervisingProjectsResult.data ?? []) candidateProjectIds.add((project as any).id)

  if (!candidateProjectIds.size) return new Map()

  const { data: projectRows, error: projectsError } = await admin
    .from("projects")
    .select("id, name, supervising_organization_id")
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

    const canRequest =
      linkedParticipants.some(
        (participant) =>
          participant.project_role === "client" || CLIENT_PARTICIPANT_LABELS.has(normalized(participant.participant_role_label)),
      ) ||
      projectOrgMemberships.some(
        (membership) => membership.project_role === "client" && orgRoleById.has(membership.organization_id),
      )

    const canManage =
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
        canRequest,
        canManage,
      })
    }
  }

  return result
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
  return userId
}
