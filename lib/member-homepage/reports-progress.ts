/**
 * Pure calculation logic for the Supervisor / Member Home page "Today's Reports" progress counter.
 *
 * Denominator (Required Reports Today):
 * - Total number of valid Site Visits scheduled for today for the supervisor's assigned projects
 *   with status "scheduled" or "completed".
 *
 * Numerator (Completed Reports Today):
 * - Number of today's visit obligations that are completed.
 * - An obligation is completed if EITHER:
 *   a) The Site Visit has been marked as completed (status = "completed", e.g. via manual "Mark as Completed").
 *   b) The Site Visit has an attached Stage Report in term_responses with a completed status
 *      ("submitted" | "under_review" | "approved" | "completed") matching the visit's project.
 * - Deduplication: A visit meeting both conditions is counted exactly ONCE.
 * - Upper bound: completedReportsToday is capped at requiredReportsToday.
 */

export interface TodayVisitProgressRow {
  id: string
  projectId: string
  status: string
}

export interface TodayLinkedReportProgressRow {
  id: string
  projectId: string
  siteVisitRequestId: string
  status: string
}

export const REPORT_COMPLETION_STATUSES = new Set([
  "submitted",
  "under_review",
  "approved",
  "completed",
])

export function isReportStatusCompleted(status: unknown): boolean {
  return typeof status === "string" && REPORT_COMPLETION_STATUSES.has(status)
}

export function calculateTodayReportsProgress({
  visitRows,
  linkedReportRows,
}: {
  visitRows: TodayVisitProgressRow[]
  linkedReportRows?: TodayLinkedReportProgressRow[] | null
}): {
  requiredReportsToday: number
  completedReportsToday: number
} {
  const requiredReportsToday = visitRows.length

  const explicitReportByVisitId = new Map<string, TodayLinkedReportProgressRow>()
  for (const report of linkedReportRows ?? []) {
    if (isReportStatusCompleted(report.status)) {
      explicitReportByVisitId.set(report.siteVisitRequestId, report)
    }
  }

  let completedReportsToday = 0
  for (const visit of visitRows) {
    const isVisitCompleted = visit.status === "completed"
    const explicitReport = explicitReportByVisitId.get(visit.id)
    const hasLinkedReport = Boolean(explicitReport && explicitReport.projectId === visit.projectId)

    if (isVisitCompleted || hasLinkedReport) {
      completedReportsToday += 1
    }
  }

  return {
    requiredReportsToday,
    completedReportsToday: Math.min(completedReportsToday, requiredReportsToday),
  }
}
