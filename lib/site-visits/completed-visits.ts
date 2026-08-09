import "server-only"

import type { DashboardActivityDateFilter, DashboardDateRange } from "@/lib/dashboard/date-range"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const SCHEDULING_AUDIT_ACTIONS = new Set([
  "site_visit.scheduled",
  "site_visit.request_approved_and_scheduled",
])

function asUuid(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return UUID_PATTERN.test(normalized) ? normalized : null
}

function validUuidList(values: unknown[]): string[] {
  return Array.from(new Set(values.map(asUuid).filter((value): value is string => Boolean(value))))
}

function validInstant(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function auditAssignedUserIds(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return []
  const value = (metadata as Record<string, unknown>).assignedUserIds
  if (!Array.isArray(value)) return []
  return validUuidList(value)
}

export type CanonicalCompletedSiteVisit = {
  id: string
  projectId: string
  reportVisitNumber: number | null
  completedAt: string
  completedAtSource: "completed_at" | "completion_audit" | "legacy_updated_at"
  scheduledDate: string | null
  scheduledTime: string | null
  scheduledBy: string | null
  assignmentFallbackUserIds: string[]
}

/**
 * Load the application's canonical completed Site Visit entity.
 *
 * Calendar, Member Homepage, scheduling, completion and Report -> siteVisitId all use
 * public.site_visit_requests. Current completion writes status='completed' + completed_at.
 * The Site Visits page itself historically treated status='completed' as the completed
 * state, so older rows can legitimately predate a populated completed_at. For those rows
 * use the persisted site_visit.completed audit instant when available, then the row's
 * trigger-maintained updated_at as a final stable legacy transition timestamp.
 */
export async function loadCanonicalCompletedSiteVisits(
  projectIds: string[],
  range?: Pick<DashboardDateRange, "startUtc" | "endExclusiveUtc">,
): Promise<CanonicalCompletedSiteVisit[]> {
  const scopedProjectIds = validUuidList(projectIds)
  if (!scopedProjectIds.length) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("site_visit_requests")
    .select("id, project_id, report_visit_number, status, completed_at, updated_at, scheduled_date, scheduled_time, scheduled_by")
    .in("project_id", scopedProjectIds)
    .eq("status", "completed")

  if (error) throw error
  const completedRows = data ?? []
  const completedVisitIds = validUuidList(completedRows.map((row: any) => row.id))
  if (!completedVisitIds.length) return []

  // Existing audit events are useful only as legacy recovery metadata. They do not create
  // or infer a completed Visit; the Site Visit row must already be canonically completed.
  const { data: auditRows, error: auditError } = await admin
    .from("audit_logs")
    .select("entity_id, action, metadata, created_at")
    .eq("entity_type", "site_visit_request")
    .in("entity_id", completedVisitIds)
    .in("action", [
      "site_visit.completed",
      "site_visit.scheduled",
      "site_visit.request_approved_and_scheduled",
    ])
    .order("created_at", { ascending: false })

  if (auditError) throw auditError

  const completionAuditByVisitId = new Map<string, string>()
  const schedulingAssignmentByVisitId = new Map<string, string[]>()
  for (const audit of auditRows ?? []) {
    const visitId = asUuid((audit as any).entity_id)
    if (!visitId) continue
    const action = typeof (audit as any).action === "string" ? (audit as any).action : ""

    if (action === "site_visit.completed" && !completionAuditByVisitId.has(visitId)) {
      const createdAt = validInstant((audit as any).created_at)
      if (createdAt) completionAuditByVisitId.set(visitId, createdAt)
      continue
    }

    if (SCHEDULING_AUDIT_ACTIONS.has(action) && !schedulingAssignmentByVisitId.has(visitId)) {
      schedulingAssignmentByVisitId.set(visitId, auditAssignedUserIds((audit as any).metadata))
    }
  }

  const rangeStart = range?.startUtc ? Date.parse(range.startUtc) : null
  const rangeEnd = range?.endExclusiveUtc ? Date.parse(range.endExclusiveUtc) : null

  return completedRows.flatMap((row: any) => {
    const id = asUuid(row.id)
    const projectId = asUuid(row.project_id)
    if (!id || !projectId) return []

    const explicitCompletedAt = validInstant(row.completed_at)
    const completionAuditAt = explicitCompletedAt ? null : completionAuditByVisitId.get(id) ?? null
    const legacyUpdatedAt = explicitCompletedAt || completionAuditAt ? null : validInstant(row.updated_at)
    const completedAt = explicitCompletedAt ?? completionAuditAt ?? legacyUpdatedAt
    if (!completedAt) return []

    const completedAtMs = Date.parse(completedAt)
    if (rangeStart !== null && Number.isFinite(rangeStart) && completedAtMs < rangeStart) return []
    if (rangeEnd !== null && Number.isFinite(rangeEnd) && completedAtMs >= rangeEnd) return []

    return [{
      id,
      projectId,
      reportVisitNumber: Number.isInteger(row.report_visit_number) && row.report_visit_number > 0
        ? row.report_visit_number
        : null,
      completedAt,
      completedAtSource: explicitCompletedAt
        ? "completed_at" as const
        : completionAuditAt
          ? "completion_audit" as const
          : "legacy_updated_at" as const,
      scheduledDate: typeof row.scheduled_date === "string" ? row.scheduled_date : null,
      scheduledTime: typeof row.scheduled_time === "string" ? row.scheduled_time : null,
      scheduledBy: asUuid(row.scheduled_by),
      assignmentFallbackUserIds: schedulingAssignmentByVisitId.get(id) ?? [],
    }]
  })
}


export type DashboardSiteVisitActivity = {
  id: string
  projectId: string
  status: "completed" | "scheduled"
  activityAt: string | null
  completedAt: string | null
  completedAtSource: "completed_at" | "completion_audit" | "legacy_updated_at" | null
  scheduledDate: string | null
  scheduledTime: string | null
  reportVisitNumber: number | null
  assignmentFallbackUserIds: string[]
}

function normalizedVisitStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function isScheduledDateInRange(
  scheduledDate: string | null,
  range?: DashboardActivityDateFilter | null,
): boolean {
  if (!range) return true
  if (!scheduledDate || !range.startDate || !range.endDate) return false
  return scheduledDate >= range.startDate && scheduledDate <= range.endDate
}

/**
 * Dashboard Site Visit activity loader.
 *
 * This intentionally mirrors the live Site Visits/Calendar source: public.site_visit_requests.
 * It fetches the authorized Project slice once and normalizes status in application code instead
 * of relying on a case-sensitive database status predicate. Completed visits use completed_at as
 * the primary activity instant, with the persisted completion audit and updated_at retained only
 * for legacy completed rows. Scheduled visits are ranged by their canonical scheduled_date.
 */
export async function loadDashboardSiteVisitActivity(
  projectIds: string[],
  range?: DashboardActivityDateFilter | null,
): Promise<DashboardSiteVisitActivity[]> {
  const scopedProjectIds = validUuidList(projectIds)
  if (!scopedProjectIds.length) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("site_visit_requests")
    .select("id, project_id, report_visit_number, status, completed_at, updated_at, scheduled_date, scheduled_time")
    .in("project_id", scopedProjectIds)

  if (error) throw error

  const candidateRows = (data ?? []).filter((row: any) => {
    const status = normalizedVisitStatus(row.status)
    return status === "completed" || status === "scheduled"
  })
  if (!candidateRows.length) return []

  const candidateIds = validUuidList(candidateRows.map((row: any) => row.id))
  const missingCompletedAtIds = validUuidList(
    candidateRows
      .filter((row: any) => normalizedVisitStatus(row.status) === "completed" && !validInstant(row.completed_at))
      .map((row: any) => row.id),
  )
  const assignmentRecoveryIds = candidateIds

  const auditRows: any[] = []
  if (candidateIds.length) {
    const { data: audits, error: auditError } = await admin
      .from("audit_logs")
      .select("entity_id, action, metadata, created_at")
      .eq("entity_type", "site_visit_request")
      .in("entity_id", assignmentRecoveryIds)
      .in("action", [
        "site_visit.completed",
        "site_visit.scheduled",
        "site_visit.request_approved_and_scheduled",
      ])
      .order("created_at", { ascending: false })

    // Audit data is recovery metadata only. A missing/older audit schema must never make
    // canonical Site Visit rows disappear from the Dashboard.
    if (!auditError) auditRows.push(...(audits ?? []))
  }

  const completionAuditByVisitId = new Map<string, string>()
  const schedulingAssignmentByVisitId = new Map<string, string[]>()
  for (const audit of auditRows) {
    const visitId = asUuid(audit.entity_id)
    if (!visitId) continue
    const action = typeof audit.action === "string" ? audit.action : ""

    if (
      action === "site_visit.completed" &&
      missingCompletedAtIds.includes(visitId) &&
      !completionAuditByVisitId.has(visitId)
    ) {
      const createdAt = validInstant(audit.created_at)
      if (createdAt) completionAuditByVisitId.set(visitId, createdAt)
      continue
    }

    if (SCHEDULING_AUDIT_ACTIONS.has(action) && !schedulingAssignmentByVisitId.has(visitId)) {
      schedulingAssignmentByVisitId.set(visitId, auditAssignedUserIds(audit.metadata))
    }
  }

  const rangeStart = range?.startUtc ? Date.parse(range.startUtc) : null
  const rangeEnd = range?.endExclusiveUtc ? Date.parse(range.endExclusiveUtc) : null

  return candidateRows.flatMap((row: any) => {
    const id = asUuid(row.id)
    const projectId = asUuid(row.project_id)
    const status = normalizedVisitStatus(row.status)
    if (!id || !projectId || (status !== "completed" && status !== "scheduled")) return []

    const scheduledDate = typeof row.scheduled_date === "string" ? row.scheduled_date : null
    const scheduledTime = typeof row.scheduled_time === "string" ? row.scheduled_time : null

    if (status === "scheduled") {
      if (!isScheduledDateInRange(scheduledDate, range)) return []
      return [{
        id,
        projectId,
        status: "scheduled" as const,
        activityAt: null,
        completedAt: null,
        completedAtSource: null,
        scheduledDate,
        scheduledTime,
        reportVisitNumber: Number.isInteger(row.report_visit_number) && row.report_visit_number > 0
          ? row.report_visit_number
          : null,
        assignmentFallbackUserIds: schedulingAssignmentByVisitId.get(id) ?? [],
      }]
    }

    const explicitCompletedAt = validInstant(row.completed_at)
    const completionAuditAt = explicitCompletedAt ? null : completionAuditByVisitId.get(id) ?? null
    const legacyUpdatedAt = explicitCompletedAt || completionAuditAt ? null : validInstant(row.updated_at)
    const completedAt = explicitCompletedAt ?? completionAuditAt ?? legacyUpdatedAt
    if (!completedAt) return []

    const completedAtMs = Date.parse(completedAt)
    if (rangeStart !== null && Number.isFinite(rangeStart) && completedAtMs < rangeStart) return []
    if (rangeEnd !== null && Number.isFinite(rangeEnd) && completedAtMs >= rangeEnd) return []

    return [{
      id,
      projectId,
      status: "completed" as const,
      activityAt: completedAt,
      completedAt,
      completedAtSource: explicitCompletedAt
        ? "completed_at" as const
        : completionAuditAt
          ? "completion_audit" as const
          : "legacy_updated_at" as const,
      scheduledDate,
      scheduledTime,
      reportVisitNumber: Number.isInteger(row.report_visit_number) && row.report_visit_number > 0
        ? row.report_visit_number
        : null,
      assignmentFallbackUserIds: schedulingAssignmentByVisitId.get(id) ?? [],
    }]
  })
}
