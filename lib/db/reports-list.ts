import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgProjects } from "@/lib/db/domain"
import type { DashboardDateRange } from "@/lib/dashboard/date-range"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

export type ListReportItem = {
  id: string
  projectId: string
  projectName: string
  projectCode: string | null
  stageId: string
  stageName: string
  reportNumber: string | null
  reportTitle: string
  subject: string | null
  visitNumber: number | null
  visitDate: string | null
  status: string
  authorId: string | null
  authorName: string
  authorInitials: string
  createdAt: string
  submittedAt: string | null
  href: string
}

export type ExportReportItem = {
  id: string
  projectId: string
  projectName: string
  projectCode: string | null
  clientName: string | null
  stageId: string
  stageName: string
  reportNumber: string | null
  reportTitle: string
  subject: string | null
  visitNumber: number | null
  visitDate: string | null
  createdAt: string
  submittedAt: string | null
  status: string
  authorId: string | null
  authorName: string
  hasBilingualPdf: boolean
}

export type PaginatedReportsResult = {
  items: ListReportItem[]
  totalReports: number
  currentPage: number
  totalPages: number
}

export async function getPaginatedReportsList({
  userId,
  organizationId,
  page,
  pageSize,
  dateRange = null,
  creditUsage = false,
}: {
  userId: string
  organizationId?: string
  page?: number
  pageSize?: number | null
  dateRange?: DashboardDateRange | null
  creditUsage?: boolean
}): Promise<PaginatedReportsResult> {
  const safePage = Math.max(1, Math.floor(page || 1) || 1)
  const offset = pageSize && pageSize > 0 ? (safePage - 1) * pageSize : 0

  try {
    const admin = createAdminClient()

    // 1. Get project scope for user/org
    let projectIds: string[] = []
    if (organizationId && isUuid(organizationId)) {
      const orgProjects = await getOrgProjects(organizationId, userId)
      projectIds = orgProjects.map((p) => p.id).filter(isUuid)
    }

    if (!projectIds.length) {
      const { data: userProjects } = await admin
        .from("projects")
        .select("id")
        .limit(500)
      projectIds = (userProjects ?? []).map((p: any) => p.id).filter(isUuid)
    }

    if (!projectIds.length) {
      return {
        items: [],
        totalReports: 0,
        currentPage: 1,
        totalPages: 1,
      }
    }

    const validStatuses = ["submitted", "under_review", "approved", "rejected", "completed"]

    // Construct server-side date range condition matching visible Report date (submitted_at, fallback created_at)
    let dateOrClause: string | null = null
    if (dateRange && dateRange.startUtc && dateRange.endExclusiveUtc) {
      const { startUtc, endExclusiveUtc } = dateRange
      dateOrClause = `and(submitted_at.gte.${startUtc},submitted_at.lt.${endExclusiveUtc}),and(submitted_at.is.null,created_at.gte.${startUtc},created_at.lt.${endExclusiveUtc})`
    }

    // 2. Count total reports matching project, status AND date range
    let countQuery = admin
      .from("term_responses")
      .select(
        creditUsage ? "id, report_credit_usage!inner(organization_id)" : "id",
        { count: "exact", head: true },
      )
      .in("project_id", projectIds)
      .is("project_stage_term_id", null)
      .in("status", validStatuses)

    if (creditUsage && organizationId && isUuid(organizationId)) {
      countQuery = countQuery.eq("report_credit_usage.organization_id", organizationId)
    }

    if (!creditUsage) {
      countQuery = countQuery.is("deleted_at", null)
    }

    if (dateOrClause) {
      countQuery = countQuery.or(dateOrClause)
    }

    const { count: totalCount } = await countQuery

    const totalReports = totalCount ?? 0
    const totalPages = pageSize && pageSize > 0 ? Math.max(1, Math.ceil(totalReports / pageSize)) : 1

    // 3. Fetch reports list with server-side date range filter
    let dataQuery = admin
      .from("term_responses")
      .select(
        creditUsage
          ? "id, project_id, project_stage_id, report_number, report_title, subject, visit_number, visit_date, status, created_by, created_at, submitted_at, completed_at, report_credit_usage!inner(organization_id)"
          : "id, project_id, project_stage_id, report_number, report_title, subject, visit_number, visit_date, status, created_by, created_at, submitted_at, completed_at",
      )
      .in("project_id", projectIds)
      .is("project_stage_term_id", null)
      .in("status", validStatuses)

    if (creditUsage && organizationId && isUuid(organizationId)) {
      dataQuery = dataQuery.eq("report_credit_usage.organization_id", organizationId)
    }

    if (!creditUsage) {
      dataQuery = dataQuery.is("deleted_at", null)
    }

    if (dateOrClause) {
      dataQuery = dataQuery.or(dateOrClause)
    }

    let query = dataQuery
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })

    if (pageSize && pageSize > 0) {
      query = query.range(offset, offset + pageSize - 1)
    }

    const { data: responses, error: responseErr } = await query

    if (responseErr || !responses || !responses.length) {
      return {
        items: [],
        totalReports,
        currentPage: safePage,
        totalPages,
      }
    }

    // If no pageSize was specified and PostgREST max_rows truncated the result, fetch remaining pages in chunks
    let allResponses = responses
    if ((!pageSize || pageSize <= 0) && totalReports > responses.length) {
      let currentOffset = responses.length
      while (currentOffset < totalReports) {
        const batchSize = 1000
        const { data: nextBatch, error: nextBatchErr } = await dataQuery
          .order("submitted_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(currentOffset, currentOffset + batchSize - 1)

        if (nextBatchErr || !nextBatch || !nextBatch.length) break
        allResponses = allResponses.concat(nextBatch)
        currentOffset += nextBatch.length
      }
    }

    // 5. Hydrate related names (Projects, Project Stages, Profiles)
    const respProjectIds = Array.from(new Set(allResponses.map((r: any) => r.project_id).filter(isUuid)))
    const respStageIds = Array.from(new Set(allResponses.map((r: any) => r.project_stage_id).filter(isUuid)))
    const respUserIds = Array.from(new Set(allResponses.map((r: any) => r.created_by).filter(isUuid)))

    async function fetchInChunks<T>(
      ids: string[],
      chunkSize: number,
      fetchFn: (chunk: string[]) => PromiseLike<{ data: T[] | null; error?: any }>
    ): Promise<T[]> {
      if (!ids.length) return []
      const results: T[] = []
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const { data } = await fetchFn(chunk)
        if (data) results.push(...(data as T[]))
      }
      return results
    }

    const [projectRows, stageRows, profileRows] = await Promise.all([
      fetchInChunks(respProjectIds, 100, (chunk) =>
        admin.from("projects").select("id, name, code").in("id", chunk),
      ),
      fetchInChunks(respStageIds, 100, (chunk) =>
        admin.from("project_stages").select("id, name").in("id", chunk),
      ),
      fetchInChunks(respUserIds, 100, (chunk) =>
        admin.from("profiles").select("id, full_name, email").in("id", chunk),
      ),
    ])

    const projectById = new Map<string, { name: string; code: string | null }>(
      (projectRows ?? []).map((p: any) => [
        p.id,
        { name: p.name?.trim() || "Project", code: p.code?.trim() || null },
      ]),
    )

    const stageById = new Map<string, string>(
      (stageRows ?? []).map((s: any) => [s.id, s.name?.trim() || "Stage"]),
    )

    const profileById = new Map<string, { name: string; initials: string }>(
      (profileRows ?? []).map((p: any) => {
        const name = p.full_name?.trim() || p.email?.trim() || "Supervisor"
        const parts = name.split(/\s+/).filter(Boolean)
        const initials = (parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2)).toUpperCase()
        return [p.id, { name, initials }]
      }),
    )

    // 6. Map into ListReportItem rows
    const items: ListReportItem[] = allResponses.map((r: any): ListReportItem => {
      const proj = projectById.get(r.project_id) ?? { name: "Project", code: null }
      const stageName = stageById.get(r.project_stage_id) ?? "Stage"
      const author = profileById.get(r.created_by) ?? { name: "Supervisor", initials: "SV" }

      const reportTitle =
        r.report_title?.trim() ||
        r.subject?.trim() ||
        (r.report_number ? `Report #${r.report_number}` : "Inspection Report")

      const visitNo =
        Number.isInteger(Number(r.visit_number)) && Number(r.visit_number) > 0
          ? Number(r.visit_number)
          : null

      return {
        id: r.id,
        projectId: r.project_id,
        projectName: proj.name,
        projectCode: proj.code,
        stageId: r.project_stage_id,
        stageName,
        reportNumber: r.report_number?.trim() || null,
        reportTitle,
        subject: r.subject?.trim() || null,
        visitNumber: visitNo,
        visitDate: r.visit_date || null,
        status: r.status?.trim() || "completed",
        authorId: r.created_by ?? null,
        authorName: author.name,
        authorInitials: author.initials,
        createdAt: r.created_at || new Date().toISOString(),
        submittedAt: r.submitted_at || r.created_at || null,
        href: `/projects/${r.project_id}/stages/${r.project_stage_id}/reports/${r.id}`,
      }
    })

    return {
      items,
      totalReports,
      currentPage: safePage,
      totalPages,
    }
  } catch (err) {
    console.error("[getPaginatedReportsList] Error:", err)
    return {
      items: [],
      totalReports: 0,
      currentPage: 1,
      totalPages: 1,
    }
  }
}

