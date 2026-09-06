import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { currentCalendarDateKey } from "@/lib/calendar/date"
import { calculateSupervisorPerformance } from "./compliance"
import {
  calculateSupervisorVisitCompliance,
  generateCalendarWeeks,
  generateWeeklyWindow,
  getDaysInMonth,
} from "./compliance-engine"
import type {
  RawParticipantRecord,
  RawProjectRecord,
  RawReportRecord,
  SupervisorPerformanceData,
  SupervisorVisitComplianceDashboardData,
} from "./types"

export type LoadSupervisorPerformancePeriodOptions = {
  month?: string
  startDate?: string
  endDate?: string
}

export async function loadSupervisorPerformanceData(
  organizationId: string,
  periodOrMonth?: string | LoadSupervisorPerformancePeriodOptions,
): Promise<SupervisorPerformanceData> {
  const admin = createAdminClient()

  let queryStart: string
  let queryEnd: string
  let periodInput: { month?: string; startDate?: string; endDate?: string }

  if (typeof periodOrMonth === "object" && periodOrMonth?.startDate && periodOrMonth?.endDate) {
    const s =
      periodOrMonth.startDate <= periodOrMonth.endDate
        ? periodOrMonth.startDate
        : periodOrMonth.endDate
    const e =
      periodOrMonth.startDate <= periodOrMonth.endDate
        ? periodOrMonth.endDate
        : periodOrMonth.startDate
    queryStart = s
    queryEnd = e
    periodInput = { startDate: s, endDate: e }
  } else {
    const rawMonth =
      typeof periodOrMonth === "string" ? periodOrMonth : periodOrMonth?.month ?? ""
    const normalizedMonth = /^\d{4}-\d{2}$/.test(rawMonth)
      ? rawMonth
      : new Date().toISOString().slice(0, 7)

    const [yearStr, monthStr] = normalizedMonth.split("-")
    const year = parseInt(yearStr, 10)
    const monthNum = parseInt(monthStr, 10)
    const lastDay = new Date(year, monthNum, 0).getDate()

    queryStart = `${normalizedMonth}-01`
    queryEnd = `${normalizedMonth}-${String(lastDay).padStart(2, "0")}`
    periodInput = { month: normalizedMonth, startDate: queryStart, endDate: queryEnd }
  }

  const queryStartISO = `${queryStart}T00:00:00.000Z`
  const queryEndISO = `${queryEnd}T23:59:59.999Z`

  // Query 1: Fetch active projects for supervising organization
  const { data: projectsData, error: projectsErr } = await admin
    .from("projects")
    .select(
      "id, name, code, status, supervision_type, assigned_supervisor_id, supervising_organization_id, start_date, supervision_start_date",
    )
    .eq("supervising_organization_id", organizationId)

  if (projectsErr) throw projectsErr

  const projects: RawProjectRecord[] = projectsData ?? []
  const activeProjectIds = projects.filter((p) => p.id).map((p) => p.id)

  if (!activeProjectIds.length) {
    return calculateSupervisorPerformance({
      ...periodInput,
      projects: [],
      participants: [],
      reports: [],
      supervisorProfiles: new Map(),
    })
  }

  // Bounded Query 2 & Reports Queries 3 & 4 via Promise.all
  const [participantsRes, queryA, queryB] = await Promise.all([
    admin
      .from("project_participants")
      .select(
        "id, project_id, key_contact_user_id, status, participant_type, project_role, participant_role_label",
      )
      .in("project_id", activeProjectIds)
      .eq("status", "active")
      .not("key_contact_user_id", "is", null),
    admin
      .from("term_responses")
      .select("id, project_id, status, submitted_at, visit_date, created_at, created_by")
      .in("project_id", activeProjectIds)
      .gte("visit_date", queryStart)
      .lte("visit_date", queryEnd),
    admin
      .from("term_responses")
      .select("id, project_id, status, submitted_at, visit_date, created_at, created_by")
      .in("project_id", activeProjectIds)
      .is("visit_date", null)
      .gte("created_at", queryStartISO)
      .lte("created_at", queryEndISO),
  ])

  if (participantsRes.error) throw participantsRes.error
  if (queryA.error) throw queryA.error
  if (queryB.error) throw queryB.error

  const participants: RawParticipantRecord[] = participantsRes.data ?? []

  // Deduplicate reports by ID
  const reportMap = new Map<string, RawReportRecord>()
  for (const r of [...(queryA.data ?? []), ...(queryB.data ?? [])]) {
    if (r.id) reportMap.set(r.id, r)
  }
  const reports = Array.from(reportMap.values())

  // Collect unique profile IDs for primary supervisors, additional participants, and report creators
  const profileIdsSet = new Set<string>()
  for (const p of projects) {
    if (p.assigned_supervisor_id) profileIdsSet.add(p.assigned_supervisor_id)
  }
  for (const part of participants) {
    if (part.key_contact_user_id) profileIdsSet.add(part.key_contact_user_id)
  }
  for (const r of reports) {
    if (r.created_by) profileIdsSet.add(r.created_by)
  }
  const profileIds = Array.from(profileIdsSet)

  // Query 5 (Batched Profiles Query): Fetch profiles
  const { data: profilesData, error: profilesErr } = profileIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", profileIds)
    : { data: [], error: null }

  if (profilesErr) throw profilesErr

  const supervisorProfiles = new Map<
    string,
    { id: string; name: string; email: string | null; avatarUrl: string | null }
  >()
  for (const prof of profilesData ?? []) {
    supervisorProfiles.set(prof.id, {
      id: prof.id,
      name: prof.full_name?.trim() || prof.email || "Supervisor",
      email: prof.email ?? null,
      avatarUrl: prof.avatar_url ?? null,
    })
  }

  // Calculate analytics in memory
  return calculateSupervisorPerformance({
    ...periodInput,
    projects,
    participants,
    reports,
    supervisorProfiles,
  })
}

