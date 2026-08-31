import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { calculateSupervisorPerformance } from "./compliance"
import type { RawProjectRecord, RawReportRecord, SupervisorPerformanceData } from "./types"

export async function loadSupervisorPerformanceData(
  organizationId: string,
  month: string, // YYYY-MM format e.g. "2026-08"
): Promise<SupervisorPerformanceData> {
  const admin = createAdminClient()
  const normalizedMonth = /^\d{4}-\d{2}$/.test(month)
    ? month
    : new Date().toISOString().slice(0, 7)

  const [yearStr, monthStr] = normalizedMonth.split("-")
  const year = parseInt(yearStr, 10)
  const monthNum = parseInt(monthStr, 10)
  const lastDay = new Date(year, monthNum, 0).getDate()

  const monthStart = `${normalizedMonth}-01`
  const monthEnd = `${normalizedMonth}-${String(lastDay).padStart(2, "0")}`
  const monthStartISO = `${monthStart}T00:00:00.000Z`
  const monthEndISO = `${monthEnd}T23:59:59.999Z`

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
      month: normalizedMonth,
      projects: [],
      reports: [],
      supervisorProfiles: new Map(),
    })
  }

  // Bounded Report Query: Query A for visit_date in month, Query B for null visit_date & created_at in month
  const [queryA, queryB] = await Promise.all([
    admin
      .from("term_responses")
      .select("id, project_id, status, submitted_at, visit_date, created_at, created_by")
      .in("project_id", activeProjectIds)
      .gte("visit_date", monthStart)
      .lte("visit_date", monthEnd),
    admin
      .from("term_responses")
      .select("id, project_id, status, submitted_at, visit_date, created_at, created_by")
      .in("project_id", activeProjectIds)
      .is("visit_date", null)
      .gte("created_at", monthStartISO)
      .lte("created_at", monthEndISO),
  ])

  if (queryA.error) throw queryA.error
  if (queryB.error) throw queryB.error

  // Deduplicate reports by ID
  const reportMap = new Map<string, RawReportRecord>()
  for (const r of [...(queryA.data ?? []), ...(queryB.data ?? [])]) {
    if (r.id) reportMap.set(r.id, r)
  }
  const reports = Array.from(reportMap.values())

  // Collect unique profile IDs for supervisors and report creators
  const profileIdsSet = new Set<string>()
  for (const p of projects) {
    if (p.assigned_supervisor_id) profileIdsSet.add(p.assigned_supervisor_id)
  }
  for (const r of reports) {
    if (r.created_by) profileIdsSet.add(r.created_by)
  }
  const profileIds = Array.from(profileIdsSet)

  // Query 3 (Batched Profiles Query): Fetch profiles
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
    month: normalizedMonth,
    projects,
    reports,
    supervisorProfiles,
  })
}