export async function getAllReportsForExcelExport({
  userId,
  organizationId,
  dateRange = null,
  supervisorId = null,
}: {
  userId: string
  organizationId?: string
  dateRange?: DashboardDateRange | null
  supervisorId?: string | null
}): Promise<ExportReportItem[]> {
  try {
    const admin = createAdminClient()

    // 1. Get project scope for user/org
    let projectIds: string[] = []
    if (organizationId && isUuid(organizationId)) {
      const orgProjects = await getOrgProjects(organizationId, userId)
      projectIds = orgProjects.map((p) => p.id).filter(isUuid)
    }

    if (!projectIds.length) {
      const { data: userProjects } = await admin
        .from("projects")
        .select("id")
        .limit(500)
      projectIds = (userProjects ?? []).map((p: any) => p.id).filter(isUuid)
    }

    if (!projectIds.length) {
      return []
    }

    const validStatuses = ["submitted", "under_review", "approved", "rejected", "completed"]

    // Construct server-side date range condition matching visible Report date (submitted_at, fallback created_at)
    let dateOrClause: string | null = null
    if (dateRange && dateRange.startUtc && dateRange.endExclusiveUtc) {
      const { startUtc, endExclusiveUtc } = dateRange
      dateOrClause = `and(submitted_at.gte.${startUtc},submitted_at.lt.${endExclusiveUtc}),and(submitted_at.is.null,created_at.gte.${startUtc},created_at.lt.${endExclusiveUtc})`
    }

    // 2. Fetch all matching reports without pagination limit
    let dataQuery = admin
      .from("term_responses")
      .select("id, project_id, project_stage_id, report_number, report_title, subject, visit_number, visit_date, status, created_by, created_at, submitted_at, completed_at")
      .in("project_id", projectIds)
      .is("project_stage_term_id", null)
      .in("status", validStatuses)
      .is("deleted_at", null)

    if (dateOrClause) {
      dataQuery = dataQuery.or(dateOrClause)
    }

    if (supervisorId && isUuid(supervisorId)) {
      dataQuery = dataQuery.eq("created_by", supervisorId)
    }

    const { data: responses, error: responseErr } = await dataQuery
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(5000)

    if (responseErr || !responses || !responses.length) {
      return []
    }

    // 3. Hydrate related names (Projects with client, Project Stages, Profiles, Translation Documents)
    const respIds = responses.map((r: any) => r.id).filter(isUuid)
    const respProjectIds = Array.from(new Set(responses.map((r: any) => r.project_id).filter(isUuid)))
    const respStageIds = Array.from(new Set(responses.map((r: any) => r.project_stage_id).filter(isUuid)))
    const respUserIds = Array.from(new Set(responses.map((r: any) => r.created_by).filter(isUuid)))

    const [{ data: projectRows }, { data: stageRows }, { data: profileRows }, { data: translationRows }] = await Promise.all([
      respProjectIds.length
        ? admin.from("projects").select("id, name, code, client").in("id", respProjectIds)
        : Promise.resolve({ data: [] as any[] }),
      respStageIds.length
        ? admin.from("project_stages").select("id, name").in("id", respStageIds)
        : Promise.resolve({ data: [] as any[] }),
      respUserIds.length
        ? admin.from("profiles").select("id, full_name, email").in("id", respUserIds)
        : Promise.resolve({ data: [] as any[] }),
      respIds.length
        ? admin.from("translation_documents").select("response_id, bilingual_pdf_url").in("response_id", respIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const projectById = new Map<string, { name: string; code: string | null; client: string | null }>(
      (projectRows ?? []).map((p: any) => [
        p.id,
        { name: p.name?.trim() || "Project", code: p.code?.trim() || null, client: p.client?.trim() || null },
      ]),
    )

    const stageById = new Map<string, string>(
      (stageRows ?? []).map((s: any) => [s.id, s.name?.trim() || "Stage"]),
    )

    const profileById = new Map<string, { name: string; email: string | null }>(
      (profileRows ?? []).map((p: any) => {
        const name = p.full_name?.trim() || p.email?.trim() || "Supervisor"
        return [p.id, { name, email: p.email?.trim() || null }]
      }),
    )

    const translationByResponseId = new Map<string, any>(
      (translationRows ?? []).map((t: any) => [t.response_id, t]),
    )

    // 4. Map into ExportReportItem rows
    return responses.map((r: any): ExportReportItem => {
      const proj = projectById.get(r.project_id) ?? { name: "Project", code: null, client: null }
      const stageName = stageById.get(r.project_stage_id) ?? "Stage"
      const author = profileById.get(r.created_by) ?? { name: "Supervisor", email: null }
      const trans = translationByResponseId.get(r.id)

      const reportTitle =
        r.report_title?.trim() ||
        r.subject?.trim() ||
        (r.report_number ? `Report #${r.report_number}` : "Inspection Report")

      const visitNo =
        Number.isInteger(Number(r.visit_number)) && Number(r.visit_number) > 0
          ? Number(r.visit_number)
          : null

      return {
        id: r.id,
        projectId: r.project_id,
        projectName: proj.name,
        projectCode: proj.code,
        clientName: proj.client,
        stageId: r.project_stage_id,
        stageName,
        reportNumber: r.report_number?.trim() || null,
        reportTitle,
        subject: r.subject?.trim() || null,
        visitNumber: visitNo,
        visitDate: r.visit_date || null,
        createdAt: r.created_at || new Date().toISOString(),
        submittedAt: r.submitted_at || r.created_at || null,
        status: r.status?.trim() || "completed",
        authorId: r.created_by ?? null,
        authorName: author.name,
        hasBilingualPdf: Boolean(trans?.bilingual_pdf_url),
      }
    })
  } catch (err) {
    console.error("[getAllReportsForExcelExport] Error:", err)
    return []
  }
}
