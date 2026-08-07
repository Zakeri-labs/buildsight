import "server-only"

import {
  getCalendarPendingRequestRows,
  getCalendarScheduledSiteVisitRowsForDate,
  getCalendarTodaySiteVisitRowsForDate,
  resolveCalendarProjectScope,
  resolveExplicitSupervisorProjectScope,
} from "@/lib/calendar/server"
import type { MemberHomepageData, MemberHomepageRequest, MemberHomepageVisit } from "@/lib/member-homepage/types"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerClient } from "@/lib/supabase/server"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

type SupabaseErrorFields = { code?: string; message?: string; details?: string; hint?: string }

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

function emptyData(
  visitRequestsHasError = false,
  tomorrowsVisitsHasError = false,
  todaysReportsHasError = false,
): MemberHomepageData {
  return {
    summary: { completedReportsToday: 0, requiredReportsToday: 0, tomorrowsVisits: 0, pendingVisitRequests: 0 },
    requests: [],
    visits: [],
    visitRequestsHasError,
    tomorrowsVisitsHasError,
    todaysReportsHasError,
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
 * Today's Reports derives its denominator from the same Today Site Visit rows and
 * matches completion only through the explicit Site Visit -> Stage Report relationship
 * (with the existing Project + Stage + Visit Number identity as a legacy read fallback).
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
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [] as any[], error: null }),
      requestProjectIds.length
        ? getCalendarPendingRequestRows(requestProjectIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      visitProjectIds.length
        ? getCalendarTodaySiteVisitRowsForDate(visitProjectIds, today)
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
    const stageNameById = new Map<string, string>()
    for (const stage of unansweredStageResult.error ? [] : unansweredStageResult.data ?? []) {
      const projectId = (stage as any).project_id
      const stageId = (stage as any).id
      const name = typeof (stage as any).name === "string" ? (stage as any).name.trim() : ""
      const status = typeof (stage as any).status === "string" ? (stage as any).status : ""
      if (isValidUuid(stageId) && name) stageNameById.set(stageId, name)
      if (
        !isValidUuid(projectId) ||
        !isValidUuid(stageId) ||
        !name ||
        status === "completed" ||
        status === "disabled" ||
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
    let requiredReportsToday = 0
    let completedReportsToday = 0
    let todaysReportsHasError = false

    if (todayVisitsResult.error) {
      logLoadError("today Site Visits", userId, visitProjects.length, todayVisitsResult.error)
      todaysReportsHasError = true
    } else {
      const visitRows = (todayVisitsResult.data ?? []).filter((row: any) =>
        isValidUuid(row.id) &&
        isValidUuid(row.project_id) &&
        typeof row.scheduled_date === "string" &&
        (row.status === "scheduled" || row.status === "completed"),
      )
      requiredReportsToday = visitRows.length

      const reportObligations = visitRows.map((row: any) => {
        const stage = unansweredStageByProjectId.get(row.project_id) ?? null
        const reservedVisitNumber = Number.isInteger(row.report_visit_number) && row.report_visit_number > 0
          ? row.report_visit_number as number
          : null
        return {
          siteVisitRequestId: row.id as string,
          projectId: row.project_id as string,
          stageId: stage?.id ?? null,
          visitNumber: reservedVisitNumber,
        }
      })

      const explicitReportByVisitId = new Map<string, any>()
      const legacyReportByIdentity = new Map<string, any>()
      const obligationProjectIds = Array.from(new Set(reportObligations.map((item) => item.projectId)))

      if (reportObligations.length && obligationProjectIds.length) {
        try {
          const userClient = await createServerClient()
          const { data: reportRows, error: reportError } = await userClient
            .from("term_responses")
            .select("id, project_id, project_stage_id, visit_number, status, site_visit_request_id")
            .in("project_id", obligationProjectIds)

          if (reportError) {
            todaysReportsHasError = true
            logLoadError("today Stage Report obligations", userId, visitProjects.length, reportError)
          } else {
            const completionStatuses = new Set(["submitted", "under_review", "approved", "completed"])
            const completedRows = (reportRows ?? []).filter((report: any) =>
              isValidUuid(report.id) &&
              isValidUuid(report.project_id) &&
              isValidUuid(report.project_stage_id) &&
              completionStatuses.has(typeof report.status === "string" ? report.status : ""),
            )

            for (const report of completedRows) {
              if (isValidUuid((report as any).site_visit_request_id)) {
                explicitReportByVisitId.set((report as any).site_visit_request_id, report)
              }
              if (Number.isInteger((report as any).visit_number) && (report as any).visit_number > 0) {
                legacyReportByIdentity.set(
                  `${(report as any).project_id}:${(report as any).project_stage_id}:${(report as any).visit_number}`,
                  report,
                )
              }
            }

            completedReportsToday = reportObligations.reduce((count, obligation) => {
              const explicit = explicitReportByVisitId.get(obligation.siteVisitRequestId)
              if (explicit && explicit.project_id === obligation.projectId) return count + 1

              if (obligation.stageId && obligation.visitNumber) {
                const legacy = legacyReportByIdentity.get(
                  `${obligation.projectId}:${obligation.stageId}:${obligation.visitNumber}`,
                )
                if (legacy) return count + 1
              }
              return count
            }, 0)
            completedReportsToday = Math.min(completedReportsToday, requiredReportsToday)
          }
        } catch (error) {
          todaysReportsHasError = true
          logLoadError("today Stage Report obligations", userId, visitProjects.length, error)
        }
      }

      visits = visitRows.flatMap((row: any) => {
        const project = visitProjectById.get(row.project_id)
        if (!project) return []

        const isCompleted = row.status === "completed"
        const linkedReport = isCompleted ? explicitReportByVisitId.get(row.id) ?? null : null
        const linkedReportMatchesProject = linkedReport?.project_id === row.project_id
        const linkedStageId = linkedReportMatchesProject && isValidUuid(linkedReport?.project_stage_id)
          ? linkedReport.project_stage_id as string
          : null
        const activeStage = isCompleted ? null : unansweredStageByProjectId.get(row.project_id) ?? null
        const stageId = linkedStageId ?? activeStage?.id ?? null
        const stageName = linkedStageId ? stageNameById.get(linkedStageId) ?? null : activeStage?.name ?? null
        const linkedVisitNumber = linkedReportMatchesProject && Number.isInteger(linkedReport?.visit_number) && linkedReport.visit_number > 0
          ? linkedReport.visit_number as number
          : null
        const reservedVisitNumber = Number.isInteger(row.report_visit_number) && row.report_visit_number > 0
          ? row.report_visit_number as number
          : null
        const visitNumber = isCompleted ? linkedVisitNumber ?? reservedVisitNumber : reservedVisitNumber
        const hasCoordinates = project.latitude !== null && project.longitude !== null
        const googleMapsUrl = hasCoordinates
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${project.latitude},${project.longitude}`)}`
          : null

        return [{
          id: row.id,
          status: isCompleted ? "completed" as const : "scheduled" as const,
          scheduledDate: row.scheduled_date,
          scheduledTime: clockTime(row.scheduled_time),
          projectName: project.name?.trim() || "Project",
          projectCode: project.code?.trim() || null,
          stageName,
          visitNumber,
          stageResponseHref: !isCompleted && stageId
            ? `/projects/${project.id}/stages/${stageId}/reports/new?siteVisitRequestId=${encodeURIComponent(row.id)}`
            : null,
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
        completedReportsToday,
        requiredReportsToday,
        tomorrowsVisits,
        pendingVisitRequests: requests.length,
      },
      requests,
      visits,
      visitRequestsHasError,
      tomorrowsVisitsHasError,
      todaysReportsHasError,
    }
  } catch (error) {
    logLoadError("member homepage Calendar request scope", userId, calendarProjectCount, error)
    return emptyData(true, true, true)
  }
}
