import "server-only"

import { currentCalendarDateKey } from "@/lib/calendar/date"
import { calculateVisitCompliance } from "@/lib/site-visits/compliance"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

export type ProjectReportSchedule = {
  latestReport: {
    id: string
    stageId: string
    title: string
    submittedAt: string
  } | null
  compliance: {
    state: "overdue" | "due_today" | "due_soon" | "on_track"
    nextRequiredVisitDate: string
    daysRemaining: number | null
    daysOverdue: number | null
  } | null
}

const SUBMITTED_STATUSES = ["submitted", "under_review", "approved", "rejected", "completed"]

export async function loadProjectsReportSchedule(
  projectIds: string[],
  projects: Array<{
    id: string
    status: string | null | undefined
    supervisionType: string | null | undefined
    supervisionStartDate: string | null | undefined
    startDate: string | null | undefined
  }>,
): Promise<Map<string, ProjectReportSchedule>> {
  const validIds = Array.from(new Set(projectIds.filter(isUuid)))
  const resultMap = new Map<string, ProjectReportSchedule>()

  if (!validIds.length) return resultMap

  try {
    const admin = createAdminClient()

    const [reportsResult, visitsResult] = await Promise.all([
      admin
        .from("term_responses")
        .select("id, project_id, project_stage_id, report_title, status, submitted_at, created_at")
        .in("project_id", validIds)
        .in("status", SUBMITTED_STATUSES)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      admin
        .from("site_visit_requests")
        .select("id, project_id, completed_at")
        .in("project_id", validIds)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false }),
    ])

    const latestReportByProject = new Map<string, { id: string; stageId: string; title: string; submittedAt: string }>()
    for (const row of reportsResult.data ?? []) {
      const projectId = (row as any).project_id
      const reportId = (row as any).id
      const stageId = (row as any).project_stage_id
      if (!isUuid(projectId) || !isUuid(reportId) || !isUuid(stageId) || latestReportByProject.has(projectId)) continue

      const submittedAt = (row as any).submitted_at || (row as any).created_at
      if (!submittedAt) continue

      latestReportByProject.set(projectId, {
        id: reportId,
        stageId,
        title: typeof (row as any).report_title === "string" && (row as any).report_title.trim()
          ? (row as any).report_title.trim()
          : "Inspection Report",
        submittedAt,
      })
    }

    const latestCompletedVisitAtByProject = new Map<string, string>()
    for (const row of visitsResult.data ?? []) {
      const projectId = (row as any).project_id
      const completedAt = typeof (row as any).completed_at === "string" ? (row as any).completed_at : null
      if (!isUuid(projectId) || !completedAt || latestCompletedVisitAtByProject.has(projectId)) continue
      latestCompletedVisitAtByProject.set(projectId, completedAt)
    }

    const today = currentCalendarDateKey()

    for (const project of projects) {
      if (!isUuid(project.id)) continue

      const latestCompletedVisitAt = latestCompletedVisitAtByProject.get(project.id) ?? null
      const calculation = calculateVisitCompliance(
        {
          status: project.status,
          supervisionType: project.supervisionType,
          latestCompletedVisitAt,
          supervisionStartDate: project.supervisionStartDate,
          startDate: project.startDate,
          legacyFallbackDate: null,
        },
        today,
      )

      resultMap.set(project.id, {
        latestReport: latestReportByProject.get(project.id) ?? null,
        compliance: calculation
          ? {
              state: calculation.state,
              nextRequiredVisitDate: calculation.nextRequiredVisitDate,
              daysRemaining: calculation.daysRemaining,
              daysOverdue: calculation.daysOverdue,
            }
          : null,
      })
    }
  } catch (error) {
    console.error("[projects] loadProjectsReportSchedule error:", error)
  }

  return resultMap
}
