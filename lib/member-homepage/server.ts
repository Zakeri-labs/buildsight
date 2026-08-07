import "server-only"

import { CALENDAR_PENDING_REQUEST_STATUS, resolveExplicitSupervisorProjectScope } from "@/lib/calendar/server"
import type { MemberHomepageData, MemberHomepageRequest, MemberHomepageVisit } from "@/lib/member-homepage/types"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

type SupabaseErrorFields = { code?: string; message?: string; details?: string; hint?: string }

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

function emptyData(visitRequestsHasError = false): MemberHomepageData {
  return {
    summary: { todaysReports: 0, tomorrowsVisits: 0, pendingVisitRequests: 0 },
    requests: [],
    visits: [],
    visitRequestsHasError,
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

/**
 * Read-only operational data for the Member homepage.
 *
 * The project scope is shared with Calendar's canonical explicit-Supervisor resolver:
 * projects.assigned_supervisor_id must equal the authenticated user id.
 *
 * In this stage only Visit Requests are connected to the top summary cards. The
 * Today's Reports and Tomorrow's Visits cards intentionally remain placeholders.
 * The existing lower Today's Visits section remains unchanged.
 */
export async function getMemberHomepageData(userId: string): Promise<MemberHomepageData> {
  if (!isValidUuid(userId)) return emptyData()

  let supervisedProjectCount = 0

  try {
    const projects = await resolveExplicitSupervisorProjectScope(userId)
    const validProjects = projects.filter((project) => isValidUuid(project.id))
    supervisedProjectCount = validProjects.length
    if (!validProjects.length) return emptyData()

    const projectIds = validProjects.map((project) => project.id)
    const projectById = new Map(validProjects.map((project) => [project.id, project]))
    const admin = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)

    const [stageResult, pendingResult, todayVisitsResult] = await Promise.all([
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
        .eq("status", CALENDAR_PENDING_REQUEST_STATUS)
        .not("client_request_id", "is", null)
        .order("preferred_date", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true }),
      // Preserve the already-existing lower Today's Visits section exactly as-is.
      admin
        .from("site_visit_requests")
        .select("id, project_id, scheduled_date, scheduled_time, client_request_id")
        .in("project_id", projectIds)
        .eq("status", "scheduled")
        .eq("scheduled_date", today)
        .order("scheduled_time", { ascending: true, nullsFirst: false }),
    ])

    if (stageResult.error) {
      // Stage is optional display metadata; omit it rather than failing Visit Requests.
      logLoadError("current project stages", userId, supervisedProjectCount, stageResult.error)
    }

    const stageByProjectId = new Map<string, string>()
    for (const stage of stageResult.error ? [] : stageResult.data ?? []) {
      const projectId = (stage as any).project_id
      const name = typeof (stage as any).name === "string" ? (stage as any).name.trim() : ""
      if (!isValidUuid(projectId) || !name || stageByProjectId.has(projectId)) continue
      stageByProjectId.set(projectId, name)
    }

    let visitRequestsHasError = false
    let requests: MemberHomepageRequest[] = []
    if (pendingResult.error) {
      visitRequestsHasError = true
      logLoadError("pending Client Visit Requests", userId, supervisedProjectCount, pendingResult.error)
    } else {
      requests = (pendingResult.data ?? []).flatMap((row: any) => {
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
          // site_visit_requests has no canonical visit number for pending Client Requests.
          visitNumber: null,
        }]
      })
    }

    let visits: MemberHomepageVisit[] = []
    if (todayVisitsResult.error) {
      logLoadError("today Site Visits", userId, supervisedProjectCount, todayVisitsResult.error)
    } else {
      visits = (todayVisitsResult.data ?? []).flatMap((row: any) => {
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
    }

    return {
      summary: {
        // These two cards intentionally remain placeholders until their dedicated stages.
        todaysReports: 0,
        tomorrowsVisits: 0,
        pendingVisitRequests: requests.length,
      },
      requests,
      visits,
      visitRequestsHasError,
    }
  } catch (error) {
    logLoadError("member homepage Supervisor scope", userId, supervisedProjectCount, error)
    return emptyData(true)
  }
}
