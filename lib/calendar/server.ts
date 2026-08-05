import "server-only"

import { getCalendarVisibleRange } from "@/lib/calendar/date"
import type {
  CalendarClientRequestViewModel,
  CalendarDataViewModel,
  CalendarEventViewModel,
} from "@/lib/calendar/types"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const SCHEDULED_VISIT_STATUSES = ["scheduled"] as const
const CALENDAR_VISIT_STATUSES = ["scheduled", "completed", "cancelled"] as const

type ProjectScopeRow = { id: string; name: string }
type SupabaseErrorFields = { code?: string; message?: string; details?: string; hint?: string }

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

function uniqueValidUuids(values: unknown[]): string[] {
  return Array.from(new Set(values.filter(validUuid).map((value) => value.trim())))
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

function logCalendarError({
  operation,
  userId,
  projectCount,
  rangeStart,
  rangeEnd,
  error,
}: {
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

async function resolveCalendarProjectScope(userId: string): Promise<ProjectScopeRow[]> {
  if (!validUuid(userId)) return []
  const admin = createAdminClient()

  const [organizationMembershipResult, projectAdminMembershipResult, supervisorProjectResult] =
    await Promise.all([
      admin
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .eq("role", "org_admin"),
      admin
        .from("project_user_memberships")
        .select("project_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .eq("access_role", "project_admin"),
      admin
        .from("projects")
        .select("id, name")
        .eq("assigned_supervisor_id", userId),
    ])

  if (organizationMembershipResult.error) throw organizationMembershipResult.error
  if (projectAdminMembershipResult.error) throw projectAdminMembershipResult.error
  if (supervisorProjectResult.error) throw supervisorProjectResult.error

  const adminOrganizationIds = uniqueValidUuids(
    (organizationMembershipResult.data ?? []).map((row: any) => row.organization_id),
  )
  const explicitProjectAdminIds = uniqueValidUuids(
    (projectAdminMembershipResult.data ?? []).map((row: any) => row.project_id),
  )

  const [organizationProjectsResult, explicitAdminProjectsResult] = await Promise.all([
    adminOrganizationIds.length
      ? admin
          .from("projects")
          .select("id, name")
          .in("supervising_organization_id", adminOrganizationIds)
      : Promise.resolve({ data: [] as ProjectScopeRow[], error: null }),
    explicitProjectAdminIds.length
      ? admin.from("projects").select("id, name").in("id", explicitProjectAdminIds)
      : Promise.resolve({ data: [] as ProjectScopeRow[], error: null }),
  ])

  if (organizationProjectsResult.error) throw organizationProjectsResult.error
  if (explicitAdminProjectsResult.error) throw explicitAdminProjectsResult.error

  const projects = new Map<string, ProjectScopeRow>()
  for (const row of [
    ...(organizationProjectsResult.data ?? []),
    ...(explicitAdminProjectsResult.data ?? []),
    ...(supervisorProjectResult.data ?? []),
  ] as any[]) {
    if (!validUuid(row.id)) continue
    projects.set(row.id, { id: row.id, name: typeof row.name === "string" ? row.name : "Project" })
  }

  return Array.from(projects.values()).sort((left, right) => left.name.localeCompare(right.name))
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
  }
}

export async function getCalendarData({
  userId,
  monthKey,
}: {
  userId: string
  monthKey: string
}): Promise<CalendarDataViewModel> {
  const { rangeStart, rangeEnd } = getCalendarVisibleRange(monthKey)
  let projects: ProjectScopeRow[] = []

  try {
    projects = await resolveCalendarProjectScope(userId)
    const projectIds = uniqueValidUuids(projects.map((project) => project.id))
    if (!projectIds.length) return createEmptyCalendarData(monthKey)

    const admin = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const requestColumns =
      "id, project_id, requested_by, client_request_id, status, preferred_date, is_asap, preferred_time, notes, scheduled_date, scheduled_time, created_at"

    const [pendingResult, pendingRangeResult, visitRangeResult, upcomingResult, todayResult] =
      await Promise.all([
        admin
          .from("site_visit_requests")
          .select(requestColumns)
          .in("project_id", projectIds)
          .eq("status", "pending")
          .order("preferred_date", { ascending: true, nullsFirst: true })
          .order("created_at", { ascending: true }),
        admin
          .from("site_visit_requests")
          .select(requestColumns)
          .in("project_id", projectIds)
          .eq("status", "pending")
          .gte("preferred_date", rangeStart)
          .lte("preferred_date", rangeEnd),
        admin
          .from("site_visit_requests")
          .select(requestColumns)
          .in("project_id", projectIds)
          .in("status", [...CALENDAR_VISIT_STATUSES])
          .gte("scheduled_date", rangeStart)
          .lte("scheduled_date", rangeEnd),
        admin
          .from("site_visit_requests")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds)
          .in("status", [...SCHEDULED_VISIT_STATUSES])
          .gt("scheduled_date", today),
        admin
          .from("site_visit_requests")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds)
          .in("status", [...SCHEDULED_VISIT_STATUSES])
          .eq("scheduled_date", today),
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
        logCalendarError({
          operation,
          userId,
          projectCount: projects.length,
          rangeStart,
          rangeEnd,
          error: result.error,
        })
        throw result.error
      }
    }

    const pendingRows = pendingResult.data ?? []
    const requesterIds = uniqueValidUuids(pendingRows.map((row: any) => row.requested_by))
    const profileResult = requesterIds.length
      ? await admin.from("profiles").select("id, full_name, email").in("id", requesterIds)
      : { data: [] as any[], error: null }
    if (profileResult.error) {
      logCalendarError({
        operation: "requester profiles",
        userId,
        projectCount: projects.length,
        rangeStart,
        rangeEnd,
        error: profileResult.error,
      })
      // Requester names are optional display data and must not break the calendar.
    }

    const projectNameById = new Map(projects.map((project) => [project.id, project.name]))
    const profileById = new Map((profileResult.data ?? []).map((profile: any) => [profile.id, profile]))

    const pendingRequests: CalendarClientRequestViewModel[] = pendingRows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      projectName: projectNameById.get(row.project_id) ?? "Project",
      requestedDate: typeof row.preferred_date === "string" ? row.preferred_date : null,
      isAsap: Boolean(row.is_asap),
      preferredTimeLabel: preferredTimeLabel(row.preferred_time),
      requestedBy: profileName(profileById.get(row.requested_by)),
      notesPreview: notesPreview(row.notes),
      status: "pending",
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
      const explicitlyFromClientRequest = validUuid(row.client_request_id)
      events.push({
        id: row.id,
        projectId: row.project_id,
        projectName: projectNameById.get(row.project_id) ?? "Project",
        date: row.scheduled_date,
        kind: isCancelled
          ? "cancelled"
          : explicitlyFromClientRequest
            ? "approved_request"
            : "scheduled_visit",
        timeLabel: clockTime(row.scheduled_time),
        secondaryLabel: isCancelled ? "Cancelled" : "Site Visit",
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
        todaysVisits: todayResult.count ?? 0,
      },
    }
  } catch (error) {
    logCalendarError({
      operation: "calendar scope or data",
      userId,
      projectCount: projects.length,
      rangeStart,
      rangeEnd,
      error,
    })
    throw error
  }
}
