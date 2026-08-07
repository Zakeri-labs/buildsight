import "server-only"

import { getCalendarVisibleRange } from "@/lib/calendar/date"
import type {
  CalendarClientRequestViewModel,
  CalendarDataViewModel,
  CalendarEventViewModel,
  CalendarSchedulingPersonViewModel,
  CalendarSchedulingProjectViewModel,
} from "@/lib/calendar/types"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
export const CALENDAR_PENDING_REQUEST_STATUS = "pending" as const
const SCHEDULED_VISIT_STATUSES = ["scheduled"] as const
const TODAY_VISIT_STATUSES = ["scheduled", "completed"] as const
const CALENDAR_VISIT_STATUSES = ["scheduled", "completed", "cancelled"] as const
const CALENDAR_REQUEST_COLUMNS = "id, project_id, requested_by, client_request_id, status, preferred_date, is_asap, preferred_time, purpose, notes, scheduled_date, scheduled_time, report_visit_number, created_at"

export type CalendarProjectAccessMode = "admin" | "supervisor"
export type CalendarProjectScopeRow = {
  id: string
  name: string
  code: string | null
  latitude: number | null
  longitude: number | null
  assignedSupervisorId: string | null
  supervisingOrganizationId: string | null
  accessMode: CalendarProjectAccessMode
}

type SupabaseErrorFields = { code?: string; message?: string; details?: string; hint?: string }

export function isValidCalendarUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

function uniqueValidUuids(values: unknown[]): string[] {
  return Array.from(new Set(values.filter(isValidCalendarUuid).map((value) => value.trim())))
}

function supabaseErrorFields(error: unknown): SupabaseErrorFields {
  if (!error || typeof error !== "object") return {}
  const value = error as Record<string, unknown>
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined,
  }
}

function logCalendarError({ operation, userId, projectCount, rangeStart, rangeEnd, error }: {
  operation: string
  userId: string
  projectCount: number
  rangeStart: string
  rangeEnd: string
  error: unknown
}) {
  const fields = supabaseErrorFields(error)
  console.error("[calendar] data load failed", {
    operation,
    userId,
    supervisedProjectCount: projectCount,
    requestedDateRange: { start: rangeStart, end: rangeEnd },
    code: fields.code ?? null,
    message: fields.message ?? "Unknown Supabase error",
    details: fields.details ?? null,
    hint: fields.hint ?? null,
  })
}

function profileName(profile: any): string | null {
  const fullName = typeof profile?.full_name === "string" ? profile.full_name.trim() : ""
  const email = typeof profile?.email === "string" ? profile.email.trim() : ""
  return fullName || email || null
}

function preferredTimeLabel(value: unknown): string {
  if (value === "morning") return "Morning"
  if (value === "afternoon") return "Afternoon"
  return "Any time"
}

function clockTime(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return /^\d{2}:\d{2}/.test(normalized) ? normalized.slice(0, 5) : null
}

function notesPreview(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) return null
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized
}

function readableRole(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

function normalizeCoordinate(value: unknown, min: number, max: number): number | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized >= min && normalized <= max ? normalized : null
}

function normalizeProjectRow(row: any, accessMode: CalendarProjectAccessMode): CalendarProjectScopeRow | null {
  if (!isValidCalendarUuid(row?.id)) return null
  return {
    id: row.id,
    name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Project",
    code: typeof row.code === "string" && row.code.trim() ? row.code.trim() : null,
    latitude: normalizeCoordinate(row.latitude, -90, 90),
    longitude: normalizeCoordinate(row.longitude, -180, 180),
    assignedSupervisorId: isValidCalendarUuid(row.assigned_supervisor_id) ? row.assigned_supervisor_id : null,
    supervisingOrganizationId: isValidCalendarUuid(row.supervising_organization_id) ? row.supervising_organization_id : null,
    accessMode,
  }
}

