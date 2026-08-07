import "server-only"

import {
  getCalendarPendingRequestRows,
  getCalendarScheduledSiteVisitRowsForDate,
  resolveCalendarProjectScope,
  resolveExplicitSupervisorProjectScope,
} from "@/lib/calendar/server"
import { loadNextProjectVisitNumber } from "@/lib/db/project-stages"
import type { MemberHomepageData, MemberHomepageRequest, MemberHomepageVisit } from "@/lib/member-homepage/types"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

type SupabaseErrorFields = { code?: string; message?: string; details?: string; hint?: string }

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

function emptyData(visitRequestsHasError = false, tomorrowsVisitsHasError = false): MemberHomepageData {
  return {
    summary: { todaysReports: 0, tomorrowsVisits: 0, pendingVisitRequests: 0 },
    requests: [],
    visits: [],
    visitRequestsHasError,
    tomorrowsVisitsHasError,
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
 * Visit Requests reuse Calendar's exact server-side project scope and pending-request
 * query. Today's Visits and Tomorrow's Visits reuse Calendar's scheduled-visit query
 * with the same explicit-Supervisor scope and date/status semantics.
 *
 * The Today's Reports card intentionally remains a placeholder.
 */
export async function getMemberHomepageData(userId: string): Promise<MemberHomepageData> {
  if (!isValidUuid(userId)) return emptyData()

  let calendarProjectCount = 0

  try {
    // Visit Requests use Calendar's resolved project scope. Today's Visits stay limited
    // to the exact explicit-Supervisor scope required for a non-admin Member.
    const [calendarProjects, explicitSupervisorProjects] = await Promise.all([
      resolveCalendarProjectScope(userId),
      resolveExplicitSupervisorProjectScope(userId),
    ])

    const requestProjects = calendarProjects.filter((project) => isValidUuid(project.id))
    const visitProjects = explicitSupervisorProjects.filter((project) => isValidUuid(project.id))
    const requestProjectIds = Array.from(new Set(requestProjects.map((project) => project.id)))
    const visitProjectIds = Array.from(new Set(visitProjects.map((project) => project.id)))
    calendarProjectCount = requestProjectIds.length

    if (!requestProjectIds.length && !visitProjectIds.length) return emptyData()

    const requestProjectById = new Map(requestProjects.map((project) => [project.id, project]))
    const visitProjectById = new Map(visitProjects.map((project) => [project.id, project]))
    const metadataProjectIds = Array.from(new Set([...requestProjectIds, ...visitProjectIds]))
    const admin = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`)
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)

    const [stageResult, unansweredStageResult, pendingResult, todayVisitsResult, tomorrowVisitsResult] = await Promise.all([
      metadataProjectIds.length
        ? admin
            .from("project_stages")
            .select("id, project_id, name, sort_order")
            .in("project_id", metadataProjectIds)
            .eq("status", "in_progress")
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as any[], error: null }),
      visitProjectIds.length
        ? admin
            .from("project_stages")
            .select("id, project_id, name, status, sort_order")
            .in("project_id", visitProjectIds)
            .neq("status", "disabled")
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as any[], error: null }),
      requestProjectIds.length
        ? getCalendarPendingRequestRows(requestProjectIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      visitProjectIds.length
        ? getCalendarScheduledSiteVisitRowsForDate(visitProjectIds, today)
        : Promise.resolve({ data: [] as any[], error: null }),
      visitProjectIds.length
        ? getCalendarScheduledSiteVisitRowsForDate(visitProjectIds, tomorrow)
        : Promise.resolve({ data: [] as any[], error: null }),
    ])

    if (stageResult.error) {
      // Stage is optional display metadata; omit it rather than failing requests or visits.
      logLoadError("current project stages", userId, calendarProjectCount, stageResult.error)
    }

    const stageByProjectId = new Map<string, { id: string; name: string }>()
    for (const stage of stageResult.error ? [] : stageResult.data ?? []) {
      const projectId = (stage as any).project_id
      const stageId = (stage as any).id
      const name = typeof (stage as any).name === "string" ? (stage as any).name.trim() : ""
      if (!isValidUuid(projectId) || !isValidUuid(stageId) || !name || stageByProjectId.has(projectId)) continue
      stageByProjectId.set(projectId, { id: stageId, name })
    }

    if (unansweredStageResult.error) {
      // The Stage is optional row metadata; a failure must not hide a valid scheduled visit.
      logLoadError("unanswered project stages", userId, visitProjects.length, unansweredStageResult.error)
    }

    // project_stages.status is the active Stage-based workflow rollup. A Stage becomes
    // completed only when its direct Stage reports are all approved/completed. Following
    // the canonical sort_order, the first non-completed Stage is therefore the next/current
    // Stage that still requires a response. Reading this state does not create a report or
    // increment the existing project-wide Visit Number sequence.
    const unansweredStageByProjectId = new Map<string, { id: string; name: string }>()
    for (const stage of unansweredStageResult.error ? [] : unansweredStageResult.data ?? []) {
      const projectId = (stage as any).project_id
      const stageId = (stage as any).id
      const name = typeof (stage as any).name === "string" ? (stage as any).name.trim() : ""
      const status = typeof (stage as any).status === "string" ? (stage as any).status : ""
      if (
        !isValidUuid(projectId) ||
        !isValidUuid(stageId) ||
        !name ||
        status === "completed" ||
        unansweredStageByProjectId.has(projectId)
      ) continue
      unansweredStageByProjectId.set(projectId, { id: stageId, name })
    }

    let visitRequestsHasError = false
    let requests: MemberHomepageRequest[] = []
    if (pendingResult.error) {
      visitRequestsHasError = true
      logLoadError("pending Client Visit Requests", userId, calendarProjectCount, pendingResult.error)
    } else {
      requests = (pendingResult.data ?? []).flatMap((row: any) => {
        if (!isValidUuid(row.id) || !isValidUuid(row.project_id)) return []
        const project = requestProjectById.get(row.project_id)
        if (!project) return []
        return [{
          id: row.id,
          requestedDate: typeof row.preferred_date === "string" ? row.preferred_date : null,
          preferredTimeLabel: preferredTimeLabel(row.preferred_time),
          projectName: project.name?.trim() || "Project",
          projectCode: project.code?.trim() || null,
          stageName: stageByProjectId.get(row.project_id)?.name ?? null,
          // site_visit_requests has no canonical visit number for pending Client Requests.
          visitNumber: null,
        }]
      })
    }

    let visits: MemberHomepageVisit[] = []
    if (todayVisitsResult.error) {
      logLoadError("today Site Visits", userId, visitProjects.length, todayVisitsResult.error)
    } else {
      const visitRows = (todayVisitsResult.data ?? []).filter((row: any) =>
        isValidUuid(row.id) && isValidUuid(row.project_id) && typeof row.scheduled_date === "string",
      )
      const visitNumberProjectIds = Array.from(new Set(visitRows.map((row: any) => row.project_id as string)))
      const visitNumberByProjectId = new Map<string, number | null>()

      await Promise.all(visitNumberProjectIds.map(async (projectId) => {
        try {
          visitNumberByProjectId.set(projectId, await loadNextProjectVisitNumber(projectId))
        } catch (error) {
          logLoadError("Stage Report Visit Number", userId, visitProjects.length, error)
          visitNumberByProjectId.set(projectId, null)
        }
      }))

      visits = visitRows.flatMap((row: any) => {
        const project = visitProjectById.get(row.project_id)
        if (!project) return []
        const stage = unansweredStageByProjectId.get(row.project_id) ?? null
        const hasCoordinates = project.latitude !== null && project.longitude !== null
        const googleMapsUrl = hasCoordinates
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${project.latitude},${project.longitude}`)}`
          : null

        return [{
          id: row.id,
          scheduledDate: row.scheduled_date,
          scheduledTime: clockTime(row.scheduled_time),
          projectName: project.name?.trim() || "Project",
          projectCode: project.code?.trim() || null,
          stageName: stage?.name ?? null,
          visitNumber: visitNumberByProjectId.get(row.project_id) ?? null,
          stageResponseHref: stage ? `/projects/${project.id}/stages/${stage.id}/reports/new` : null,
          googleMapsUrl,
        }]
      })
      visits.sort((left, right) =>
        (left.scheduledTime ?? "99:99").localeCompare(right.scheduledTime ?? "99:99") ||
        left.projectName.localeCompare(right.projectName),
      )
    }

    let tomorrowsVisitsHasError = false
    let tomorrowsVisits = 0
    if (tomorrowVisitsResult.error) {
      tomorrowsVisitsHasError = true
      logLoadError("tomorrow Site Visits", userId, visitProjects.length, tomorrowVisitsResult.error)
    } else {
      tomorrowsVisits = (tomorrowVisitsResult.data ?? []).filter((row: any) =>
        isValidUuid(row.id) &&
        isValidUuid(row.project_id) &&
        typeof row.scheduled_date === "string" &&
        row.scheduled_date === tomorrow,
      ).length
    }

    return {
      summary: {
        // Today's Reports intentionally remains a placeholder until its dedicated stage.
        todaysReports: 0,
        tomorrowsVisits,
        pendingVisitRequests: requests.length,
      },
      requests,
      visits,
      visitRequestsHasError,
      tomorrowsVisitsHasError,
    }
  } catch (error) {
    logLoadError("member homepage Calendar request scope", userId, calendarProjectCount, error)
    return emptyData(true, true)
  }
}