export type LoadSupervisorVisitComplianceOptions = {
  organizationId: string
  rangeStart?: string
  rangeEnd?: string
  referenceDate?: string
  pastWeeks?: number
  futureWeeks?: number
}

/**
 * Loads multi-week supervisor visit compliance data for the management dashboard without N+1 queries.
 */
export async function loadSupervisorVisitComplianceData(
  options: LoadSupervisorVisitComplianceOptions,
): Promise<SupervisorVisitComplianceDashboardData> {
  const { organizationId, rangeStart, rangeEnd, referenceDate, pastWeeks, futureWeeks } = options
  const admin = createAdminClient()

  // 1. Generate Sunday -> Saturday calendar weeks for the requested window
  const weeks =
    rangeStart && rangeEnd
      ? generateCalendarWeeks({ rangeStart, rangeEnd, referenceDate })
      : generateWeeklyWindow({ referenceDate, pastWeeks, futureWeeks })

  const effectiveRefDate = referenceDate ?? currentCalendarDateKey()

  if (weeks.length === 0) {
    return {
      rangeStart: effectiveRefDate,
      rangeEnd: effectiveRefDate,
      referenceDate: effectiveRefDate,
      weeks: [],
      projects: [],
      supervisors: [],
    }
  }

  const timelineStart = weeks[0].startDate
  const timelineEnd = weeks[weeks.length - 1].endDate

  // Expand query window to full calendar month boundaries of the earliest and latest weeks
  const startMonthKey = timelineStart.slice(0, 7)
  const endMonthKey = timelineEnd.slice(0, 7)
  const [endYStr, endMStr] = endMonthKey.split("-")
  const endLastDay = getDaysInMonth(parseInt(endYStr, 10), parseInt(endMStr, 10))

  const queryStart = `${startMonthKey}-01`
  const queryEnd = `${endMonthKey}-${String(endLastDay).padStart(2, "0")}`
  const queryStartISO = `${queryStart}T00:00:00.000Z`
  const queryEndISO = `${queryEnd}T23:59:59.999Z`

  // 2. Query Projects for the organization
  const { data: projectsData, error: projectsErr } = await admin
    .from("projects")
    .select(
      "id, name, code, status, supervision_type, assigned_supervisor_id, supervising_organization_id, start_date, supervision_start_date",
    )
    .eq("supervising_organization_id", organizationId)

  if (projectsErr) throw projectsErr

  const projects: RawProjectRecord[] = projectsData ?? []
  const projectIds = projects.filter((p) => p.id).map((p) => p.id)

  if (!projectIds.length) {
    return calculateSupervisorVisitCompliance({
      projects: [],
      participants: [],
      reports: [],
      supervisorProfiles: new Map(),
      weeks,
      today: effectiveRefDate,
    })
  }

  // 3. Parallel bounded fetch: Participants + Reports (with visit_date & legacy created_at fallback)
  const [participantsRes, queryA, queryB] = await Promise.all([
    admin
      .from("project_participants")
      .select(
        "id, project_id, key_contact_user_id, status, participant_type, project_role, participant_role_label",
      )
      .in("project_id", projectIds)
      .eq("status", "active")
      .not("key_contact_user_id", "is", null),
    admin
      .from("term_responses")
      .select(
        "id, project_id, project_stage_id, status, submitted_at, visit_date, created_at, created_by, report_number, report_title, visit_number",
      )
      .in("project_id", projectIds)
      .gte("visit_date", queryStart)
      .lte("visit_date", queryEnd),
    admin
      .from("term_responses")
      .select(
        "id, project_id, project_stage_id, status, submitted_at, visit_date, created_at, created_by, report_number, report_title, visit_number",
      )
      .in("project_id", projectIds)
      .is("visit_date", null)
      .gte("created_at", queryStartISO)
      .lte("created_at", queryEndISO),
  ])

  if (participantsRes.error) throw participantsRes.error
  if (queryA.error) throw queryA.error
  if (queryB.error) throw queryB.error

  const participants: RawParticipantRecord[] = participantsRes.data ?? []

  // Deduplicate reports by ID
  const reportMap = new Map<string, RawReportRecord>()
  for (const r of [...(queryA.data ?? []), ...(queryB.data ?? [])]) {
    if (r.id) reportMap.set(r.id, r)
  }
  const reports = Array.from(reportMap.values())

  // 4. Batched profiles query
  const profileIdsSet = new Set<string>()
  for (const p of projects) {
    if (p.assigned_supervisor_id) profileIdsSet.add(p.assigned_supervisor_id)
  }
  for (const part of participants) {
    if (part.key_contact_user_id) profileIdsSet.add(part.key_contact_user_id)
  }
  for (const r of reports) {
    if (r.created_by) profileIdsSet.add(r.created_by)
  }
  const profileIds = Array.from(profileIdsSet)

  const { data: profilesData, error: profilesErr } = profileIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", profileIds)
    : { data: [], error: null }

  if (profilesErr) throw profilesErr

  const supervisorProfiles = new Map<
    string,
    { id: string; name: string; email: string | null; avatarUrl: string | null }
  >()
  for (const prof of profilesData ?? []) {
    supervisorProfiles.set(prof.id, {
      id: prof.id,
      name: prof.full_name?.trim() || prof.email || "Supervisor",
      email: prof.email ?? null,
      avatarUrl: prof.avatar_url ?? null,
    })
  }

  // 5. Aggregate in memory
  return calculateSupervisorVisitCompliance({
    projects,
    participants,
    reports,
    supervisorProfiles,
    weeks,
    today: effectiveRefDate,
  })
}
