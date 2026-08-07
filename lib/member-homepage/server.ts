import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { MemberHomepageData, MemberHomepageRequest, MemberHomepageVisit } from "@/lib/member-homepage/types"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const ACTIONABLE_REPORT_STATUSES = new Set(["draft", "in_progress", "rejected"])

type SupabaseErrorFields = { code?: string; message?: string; details?: string; hint?: string }

type ProjectRow = {
  id: string
  name: string
  code: string | null
}

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

function emptyData(hasError = false): MemberHomepageData {
  return {
    summary: { todaysReports: 0, todaysVisits: 0, pendingVisitRequests: 0 },
    requests: [],
    visits: [],
    hasError,
  }
}

function errorFields(error: unknown): SupabaseErrorFields {
  if (!error || typeof error !== "object") return {}
  const value = error as Record<string, unknown>
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    details: typeof value.details === "string" ? value.details : undefined,
    hint: typeof value.hint === "string" ? value.hint : undefined,
  }
}

function logLoadError(operation: string, userId: string, supervisedProjectCount: number, error: unknown) {
  const fields = errorFields(error)
  console.error("[member-homepage] data load failed", {
    operation,
    userId,
    supervisedProjectCount,
    code: fields.code ?? null,
    message: fields.message ?? "Unknown Supabase error",
    details: fields.details ?? null,
    hint: fields.hint ?? null,
  })
}

function preferredTimeLabel(value: unknown): string | null {
  if (value === "morning") return "Morning"
  if (value === "afternoon") return "Afternoon"
  if (value === "any_time") return "Any time"
  return null
}

function clockTime(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return /^\d{2}:\d{2}/.test(normalized) ? normalized.slice(0, 5) : null
}

function utcDayBounds(date = new Date()) {
  const today = date.toISOString().slice(0, 10)
  const tomorrowDate = new Date(`${today}T00:00:00.000Z`)
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
  return {
    today,
    start: `${today}T00:00:00.000Z`,
    end: tomorrowDate.toISOString(),
  }
}

/**
 * Read-only operational data for the Member homepage.
 *
 * Supervisor scope intentionally uses only projects.assigned_supervisor_id.
 * It does not inherit project membership, participant, cookie, or dashboard scope.
 */
export async function getMemberHomepageData(userId: string): Promise<MemberHomepageData> {
  if (!isValidUuid(userId)) return emptyData()

  const admin = createAdminClient()
  let supervisedProjectCount = 0

  try {
    const { data: projectRows, error: projectError } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("assigned_supervisor_id", userId)
      .order("name", { ascending: true })

    if (projectError) throw projectError

    const projects = ((projectRows ?? []) as ProjectRow[]).filter((project) => isValidUuid(project.id))
    supervisedProjectCount = projects.length
    if (!projects.length) return emptyData()

    const projectIds = projects.map((project) => project.id)
    const projectById = new Map(projects.map((project) => [project.id, project]))
    const { today, start, end } = utcDayBounds()

    const [stageResult, pendingResult, todayVisitsResult, reportResult] = await Promise.all([
      admin
        .from("project_stages")
        .select("id, project_id, name, sort_order")
        .in("project_id", projectIds)
        .eq("status", "in_progress")
        .order("sort_order", { ascending: true }),
      admin
        .from("site_visit_requests")
        .select("id, project_id, preferred_date, preferred_time, created_at, client_request_id")
        .in("project_id", projectIds)
        .eq("status", "pending")
        .not("client_request_id", "is", null)
        .order("preferred_date", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true }),
      admin
        .from("site_visit_requests")
        .select("id, project_id, scheduled_date, scheduled_time, client_request_id")
        .in("project_id", projectIds)
        .eq("status", "scheduled")
        .eq("scheduled_date", today)
        .order("scheduled_time", { ascending: true, nullsFirst: false }),
      // The active Stage-based report model has no explicit due-date relationship to Site Visits.
      // Count only reports explicitly assigned to this user that were created today and still need their action.
      admin
        .from("term_responses")
        .select("id, status")
        .in("project_id", projectIds)
        .eq("responsible_user_id", userId)
        .not("project_stage_id", "is", null)
        .gte("created_at", start)
        .lt("created_at", end),
    ])

    // Requests and visits are the operational core of this page. Fail safely if either cannot be loaded.
    for (const [operation, result] of [
      ["pending Client Visit Requests", pendingResult],
      ["today Site Visits", todayVisitsResult],
    ] as const) {
      if (result.error) {
        logLoadError(operation, userId, supervisedProjectCount, result.error)
        throw result.error
      }
    }

    let hasPartialError = false
    if (stageResult.error) {
      hasPartialError = true
      logLoadError("current project stages", userId, supervisedProjectCount, stageResult.error)
    }
    if (reportResult.error) {
      hasPartialError = true
      logLoadError("today Stage-based reports", userId, supervisedProjectCount, reportResult.error)
    }

    const stageByProjectId = new Map<string, string>()
    for (const stage of stageResult.error ? [] : stageResult.data ?? []) {
      const projectId = (stage as any).project_id
      const name = typeof (stage as any).name === "string" ? (stage as any).name.trim() : ""
      if (!isValidUuid(projectId) || !name || stageByProjectId.has(projectId)) continue
      stageByProjectId.set(projectId, name)
    }

    const requests: MemberHomepageRequest[] = (pendingResult.data ?? []).flatMap((row: any) => {
      if (!isValidUuid(row.id) || !isValidUuid(row.project_id)) return []
      const project = projectById.get(row.project_id)
      if (!project) return []
      return [{
        id: row.id,
        requestedDate: typeof row.preferred_date === "string" ? row.preferred_date : null,
        preferredTimeLabel: preferredTimeLabel(row.preferred_time),
        projectName: project.name?.trim() || "Project",
        projectCode: project.code?.trim() || null,
        stageName: stageByProjectId.get(row.project_id) ?? null,
        visitNumber: null,
      }]
    })

    const visits: MemberHomepageVisit[] = (todayVisitsResult.data ?? []).flatMap((row: any) => {
      if (!isValidUuid(row.id) || !isValidUuid(row.project_id) || typeof row.scheduled_date !== "string") return []
      const project = projectById.get(row.project_id)
      if (!project) return []
      return [{
        id: row.id,
        scheduledDate: row.scheduled_date,
        scheduledTime: clockTime(row.scheduled_time),
        projectName: project.name?.trim() || "Project",
        projectCode: project.code?.trim() || null,
        stageName: stageByProjectId.get(row.project_id) ?? null,
        visitNumber: null,
      }]
    })

    visits.sort((left, right) =>
      (left.scheduledTime ?? "99:99").localeCompare(right.scheduledTime ?? "99:99") ||
      left.projectName.localeCompare(right.projectName),
    )

    const todaysReports = reportResult.error
      ? 0
      : (reportResult.data ?? []).filter((row: any) => ACTIONABLE_REPORT_STATUSES.has(row.status)).length

    return {
      summary: {
        todaysReports,
        todaysVisits: visits.length,
        pendingVisitRequests: requests.length,
      },
      requests,
      visits,
      hasError: hasPartialError,
    }
  } catch (error) {
    logLoadError("member homepage", userId, supervisedProjectCount, error)
    return emptyData(true)
  }
}
