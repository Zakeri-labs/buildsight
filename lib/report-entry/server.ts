import "server-only"

import { resolveCalendarProjectScope, resolveExplicitSupervisorProjectScope } from "@/lib/calendar/server"
import { projectImageDisplayUrl } from "@/lib/projects/project-image"
import { createAdminClient } from "@/lib/supabase/admin"

import { calculateStageStats } from "@/lib/stages/execution"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export type ReportEntryLatestReport = {
  id: string
  stageId: string
  stageName: string
  reportNumber: string | null
  reportTitle: string
  subject: string | null
  visitNumber: number
  createdAt: string
}

export type ReportEntryStage = {
  id: string
  name: string
  sortOrder: number
  latestReport: ReportEntryLatestReport | null
  reportsCount: number
  checkedChecklistItems: number
  totalChecklistItems: number
  progressPercentage: number
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

  try {
    let supervisorScope = await resolveExplicitSupervisorProjectScope(userId)
    if (!supervisorScope.length) {
      supervisorScope = await resolveCalendarProjectScope(userId)
    }
    const projectIds = Array.from(
      new Set(supervisorScope.map((project) => project.id).filter((id): id is string => isUuid(id))),
    )
    if (!projectIds.length) return []

    const admin = createAdminClient()
    let stageResult: { data: any[] | null; error: any } = await admin
      .from("project_stages")
      .select("id, project_id, name, status, sort_order, is_pre_completed")
      .in("project_id", projectIds)
      .order("sort_order", { ascending: true })

    if (stageResult.error) {
      stageResult = await admin
        .from("project_stages")
        .select("id, project_id, name, status, sort_order")
        .in("project_id", projectIds)
        .order("sort_order", { ascending: true })
    }

    let reportResult: { data: any[] | null; error: any } = await admin
      .from("term_responses")
      .select("id, project_id, project_stage_id, report_number, report_title, subject, visit_number, created_at, response_content")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })

    if (reportResult.error) {
      reportResult = await admin
        .from("term_responses")
        .select("id, project_id, project_stage_id, report_title, visit_number, created_at, response_content")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
    }

    const [projectResult, imageResult, libraryStagesResult] = await Promise.all([
      admin
        .from("projects")
        .select("id, name, code, location, region, status, image, assigned_supervisor_id, supervising_organization_id")
        .in("id", projectIds),
      admin
        .from("project_images")
        .select("project_id, storage_path, order_index")
        .in("project_id", projectIds)
        .order("order_index", { ascending: true }),
      admin
        .from("stages")
        .select("id, organization_id, name, description, sort_order, is_active")
        .order("sort_order", { ascending: true }),
    ])

    if (projectResult.error) throw projectResult.error

    const libraryStagesByOrg = new Map<string, any[]>()
    for (const stage of libraryStagesResult.data ?? []) {
      if ((stage as any).is_active === false || !(stage as any).organization_id) continue
      const items = libraryStagesByOrg.get((stage as any).organization_id) ?? []
      items.push(stage)
      libraryStagesByOrg.set((stage as any).organization_id, items)
    }

    const projectIdSet = new Set(projectIds)
    const allStageNameById = new Map<string, string>()
    const stagesByProject = new Map<string, ReportEntryStage[]>()

    const stageRowById = new Map<string, any>()
    for (const row of stageResult.data ?? []) {
      const projectId = (row as any).project_id
      const stageId = (row as any).id
      const name = typeof (row as any).name === "string" ? (row as any).name.trim() : ""
      if (!isUuid(projectId) || !projectIdSet.has(projectId) || !isUuid(stageId) || !name) continue

      allStageNameById.set(stageId, name)
      stageRowById.set(stageId, row)
      if ((row as any).status === "disabled") continue

      const items = stagesByProject.get(projectId) ?? []
      items.push({
        id: stageId,
        name,
        sortOrder: Number.isFinite(Number((row as any).sort_order)) ? Number((row as any).sort_order) : items.length,
        latestReport: null,
        reportsCount: 0,
        checkedChecklistItems: 0,
        totalChecklistItems: 0,
        progressPercentage: 0,
      })
      stagesByProject.set(projectId, items)
    }

    // Merge missing active template stages from organization library for each project
    for (const projectRow of projectResult.data ?? []) {
      const projectId = projectRow.id
      const orgId = projectRow.supervising_organization_id
      if (!isUuid(projectId) || !orgId) continue

      const items = stagesByProject.get(projectId) ?? []
      const existingNames = new Set(items.map((s) => s.name.trim().toLowerCase()))
      const orgTemplateStages = libraryStagesByOrg.get(orgId) ?? []

      for (const tStage of orgTemplateStages) {
        const tName = typeof tStage.name === "string" ? tStage.name.trim() : ""
        if (!tName || existingNames.has(tName.toLowerCase())) continue

        items.push({
          id: tStage.id,
          name: tName,
          sortOrder: Number.isFinite(Number(tStage.sort_order)) ? Number(tStage.sort_order) : items.length,
          latestReport: null,
          reportsCount: 0,
          checkedChecklistItems: 0,
          totalChecklistItems: 0,
          progressPercentage: 0,
        })
        allStageNameById.set(tStage.id, tName)
      }
      stagesByProject.set(projectId, items)
    }

    for (const stages of stagesByProject.values()) {
      stages.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
    }

    const latestReportByProject = new Map<string, ReportEntryLatestReport>()
    const latestReportByStage = new Map<string, ReportEntryLatestReport>()
    const reportsByStage = new Map<string, Array<{ id: string; content?: any }>>()

    for (const row of reportResult.data ?? []) {
      const projectId = (row as any).project_id
      const stageId = (row as any).project_stage_id
      const reportId = (row as any).id
      const visitNumber = Number((row as any).visit_number)
      const createdAt = typeof (row as any).created_at === "string" ? (row as any).created_at : ""
      const reportTitle = typeof (row as any).report_title === "string" ? (row as any).report_title.trim() : ""
      const reportNumber = typeof (row as any).report_number === "string" && (row as any).report_number.trim()
        ? (row as any).report_number.trim()
        : null
      const subject = typeof (row as any).subject === "string" && (row as any).subject.trim()
        ? (row as any).subject.trim()
        : null
      if (
        !isUuid(projectId) ||
        !projectIdSet.has(projectId) ||
        !isUuid(stageId) ||
        !isUuid(reportId) ||
        !Number.isInteger(visitNumber) ||
        visitNumber <= 0 ||
        !createdAt ||
        !reportTitle
      ) continue

      const report: ReportEntryLatestReport = {
        id: reportId,
        stageId,
        stageName: allStageNameById.get(stageId) ?? "Stage",
        reportNumber,
        reportTitle,
        subject,
        visitNumber,
        createdAt,
      }

      if (!latestReportByProject.has(projectId)) latestReportByProject.set(projectId, report)
      if (!latestReportByStage.has(stageId)) latestReportByStage.set(stageId, report)

      const stageReports = reportsByStage.get(stageId) ?? []
      stageReports.push({ id: reportId, content: (row as any).response_content })
      reportsByStage.set(stageId, stageReports)
    }

    for (const stages of stagesByProject.values()) {
      for (const stage of stages) {
        stage.latestReport = latestReportByStage.get(stage.id) ?? null
        const stageReports = reportsByStage.get(stage.id) ?? []
        const stageRow = stageRowById.get(stage.id)
        const stats = calculateStageStats({
          name: stage.name,
          reports: stageReports,
          isPreCompleted: Boolean(stageRow?.is_pre_completed),
          status: stageRow?.status,
        })
        stage.reportsCount = stats.reportsCount
        stage.checkedChecklistItems = stats.checkedChecklistItems
        stage.totalChecklistItems = stats.totalChecklistItems
        stage.progressPercentage = stats.progressPercentage
      }
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
        if (!isUuid(row.id) || !projectIdSet.has(row.id)) return []
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
  } catch (err) {
    console.error("[report-entry] getReportEntryProjects error:", err)
    return []
  }
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
