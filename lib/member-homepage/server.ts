import "server-only"

import {
  getCalendarPendingRequestRows,
  getCalendarScheduledSiteVisitRowsForDate,
  getCalendarTodaySiteVisitRowsForDate,
  resolveCalendarProjectScope,
  resolveExplicitSupervisorProjectScope,
} from "@/lib/calendar/server"
import { addCalendarDays, currentCalendarDateKey } from "@/lib/calendar/date"
import type {
  MemberHomepageData,
  MemberHomepageRequest,
  MemberHomepageVisit,
  MemberHomepageVisitComplianceProject,
} from "@/lib/member-homepage/types"
import { calculateVisitCompliance, isVisitComplianceEligible } from "@/lib/site-visits/compliance"
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
  visitComplianceHasError = false,
): MemberHomepageData {
  return {
    summary: { completedReportsToday: 0, requiredReportsToday: 0, tomorrowsVisits: 0, pendingVisitRequests: 0 },
    visitCompliance: { eligibleProjectCount: 0, projects: [] },
    requests: [],
    visits: [],
    visitComplianceHasError,
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
 * matches completion only through the explicit Site Visit -> Stage Report relationship.
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
    const today = currentCalendarDateKey()
    const tomorrow = addCalendarDays(today, 1)

    const [
      stageResult,
      unansweredStageResult,
      pendingResult,
      todayVisitsResult,
      tomorrowVisitsResult,
      complianceProjectsResult,
      complianceCompletedVisitsResult,
    ] = await Promise.all([
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
      visitProjectIds.length
        ? admin
            .from("projects")
            .select("id, name, code, status, supervision_type, supervision_start_date, start_date, assigned_supervisor_id")
            .in("id", visitProjectIds)
            .eq("assigned_supervisor_id", userId)
        : Promise.resolve({ data: [] as any[], error: null }),
      visitProjectIds.length
        ? admin
            .from("site_visit_requests")
            .select("id, project_id, status, completed_at")
            .in("project_id", visitProjectIds)
            .eq("status", "completed")
            .not("completed_at", "is", null)
            .order("completed_at", { ascending: false })
            .order("id", { ascending: false })
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

    let visitComplianceHasError = false
    let eligibleComplianceProjectCount = 0
    let complianceProjects: MemberHomepageVisitComplianceProject[] = []

    if (complianceProjectsResult.error || complianceCompletedVisitsResult.error) {
      visitComplianceHasError = true
      if (complianceProjectsResult.error) {
        logLoadError("Visit Compliance projects", userId, visitProjects.length, complianceProjectsResult.error)
      }
      if (complianceCompletedVisitsResult.error) {
        logLoadError("Visit Compliance completed Site Visits", userId, visitProjects.length, complianceCompletedVisitsResult.error)
      }
    } else {
      const latestCompletedVisitAtByProject = new Map<string, string>()
      for (const visit of complianceCompletedVisitsResult.data ?? []) {
        const projectId = (visit as any).project_id
        const completedAt = typeof (visit as any).completed_at === "string" ? (visit as any).completed_at : null
        if (!isValidUuid(projectId) || !completedAt) continue

        const existing = latestCompletedVisitAtByProject.get(projectId)
        if (!existing || new Date(completedAt).getTime() > new Date(existing).getTime()) {
          latestCompletedVisitAtByProject.set(projectId, completedAt)
        }
      }

      const attentionProjects: MemberHomepageVisitComplianceProject[] = []
      for (const project of complianceProjectsResult.data ?? []) {
        const projectId = (project as any).id
        const assignedSupervisorId = (project as any).assigned_supervisor_id
        const status = typeof (project as any).status === "string" ? (project as any).status : null
        const supervisionType = typeof (project as any).supervision_type === "string" ? (project as any).supervision_type : null

        // The explicit-Supervisor project scope is resolved server-side first, and the
        // detail query independently keeps the current canonical assignment pinned to
        // this authenticated Member. Never broaden compliance merely because role=Member.
        if (!isValidUuid(projectId) || assignedSupervisorId !== userId) continue
        if (!isVisitComplianceEligible(status, supervisionType)) continue
        eligibleComplianceProjectCount += 1

        const calculation = calculateVisitCompliance({
          status,
          supervisionType,
          latestCompletedVisitAt: latestCompletedVisitAtByProject.get(projectId) ?? null,
          supervisionStartDate: typeof (project as any).supervision_start_date === "string"
            ? (project as any).supervision_start_date
            : null,
          startDate: typeof (project as any).start_date === "string" ? (project as any).start_date : null,
          // Phase 1 persists any legacy fallback into supervision_start_date. Do not
          // introduce a moving request-time fallback in the Member surface.
          legacyFallbackDate: null,
        }, today)

        if (!calculation || calculation.state === "on_track") continue
        attentionProjects.push({
          projectId,
          projectName: typeof (project as any).name === "string" && (project as any).name.trim()
            ? (project as any).name.trim()
            : "Project",
          projectCode: typeof (project as any).code === "string" && (project as any).code.trim()
            ? (project as any).code.trim()
            : null,
          supervisionType: calculation.supervisionType,
          state: calculation.state,
          lastCompletedVisitDate: calculation.lastCompletedVisitDate,
          nextRequiredVisitDate: calculation.nextRequiredVisitDate,
          daysRemaining: calculation.daysRemaining,
          daysOverdue: calculation.daysOverdue,
        })
      }

      const urgencyRank = { overdue: 0, due_today: 1, due_soon: 2 } as const
      complianceProjects = attentionProjects.sort((left, right) => {
        const rankDifference = urgencyRank[left.state] - urgencyRank[right.state]
        if (rankDifference) return rankDifference
        if (left.state === "overdue" && right.state === "overdue") {
          const overdueDifference = (right.daysOverdue ?? 0) - (left.daysOverdue ?? 0)
          if (overdueDifference) return overdueDifference
        }
        if (left.state === "due_soon" && right.state === "due_soon") {
          const remainingDifference = (left.daysRemaining ?? 0) - (right.daysRemaining ?? 0)
          if (remainingDifference) return remainingDifference
        }
        return (
          left.projectName.localeCompare(right.projectName) ||
          (left.projectCode ?? "").localeCompare(right.projectCode ?? "") ||
          left.projectId.localeCompare(right.projectId)
        )
      })
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

      const reportObligations = visitRows.map((row: any) => ({
        siteVisitRequestId: row.id as string,
        projectId: row.project_id as string,
      }))

      const explicitReportByVisitId = new Map<string, any>()
      const obligationVisitIds = reportObligations.map((item) => item.siteVisitRequestId)

      if (obligationVisitIds.length) {
        try {
          const userClient = await createServerClient()
          const { data: reportRows, error: reportError } = await userClient
            .from("term_responses")
            .select("id, project_id, project_stage_id, visit_number, status, site_visit_request_id")
            .in("site_visit_request_id", obligationVisitIds)

          if (reportError) {
            todaysReportsHasError = true
            logLoadError("today Stage Report obligations", userId, visitProjects.length, reportError)
          } else {
            const completionStatuses = new Set(["submitted", "under_review", "approved", "completed"])
            const completedRows = (reportRows ?? []).filter((report: any) =>
              isValidUuid(report.id) &&
              isValidUuid(report.project_id) &&
              isValidUuid(report.project_stage_id) &&
              isValidUuid(report.site_visit_request_id) &&
              completionStatuses.has(typeof report.status === "string" ? report.status : ""),
            )

            for (const report of completedRows) {
              explicitReportByVisitId.set((report as any).site_visit_request_id, report)
            }

            completedReportsToday = reportObligations.reduce((count, obligation) => {
              const explicit = explicitReportByVisitId.get(obligation.siteVisitRequestId)
              return explicit?.project_id === obligation.projectId ? count + 1 : count
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
          stageResponseHref: !isCompleted
            ? `/report-entry?siteVisitId=${encodeURIComponent(row.id)}`
            : null,
          googleMapsUrl,
        }]
      })
      visits.sort((left, right) =>
        left.scheduledDate.localeCompare(right.scheduledDate) ||
        (left.scheduledTime ?? "99:99").localeCompare(right.scheduledTime ?? "99:99") ||
        left.id.localeCompare(right.id),
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
      visitCompliance: {
        eligibleProjectCount: eligibleComplianceProjectCount,
        projects: complianceProjects,
      },
      requests,
      visits,
      visitComplianceHasError,
      visitRequestsHasError,
      tomorrowsVisitsHasError,
      todaysReportsHasError,
    }
  } catch (error) {
    logLoadError("member homepage Calendar request scope", userId, calendarProjectCount, error)
    return emptyData(true, true, true, true)
  }
}
