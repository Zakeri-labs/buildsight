import { currentCalendarDateKey } from "@/lib/calendar/date"
import type { DashboardDateRange } from "@/lib/dashboard/date-range"
import { roleLabel } from "@/lib/db/types"
import { preferredVisitLabel } from "@/lib/site-visits/format"
import {
  getAssignedSiteVisitSupervisorProjectIds,
  getSiteVisitProjectAccess,
  SITE_VISIT_MANAGER_PROJECT_ROLES,
} from "@/lib/site-visits/access"
import type {
  ProjectSiteVisitSummary,
  SiteVisitListItem,
  SiteVisitPageData,
  SiteVisitPerson,
  SiteVisitPreferredTime,
  SiteVisitStatus,
  SiteVisitTaskItem,
} from "@/lib/site-visits/types"
import { createAdminClient } from "@/lib/supabase/admin"

const MANAGER_PARTICIPANT_LABELS = new Set([
  "project manager",
  "site engineer",
])

const CLIENT_PARTICIPANT_LABELS = new Set(["client", "client / owner", "owner", "project owner"])

function personName(profile: any, fallback = "Project user") {
  return profile?.full_name?.trim() || profile?.email?.trim() || fallback
}

function normalizedRole(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function normalizedPhone(value: unknown) {
  const phone = typeof value === "string" ? value.trim() : ""
  return phone || null
}

function isMissingSiteVisitSchema(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01")
}

async function hydrateSiteVisitRows({
  rows,
  userId,
  access,
}: {
  rows: any[]
  userId: string
  access: Awaited<ReturnType<typeof getSiteVisitProjectAccess>>
}): Promise<SiteVisitListItem[]> {
  if (!rows.length) return []
  const admin = createAdminClient()
  const requestIds = rows.map((row) => row.id as string)
  const projectIds = Array.from(new Set(rows.map((row) => row.project_id as string)))

  const [assigneeResult, participantResult, membershipResult] = await Promise.all([
    admin.from("site_visit_request_assignees").select("request_id, user_id").in("request_id", requestIds),
    admin
      .from("project_participants")
      .select("project_id, key_contact_user_id, key_contact_name, key_contact_email, key_contact_phone, participant_role_label, project_role")
      .in("project_id", projectIds)
      .eq("status", "active"),
    admin
      .from("project_user_memberships")
      .select("project_id, user_id, access_role")
      .in("project_id", projectIds)
      .eq("status", "active"),
  ])
  if (assigneeResult.error) throw assigneeResult.error
  if (participantResult.error) throw participantResult.error
  if (membershipResult.error) throw membershipResult.error

  const assigneeRows = assigneeResult.data ?? []
  const participantRows = participantResult.data ?? []
  const membershipRows = membershipResult.data ?? []
  const profileIds = Array.from(
    new Set(
      [
        ...rows.flatMap((row) => [row.requested_by, row.scheduled_by]),
        ...assigneeRows.map((row: any) => row.user_id),
        ...participantRows.map((row: any) => row.key_contact_user_id),
        ...membershipRows.map((row: any) => row.user_id),
      ].filter((id): id is string => typeof id === "string" && Boolean(id)),
    ),
  )
  const { data: profiles, error: profileError } = profileIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", profileIds)
    : { data: [] as any[], error: null }
  if (profileError) throw profileError
  const profileById = new Map((profiles ?? []).map((profile: any) => [profile.id as string, profile]))

  const assigneesByRequest = new Map<string, string[]>()
  for (const row of assigneeRows as any[]) {
    const ids = assigneesByRequest.get(row.request_id) ?? []
    ids.push(row.user_id)
    assigneesByRequest.set(row.request_id, ids)
  }

  const participantsByProject = new Map<string, any[]>()
  for (const row of participantRows as any[]) {
    const projectRows = participantsByProject.get(row.project_id) ?? []
    projectRows.push(row)
    participantsByProject.set(row.project_id, projectRows)
  }

  const membershipsByProject = new Map<string, any[]>()
  for (const row of membershipRows as any[]) {
    const projectRows = membershipsByProject.get(row.project_id) ?? []
    projectRows.push(row)
    membershipsByProject.set(row.project_id, projectRows)
  }

  const teamByProject = new Map<string, SiteVisitPerson[]>()
  const whatsappByProject = new Map<string, SiteVisitPerson[]>()
  for (const projectId of projectIds) {
    const team = new Map<string, SiteVisitPerson>()
    const whatsapp = new Map<string, SiteVisitPerson>()

    for (const membership of membershipsByProject.get(projectId) ?? []) {
      const profile = profileById.get(membership.user_id)
      if (!profile) continue
      team.set(membership.user_id, {
        id: membership.user_id,
        name: personName(profile),
        role: roleLabel(membership.access_role),
      })
    }

    for (const participant of participantsByProject.get(projectId) ?? []) {
      const profile = participant.key_contact_user_id ? profileById.get(participant.key_contact_user_id) : null
      const name =
        participant.key_contact_name?.trim() ||
        personName(profile, "") ||
        participant.key_contact_email?.trim() ||
        "Project participant"
      const role = participant.participant_role_label?.trim() || roleLabel(participant.project_role)
      const phone = normalizedPhone(participant.key_contact_phone)
      const id = participant.key_contact_user_id || `participant:${projectId}:${name}:${phone ?? ""}`

      if (participant.key_contact_user_id) {
        team.set(participant.key_contact_user_id, {
          id: participant.key_contact_user_id,
          name,
          role,
        })
      }
      if (phone && participant.project_role !== "client" && !CLIENT_PARTICIPANT_LABELS.has(normalizedRole(role))) {
        whatsapp.set(id, { id, name, role, phone })
      }
    }

    teamByProject.set(projectId, Array.from(team.values()).sort((a, b) => a.name.localeCompare(b.name)))
    whatsappByProject.set(projectId, Array.from(whatsapp.values()).sort((a, b) => a.name.localeCompare(b.name)))
  }

  return rows.map((row) => {
    const projectAccess = access.get(row.project_id)
    const assignedParticipants = (assigneesByRequest.get(row.id) ?? []).map((assignedUserId) => {
      const profile = profileById.get(assignedUserId)
      const team = teamByProject.get(row.project_id)?.find((person) => person.id === assignedUserId)
      return team ?? { id: assignedUserId, name: personName(profile) }
    })
    return {
      id: row.id,
      projectId: row.project_id,
      projectName: projectAccess?.name ?? "Unknown project",
      requestedById: row.requested_by,
      requestedBy: personName(profileById.get(row.requested_by)),
      status: row.status as SiteVisitStatus,
      preferredDate: row.preferred_date,
      isAsap: Boolean(row.is_asap),
      preferredTime: row.preferred_time as SiteVisitPreferredTime,
      purpose: row.purpose,
      notes: row.notes,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time,
      scheduledNotes: row.scheduled_notes,
      scheduledBy: row.scheduled_by ? personName(profileById.get(row.scheduled_by)) : null,
      assignedParticipants,
      whatsappRecipients: whatsappByProject.get(row.project_id) ?? [],
      teamMembers: teamByProject.get(row.project_id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      canManage: Boolean(projectAccess?.canManage),
      canRequest: Boolean(projectAccess?.canRequest && row.requested_by === userId),
    }
  })
}

const REQUEST_COLUMNS =
  "id, project_id, requested_by, status, preferred_date, is_asap, preferred_time, purpose, notes, scheduled_date, scheduled_time, scheduled_notes, scheduled_by, created_at, updated_at"

export async function getSiteVisitPageData({
  userId,
  projectId,
  dateRange = null,
  memberSupervisorOnly = false,
}: {
  userId: string
  projectId: string | null
  dateRange?: DashboardDateRange | null
  memberSupervisorOnly?: boolean
}): Promise<SiteVisitPageData> {
  const admin = createAdminClient()
  const fullAccess = await getSiteVisitProjectAccess(userId)
  const assignedSupervisorProjectIds = memberSupervisorOnly
    ? await getAssignedSiteVisitSupervisorProjectIds(userId)
    : null
  const access = memberSupervisorOnly
    ? new Map(
        Array.from(fullAccess.entries()).filter(
          ([id, projectAccess]) => assignedSupervisorProjectIds?.has(id) && projectAccess.canManage,
        ),
      )
    : fullAccess
  const projects = Array.from(access.values()).sort((a, b) => a.name.localeCompare(b.name))
  const unauthorizedProject = Boolean(projectId && !access.has(projectId))
  const scopedProjectIds = unauthorizedProject
    ? []
    : projectId
      ? [projectId]
      : projects.map((project) => project.id)

  let rows: any[] = []
  if (scopedProjectIds.length) {
    let query = admin
      .from("site_visit_requests")
      .select(REQUEST_COLUMNS)
      .in("project_id", scopedProjectIds)

    if (dateRange && dateRange.startDate && dateRange.endDate) {
      const { startDate, endDate } = dateRange
      const today = currentCalendarDateKey()
      const includesToday = startDate <= today && today <= endDate

      const orConditions = [
        `and(scheduled_date.gte.${startDate},scheduled_date.lte.${endDate})`,
        `and(scheduled_date.is.null,preferred_date.gte.${startDate},preferred_date.lte.${endDate})`,
      ]

      if (includesToday) {
        orConditions.push(
          `and(scheduled_date.is.null,preferred_date.is.null,is_asap.eq.true,status.eq.pending)`
        )
      }

      query = query.or(orConditions.join(","))
    }

    const { data, error } = await query.order("created_at", { ascending: false })
    if (error) throw error
    rows = (data ?? []).filter((row: any) => access.get(row.project_id)?.canManage || row.requested_by === userId)
  }

  const requests = await hydrateSiteVisitRows({ rows, userId, access })
  return {
    projects,
    requests,
    selectedProjectId: projectId && !unauthorizedProject ? projectId : null,
    selectedProjectName: projectId && !unauthorizedProject ? access.get(projectId)?.name ?? null : null,
    canRequestAny: projects.some((project) => project.canRequest),
    canManageAny: projects.some((project) => project.canManage),
    unauthorizedProject,
  }
}

export async function getSiteVisitRequestDetail({
  userId,
  requestId,
  memberSupervisorOnly = false,
}: {
  userId: string
  requestId: string
  memberSupervisorOnly?: boolean
}) {
  const admin = createAdminClient()
  const access = await getSiteVisitProjectAccess(userId)
  const { data, error } = await admin.from("site_visit_requests").select(REQUEST_COLUMNS).eq("id", requestId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const projectAccess = access.get((data as any).project_id)
  if (memberSupervisorOnly) {
    const assignedProjectIds = await getAssignedSiteVisitSupervisorProjectIds(userId)
    if (!assignedProjectIds.has((data as any).project_id) || !projectAccess?.canManage) return null
  }
  if (!projectAccess || (!projectAccess.canManage && (data as any).requested_by !== userId)) return null
  return (await hydrateSiteVisitRows({ rows: [data], userId, access }))[0] ?? null
}

export async function getProjectSiteVisitSummary({
  userId,
  projectId,
}: {
  userId: string
  projectId: string
}): Promise<ProjectSiteVisitSummary> {
  try {
    const data = await getSiteVisitPageData({ userId, projectId })
    const access = data.projects.find((project) => project.id === projectId)
    const counts: Record<SiteVisitStatus, number> = { pending: 0, scheduled: 0, completed: 0, cancelled: 0 }
    for (const request of data.requests) counts[request.status] += 1
    return {
      projectId,
      canRequest: Boolean(access?.canRequest),
      canManage: Boolean(access?.canManage),
      counts,
      recent: data.requests.slice(0, 4),
    }
  } catch (error) {
    if (!isMissingSiteVisitSchema(error)) throw error
    return {
      projectId,
      canRequest: false,
      canManage: false,
      counts: { pending: 0, scheduled: 0, completed: 0, cancelled: 0 },
      recent: [],
    }
  }
}

export async function getSiteVisitTaskFeed({
  userId,
  projectId,
}: {
  userId: string
  projectId: string | null
}): Promise<{ canManage: boolean; items: SiteVisitTaskItem[] }> {
  const admin = createAdminClient()
  const access = await getSiteVisitProjectAccess(userId)
  let projectIds = Array.from(access.values()).filter((project) => project.canManage).map((project) => project.id)
  if (projectId) projectIds = projectIds.includes(projectId) ? [projectId] : []
  if (!projectIds.length) return { canManage: false, items: [] }

  const { data, error } = await admin
    .from("site_visit_requests")
    .select("id, project_id, requested_by, preferred_date, is_asap, preferred_time, purpose, created_at")
    .in("project_id", projectIds)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
  if (error) {
    if (isMissingSiteVisitSchema(error)) return { canManage: true, items: [] }
    throw error
  }
  const rows = data ?? []
  const requesterIds = Array.from(new Set(rows.map((row: any) => row.requested_by as string)))
  const { data: profiles, error: profileError } = requesterIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", requesterIds)
    : { data: [] as any[], error: null }
  if (profileError) throw profileError
  const profilesById = new Map((profiles ?? []).map((profile: any) => [profile.id as string, profile]))

  const items = rows.map((row: any): SiteVisitTaskItem => ({
    id: row.id,
    projectId: row.project_id,
    projectName: access.get(row.project_id)?.name ?? "Unknown project",
    requestedById: row.requested_by,
    requestedBy: personName(profilesById.get(row.requested_by)),
    preferredVisit: preferredVisitLabel({
      isAsap: Boolean(row.is_asap),
      preferredDate: row.preferred_date,
      preferredTime: row.preferred_time as SiteVisitPreferredTime,
    }),
    createdAt: row.created_at,
    status: "pending",
    purpose: row.purpose,
    href: `/site-visits/${row.id}?project=${encodeURIComponent(row.project_id)}`,
    notificationKey: `site-visit:${row.id}:${row.created_at}`,
  }))
  return { canManage: true, items }
}

export async function getSiteVisitEmailRecipients(
  projectId: string,
  excludeUserId: string,
): Promise<{ projectName: string; recipients: Array<{ name: string; email: string }> }> {
  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, name, supervising_organization_id, assigned_supervisor_id")
    .eq("id", projectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project) return { projectName: "Project", recipients: [] as Array<{ name: string; email: string }> }

  const { data: consultantOrganizations, error: consultantOrganizationsError } = await admin
    .from("project_organization_memberships")
    .select("organization_id")
    .eq("project_id", projectId)
    .eq("project_role", "consultant")
    .eq("status", "active")
  if (consultantOrganizationsError) throw consultantOrganizationsError
  const managerOrganizationIds = Array.from(new Set([
    project.supervising_organization_id,
    ...(consultantOrganizations ?? []).map((row: any) => row.organization_id as string),
  ]))

  const [projectMembershipResult, orgMembershipResult, participantResult] = await Promise.all([
    admin
      .from("project_user_memberships")
      .select("user_id")
      .eq("project_id", projectId)
      .eq("status", "active")
      .in("access_role", [...SITE_VISIT_MANAGER_PROJECT_ROLES]),
    admin
      .from("organization_memberships")
      .select("user_id")
      .in("organization_id", managerOrganizationIds)
      .eq("status", "active")
      .in("role", ["org_admin", "org_manager"]),
    admin
      .from("project_participants")
      .select("key_contact_user_id, participant_role_label")
      .eq("project_id", projectId)
      .eq("status", "active")
      .not("key_contact_user_id", "is", null),
  ])
  if (projectMembershipResult.error) throw projectMembershipResult.error
  if (orgMembershipResult.error) throw orgMembershipResult.error
  if (participantResult.error) throw participantResult.error

  const participantUserIds = (participantResult.data ?? [])
    .filter((participant: any) => MANAGER_PARTICIPANT_LABELS.has(normalizedRole(participant.participant_role_label)))
    .map((participant: any) => participant.key_contact_user_id as string)
  const userIds = Array.from(
    new Set([
      ...(projectMembershipResult.data ?? []).map((row: any) => row.user_id as string),
      ...(orgMembershipResult.data ?? []).map((row: any) => row.user_id as string),
      ...(typeof project.assigned_supervisor_id === "string" ? [project.assigned_supervisor_id] : []),
      ...participantUserIds,
    ]),
  ).filter((id) => id !== excludeUserId)

  const { data: profiles, error: profileError } = userIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] as any[], error: null }
  if (profileError) throw profileError

  return {
    projectName: project.name,
    recipients: (profiles ?? [])
      .filter((profile: any) => profile.email?.trim())
      .map((profile: any) => ({ name: personName(profile), email: profile.email.trim() })),
  }
}
