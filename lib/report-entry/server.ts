import "server-only"

import { resolveExplicitSupervisorProjectScope } from "@/lib/calendar/server"
import { projectImageDisplayUrl } from "@/lib/projects/project-image"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export type ReportEntryStage = {
  id: string
  name: string
  sortOrder: number
}

export type ReportEntryLatestReport = {
  id: string
  stageId: string
  stageName: string
  visitNumber: number
  createdAt: string
}

export type ReportEntryProject = {
  id: string
  name: string
  code: string | null
  location: string | null
  status: string | null
  imageUrl: string | null
  latestReport: ReportEntryLatestReport | null
  stages: ReportEntryStage[]
}

export type ReportEntrySiteVisitContext = {
  id: string
  projectId: string
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

/**
 * Focused, read-only launcher data for Member Supervisors.
 *
 * Authorization is established first through the same canonical explicit Supervisor
 * relationship used by Member Homepage and Calendar. Only those project ids are then
 * used in the batched project/stage/report/image reads, so unauthorized projects never
 * reach the Report Entry client.
 */
export async function getReportEntryProjects(userId: string): Promise<ReportEntryProject[]> {
  if (!isUuid(userId)) return []

  const supervisorScope = await resolveExplicitSupervisorProjectScope(userId)
  const projectIds = Array.from(
    new Set(supervisorScope.map((project) => project.id).filter((id): id is string => isUuid(id))),
  )
  if (!projectIds.length) return []

  const admin = createAdminClient()
  const [projectResult, stageResult, reportResult, imageResult] = await Promise.all([
    admin
      .from("projects")
      .select("id, name, code, location, region, status, image, assigned_supervisor_id")
      .in("id", projectIds)
      .eq("assigned_supervisor_id", userId),
    admin
      .from("project_stages")
      .select("id, project_id, name, status, sort_order")
      .in("project_id", projectIds)
      .order("sort_order", { ascending: true }),
    admin
      .from("term_responses")
      .select("id, project_id, project_stage_id, visit_number, created_at")
      .in("project_id", projectIds)
      .is("project_stage_term_id", null)
      .order("visit_number", { ascending: false })
      .order("created_at", { ascending: false }),
    admin
      .from("project_images")
      .select("project_id, storage_path, order_index")
      .in("project_id", projectIds)
      .order("order_index", { ascending: true }),
  ])

  if (projectResult.error) throw projectResult.error
  if (stageResult.error) throw stageResult.error
  if (reportResult.error) throw reportResult.error
  if (imageResult.error) throw imageResult.error

  const projectIdSet = new Set(projectIds)
  const allStageNameById = new Map<string, string>()
  const stagesByProject = new Map<string, ReportEntryStage[]>()

  for (const row of stageResult.data ?? []) {
    const projectId = (row as any).project_id
    const stageId = (row as any).id
    const name = typeof (row as any).name === "string" ? (row as any).name.trim() : ""
    if (!isUuid(projectId) || !projectIdSet.has(projectId) || !isUuid(stageId) || !name) continue

    allStageNameById.set(stageId, name)
    if ((row as any).status === "disabled") continue

    const items = stagesByProject.get(projectId) ?? []
    items.push({
      id: stageId,
      name,
      sortOrder: Number.isFinite(Number((row as any).sort_order)) ? Number((row as any).sort_order) : items.length,
    })
    stagesByProject.set(projectId, items)
  }

  for (const stages of stagesByProject.values()) {
    stages.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
  }

  const latestReportByProject = new Map<string, ReportEntryLatestReport>()
  for (const row of reportResult.data ?? []) {
    const projectId = (row as any).project_id
    const stageId = (row as any).project_stage_id
    const reportId = (row as any).id
    const visitNumber = Number((row as any).visit_number)
    const createdAt = typeof (row as any).created_at === "string" ? (row as any).created_at : ""
    if (
      !isUuid(projectId) ||
      !projectIdSet.has(projectId) ||
      latestReportByProject.has(projectId) ||
      !isUuid(stageId) ||
      !isUuid(reportId) ||
      !Number.isInteger(visitNumber) ||
      visitNumber <= 0 ||
      !createdAt
    ) continue

    latestReportByProject.set(projectId, {
      id: reportId,
      stageId,
      stageName: allStageNameById.get(stageId) ?? "Stage",
      visitNumber,
      createdAt,
    })
  }

  const coverPathByProject = new Map<string, string>()
  for (const row of imageResult.data ?? []) {
    const projectId = (row as any).project_id
    const storagePath = typeof (row as any).storage_path === "string" ? (row as any).storage_path.trim() : ""
    if (!isUuid(projectId) || !projectIdSet.has(projectId) || !storagePath || coverPathByProject.has(projectId)) continue
    coverPathByProject.set(projectId, storagePath)
  }

  return (projectResult.data ?? [])
    .flatMap((row: any): ReportEntryProject[] => {
      if (!isUuid(row.id) || !projectIdSet.has(row.id) || row.assigned_supervisor_id !== userId) return []
      const coverValue = coverPathByProject.get(row.id) ?? (typeof row.image === "string" ? row.image : null)
      const region = typeof row.region === "string" && row.region.trim() ? row.region.trim() : null
      const location = typeof row.location === "string" && row.location.trim() ? row.location.trim() : null
      return [{
        id: row.id,
        name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Project",
        code: typeof row.code === "string" && row.code.trim() ? row.code.trim() : null,
        location: region ?? location,
        status: typeof row.status === "string" && row.status.trim() ? row.status.trim() : null,
        imageUrl: projectImageDisplayUrl(coverValue, row.id),
        latestReport: latestReportByProject.get(row.id) ?? null,
        stages: stagesByProject.get(row.id) ?? [],
      }]
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Validates optional Site Visit context against the already-authorized Supervisor
 * project ids returned to Report Entry. This is server-only and never trusts the
 * query parameter by itself. Only active scheduled visits can start a linked report.
 */
export async function getReportEntrySiteVisitContext(
  siteVisitId: string,
  supervisedProjectIds: string[],
): Promise<ReportEntrySiteVisitContext | null> {
  if (!isUuid(siteVisitId)) return null

  const projectIds = Array.from(new Set(supervisedProjectIds.filter((id): id is string => isUuid(id))))
  if (!projectIds.length) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("site_visit_requests")
    .select("id, project_id, status")
    .eq("id", siteVisitId)
    .in("project_id", projectIds)
    .maybeSingle()

  if (error) throw error
  if (!data || data.status !== "scheduled" || !isUuid(data.id) || !isUuid(data.project_id)) return null

  return { id: data.id, projectId: data.project_id }
}