export async function resolveExplicitSupervisorProjectScope(userId: string): Promise<CalendarProjectScopeRow[]> {
  if (!isValidCalendarUuid(userId)) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("projects")
    .select("id, name, code, latitude, longitude, assigned_supervisor_id, supervising_organization_id")
    .eq("assigned_supervisor_id", userId)

  if (error) throw error

  return (data ?? [])
    .map((row: any) => normalizeProjectRow(row, "supervisor"))
    .filter((project): project is CalendarProjectScopeRow => Boolean(project))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export async function resolveCalendarProjectScope(userId: string): Promise<CalendarProjectScopeRow[]> {
  if (!isValidCalendarUuid(userId)) return []
  const admin = createAdminClient()

  const [organizationMembershipResult, projectAdminMembershipResult, supervisorProjects] = await Promise.all([
    admin.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("status", "active").eq("role", "org_admin"),
    admin.from("project_user_memberships").select("project_id").eq("user_id", userId).eq("status", "active").eq("access_role", "project_admin"),
    resolveExplicitSupervisorProjectScope(userId),
  ])

  if (organizationMembershipResult.error) throw organizationMembershipResult.error
  if (projectAdminMembershipResult.error) throw projectAdminMembershipResult.error

  const adminOrganizationIds = uniqueValidUuids((organizationMembershipResult.data ?? []).map((row: any) => row.organization_id))
  const explicitProjectAdminIds = uniqueValidUuids((projectAdminMembershipResult.data ?? []).map((row: any) => row.project_id))
  const projectColumns = "id, name, code, latitude, longitude, assigned_supervisor_id, supervising_organization_id"

  const [organizationProjectsResult, explicitAdminProjectsResult] = await Promise.all([
    adminOrganizationIds.length
      ? admin.from("projects").select(projectColumns).in("supervising_organization_id", adminOrganizationIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    explicitProjectAdminIds.length
      ? admin.from("projects").select(projectColumns).in("id", explicitProjectAdminIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])

  if (organizationProjectsResult.error) throw organizationProjectsResult.error
  if (explicitAdminProjectsResult.error) throw explicitAdminProjectsResult.error

  const projects = new Map<string, CalendarProjectScopeRow>()
  for (const row of [...(organizationProjectsResult.data ?? []), ...(explicitAdminProjectsResult.data ?? [])] as any[]) {
    const project = normalizeProjectRow(row, "admin")
    if (project) projects.set(project.id, project)
  }
  for (const project of supervisorProjects) {
    if (!projects.has(project.id)) projects.set(project.id, project)
  }

  return Array.from(projects.values()).sort((left, right) => left.name.localeCompare(right.name))
}


export async function getCalendarPendingRequestRows(projectIds: string[]) {
  const validProjectIds = uniqueValidUuids(projectIds)
  if (!validProjectIds.length) return { data: [] as any[], error: null }

  return createAdminClient()
    .from("site_visit_requests")
    .select(CALENDAR_REQUEST_COLUMNS)
    .in("project_id", validProjectIds)
    .eq("status", CALENDAR_PENDING_REQUEST_STATUS)
    .order("preferred_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
}

export async function getCalendarVisibleSiteVisitRows(projectIds: string[], rangeStart: string, rangeEnd: string) {
  const validProjectIds = uniqueValidUuids(projectIds)
  if (!validProjectIds.length) return { data: [] as any[], error: null }

  return createAdminClient()
    .from("site_visit_requests")
    .select(CALENDAR_REQUEST_COLUMNS)
    .in("project_id", validProjectIds)
    .in("status", [...CALENDAR_VISIT_STATUSES])
    .gte("scheduled_date", rangeStart)
    .lte("scheduled_date", rangeEnd)
}

export async function getCalendarScheduledSiteVisitRowsForDate(projectIds: string[], date: string) {
  const validProjectIds = uniqueValidUuids(projectIds)
  if (!validProjectIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { data: [] as any[], error: null }

  return createAdminClient()
    .from("site_visit_requests")
    .select(CALENDAR_REQUEST_COLUMNS)
    .in("project_id", validProjectIds)
    .in("status", [...SCHEDULED_VISIT_STATUSES])
    .eq("scheduled_date", date)
    .order("scheduled_time", { ascending: true, nullsFirst: false })
}

export async function getCalendarTodaySiteVisitRowsForDate(projectIds: string[], date: string) {
  const validProjectIds = uniqueValidUuids(projectIds)
  if (!validProjectIds.length || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { data: [] as any[], error: null }

  return createAdminClient()
    .from("site_visit_requests")
    .select(CALENDAR_REQUEST_COLUMNS)
    .in("project_id", validProjectIds)
    .in("status", [...TODAY_VISIT_STATUSES])
    .eq("scheduled_date", date)
    .order("scheduled_time", { ascending: true, nullsFirst: false })
}

export async function getCalendarSchedulingProjects({ userId, projects }: {
  userId: string
  projects: CalendarProjectScopeRow[]
}): Promise<CalendarSchedulingProjectViewModel[]> {
  if (!isValidCalendarUuid(userId) || !projects.length) return []

  const schedulableProjects = projects.filter((project) =>
    isValidCalendarUuid(project.id) &&
    isValidCalendarUuid(project.assignedSupervisorId) &&
    (project.accessMode === "admin" || project.assignedSupervisorId === userId),
  )
  if (!schedulableProjects.length) return []

  const admin = createAdminClient()
  const projectIds = uniqueValidUuids(schedulableProjects.map((project) => project.id))
  const organizationIds = uniqueValidUuids(schedulableProjects.map((project) => project.supervisingOrganizationId))

  const [projectMembershipResult, participantResult, organizationMembershipResult] = await Promise.all([
    admin.from("project_user_memberships").select("project_id, user_id, access_role").in("project_id", projectIds).eq("status", "active"),
    admin.from("project_participants").select("project_id, key_contact_user_id, project_role, participant_role_label").in("project_id", projectIds).eq("status", "active").not("key_contact_user_id", "is", null),
    organizationIds.length
      ? admin.from("organization_memberships").select("organization_id, user_id, role").in("organization_id", organizationIds).eq("status", "active")
      : Promise.resolve({ data: [] as any[], error: null }),
  ])

  if (projectMembershipResult.error) throw projectMembershipResult.error
  if (participantResult.error) throw participantResult.error
  if (organizationMembershipResult.error) throw organizationMembershipResult.error

  const allUserIds = uniqueValidUuids([
    ...schedulableProjects.map((project) => project.assignedSupervisorId),
    ...(projectMembershipResult.data ?? []).map((row: any) => row.user_id),
    ...(participantResult.data ?? []).map((row: any) => row.key_contact_user_id),
    ...(organizationMembershipResult.data ?? []).map((row: any) => row.user_id),
  ])
  const profileResult = allUserIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", allUserIds)
    : { data: [] as any[], error: null }
  if (profileResult.error) {
    const fields = supabaseErrorFields(profileResult.error)
    console.error("[calendar] scheduling profile display load failed", {
      operation: "calendar scheduling profiles",
      userId,
      projectCount: schedulableProjects.length,
      code: fields.code ?? null,
      message: fields.message ?? "Unknown Supabase error",
    })
  }

  const profileById = new Map((profileResult.data ?? []).map((profile: any) => [profile.id, profile]))
  const membershipsByProject = new Map<string, any[]>()
  for (const row of projectMembershipResult.data ?? []) {
    const rows = membershipsByProject.get((row as any).project_id) ?? []
    rows.push(row)
    membershipsByProject.set((row as any).project_id, rows)
  }
  const participantsByProject = new Map<string, any[]>()
  for (const row of participantResult.data ?? []) {
    const rows = participantsByProject.get((row as any).project_id) ?? []
    rows.push(row)
    participantsByProject.set((row as any).project_id, rows)
  }
  const orgMembersByOrganization = new Map<string, any[]>()
  for (const row of organizationMembershipResult.data ?? []) {
    const rows = orgMembersByOrganization.get((row as any).organization_id) ?? []
    rows.push(row)
    orgMembersByOrganization.set((row as any).organization_id, rows)
  }

  const person = (id: string, role: string | null): CalendarSchedulingPersonViewModel => ({
    id,
    name: profileName(profileById.get(id)) ?? "Project participant",
    role,
  })

  return schedulableProjects.map((project) => {
    const people = new Map<string, CalendarSchedulingPersonViewModel>()
    for (const membership of membershipsByProject.get(project.id) ?? []) {
      if (!isValidCalendarUuid(membership.user_id)) continue
      people.set(membership.user_id, person(membership.user_id, readableRole(membership.access_role)))
    }
    for (const participant of participantsByProject.get(project.id) ?? []) {
      if (!isValidCalendarUuid(participant.key_contact_user_id)) continue
      const role = readableRole(participant.participant_role_label) ?? readableRole(participant.project_role)
      people.set(participant.key_contact_user_id, person(participant.key_contact_user_id, role))
    }
    if (project.supervisingOrganizationId) {
      for (const membership of orgMembersByOrganization.get(project.supervisingOrganizationId) ?? []) {
        if (!isValidCalendarUuid(membership.user_id)) continue
        if (!people.has(membership.user_id)) people.set(membership.user_id, person(membership.user_id, readableRole(membership.role)))
      }
    }

    const supervisorId = project.assignedSupervisorId as string
    const supervisor = person(supervisorId, "Project Supervisor")
    people.set(supervisorId, supervisor)

    return {
      id: project.id,
      name: project.name,
      supervisor,
      participants: Array.from(people.values()).sort((left, right) => left.name.localeCompare(right.name)),
    }
  })
}

export function createEmptyCalendarData(monthKey: string): CalendarDataViewModel {
  const { rangeStart, rangeEnd } = getCalendarVisibleRange(monthKey)
  return {
    monthKey,
    rangeStart,
    rangeEnd,
    events: [],
    pendingRequests: [],
    summary: { pendingClientRequests: 0, upcomingVisits: 0, todaysVisits: 0 },
    scheduling: { canSchedule: false, projects: [] },
  }
}

export async function getCalendarData({ userId, monthKey }: { userId: string; monthKey: string }): Promise<CalendarDataViewModel> {
  const { rangeStart, rangeEnd } = getCalendarVisibleRange(monthKey)
  let projects: CalendarProjectScopeRow[] = []

  try {
    projects = await resolveCalendarProjectScope(userId)
    const projectIds = uniqueValidUuids(projects.map((project) => project.id))
    if (!projectIds.length) return createEmptyCalendarData(monthKey)

    const admin = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const [pendingResult, pendingRangeResult, visitRangeResult, upcomingResult, todayResult, schedulingProjects] = await Promise.all([
      getCalendarPendingRequestRows(projectIds),
      admin.from("site_visit_requests").select(CALENDAR_REQUEST_COLUMNS).in("project_id", projectIds).eq("status", CALENDAR_PENDING_REQUEST_STATUS).gte("preferred_date", rangeStart).lte("preferred_date", rangeEnd),
      getCalendarVisibleSiteVisitRows(projectIds, rangeStart, rangeEnd),
      admin.from("site_visit_requests").select("id", { count: "exact", head: true }).in("project_id", projectIds).in("status", [...SCHEDULED_VISIT_STATUSES]).gt("scheduled_date", today),
      getCalendarScheduledSiteVisitRowsForDate(projectIds, today),
      getCalendarSchedulingProjects({ userId, projects }),
    ])

    const results = [
      ["pending requests", pendingResult],
      ["visible pending requests", pendingRangeResult],
      ["visible site visits", visitRangeResult],
      ["upcoming visit count", upcomingResult],
      ["today visit count", todayResult],
    ] as const
    for (const [operation, result] of results) {
      if (result.error) {
        logCalendarError({ operation, userId, projectCount: projects.length, rangeStart, rangeEnd, error: result.error })
        throw result.error
      }
    }

    const pendingRows = pendingResult.data ?? []
    const requesterIds = uniqueValidUuids(pendingRows.map((row: any) => row.requested_by))
    const profileResult = requesterIds.length
      ? await admin.from("profiles").select("id, full_name, email").in("id", requesterIds)
      : { data: [] as any[], error: null }
    if (profileResult.error) logCalendarError({ operation: "requester profiles", userId, projectCount: projects.length, rangeStart, rangeEnd, error: profileResult.error })

    const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
    const profileById = new Map((profileResult.data ?? []).map((profile: any) => [profile.id, profile]))
    const schedulableProjectIds = new Set(schedulingProjects.map((project) => project.id))
    const manageableProjectIds = new Set(projects.map((project) => project.id))

    const pendingRequests: CalendarClientRequestViewModel[] = pendingRows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      projectName: projectNameById.get(row.project_id) ?? "Project",
      requestedDate: typeof row.preferred_date === "string" ? row.preferred_date : null,
      isAsap: Boolean(row.is_asap),
      preferredTime: row.preferred_time === "morning" || row.preferred_time === "afternoon" ? row.preferred_time : "any_time",
      preferredTimeLabel: preferredTimeLabel(row.preferred_time),
      requestedBy: profileName(profileById.get(row.requested_by)),
      purpose: typeof row.purpose === "string" && row.purpose.trim() ? row.purpose.trim() : null,
      notes: typeof row.notes === "string" && row.notes.trim() ? row.notes.trim() : null,
      notesPreview: notesPreview(row.notes),
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
      status: "pending",
      canManage: manageableProjectIds.has(row.project_id),
      canApprove: schedulableProjectIds.has(row.project_id),
    }))

    const events: CalendarEventViewModel[] = []
    for (const row of pendingRangeResult.data ?? []) {
      if (typeof row.preferred_date !== "string") continue
      events.push({
        id: row.id,
        projectId: row.project_id,
        projectName: projectNameById.get(row.project_id) ?? "Project",
        date: row.preferred_date,
        kind: "client_request",
        timeLabel: preferredTimeLabel(row.preferred_time),
        secondaryLabel: "Client Request",
      })
    }

    for (const row of visitRangeResult.data ?? []) {
      if (typeof row.scheduled_date !== "string") continue
      const isCancelled = row.status === "cancelled"
      const isCompleted = row.status === "completed"
      const explicitlyFromClientRequest = isValidCalendarUuid(row.client_request_id)
      events.push({
        id: row.id,
        projectId: row.project_id,
        projectName: projectNameById.get(row.project_id) ?? "Project",
        date: row.scheduled_date,
        kind: isCancelled
          ? "cancelled"
          : isCompleted
            ? "completed_visit"
            : explicitlyFromClientRequest
              ? "approved_request"
              : "scheduled_visit",
        timeLabel: clockTime(row.scheduled_time),
        secondaryLabel: isCancelled ? "Cancelled" : isCompleted ? "Completed" : "Site Visit",
      })
    }

    events.sort((left, right) =>
      left.date.localeCompare(right.date) ||
      (left.timeLabel ?? "").localeCompare(right.timeLabel ?? "") ||
      left.projectName.localeCompare(right.projectName),
    )

    return {
      monthKey,
      rangeStart,
      rangeEnd,
      events,
      pendingRequests,
      summary: {
        pendingClientRequests: pendingRequests.length,
        upcomingVisits: upcomingResult.count ?? 0,
        todaysVisits: (todayResult.data ?? []).length,
      },
      scheduling: { canSchedule: schedulingProjects.length > 0, projects: schedulingProjects },
    }
  } catch (error) {
    logCalendarError({ operation: "calendar scope or data", userId, projectCount: projects.length, rangeStart, rangeEnd, error })
    throw error
  }
}
