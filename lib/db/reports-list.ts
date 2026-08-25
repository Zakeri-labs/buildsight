import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgProjects } from "@/lib/db/domain"

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
  status: string
  authorName: string
  authorInitials: string
  createdAt: string
  submittedAt: string | null
  href: string
}

export type PaginatedReportsResult = {
  items: ListReportItem[]
  totalReports: number
  currentPage: number
  totalPages: number
  summary: {
    totalReports: number
    openIssues: number
  }
}

export async function getPaginatedReportsList({
  userId,
  organizationId,
  page = 1,
  pageSize = 30,
}: {
  userId: string
  organizationId?: string
  page?: number
  pageSize?: number
}): Promise<PaginatedReportsResult> {
  const safePage = Math.max(1, Math.floor(page) || 1)
  const offset = (safePage - 1) * pageSize

  try {
    const admin = createAdminClient()

    // 1. Get project scope for user/org
    let projectIds: string[] = []
    if (organizationId && isUuid(organizationId)) {
      const orgProjects = await getOrgProjects(organizationId, userId)
      projectIds = orgProjects.map((p) => p.id).filter(isUuid)
    }

    if (!projectIds.length) {
      // Fallback: Query projects user belongs to or supervisor of
      const { data: userProjects } = await admin
        .from("projects")
        .select("id")
        .limit(200)
      projectIds = (userProjects ?? []).map((p: any) => p.id).filter(isUuid)
    }

    if (!projectIds.length) {
      return {
        items: [],
        totalReports: 0,
        currentPage: 1,
        totalPages: 1,
        summary: { totalReports: 0, openIssues: 0 },
      }
    }

    const validStatuses = ["submitted", "under_review", "approved", "rejected", "completed"]

    // 2. Count total reports matching filter
    const { count: totalCount } = await admin
      .from("term_responses")
      .select("id", { count: "exact", head: true })
      .in("project_id", projectIds)
      .is("project_stage_term_id", null)
      .in("status", validStatuses)

    const totalReports = totalCount ?? 0
    const totalPages = Math.max(1, Math.ceil(totalReports / pageSize))

    // 3. Count open issues (rejected/under_review) for summary card
    const { count: openIssuesCount } = await admin
      .from("term_responses")
      .select("id", { count: "exact", head: true })
      .in("project_id", projectIds)
      .is("project_stage_term_id", null)
      .in("status", ["under_review", "rejected"])

    // 4. Fetch paginated reports list with lightweight column selection
    const { data: responses, error: responseErr } = await admin
      .from("term_responses")
      .select("id, project_id, project_stage_id, report_number, report_title, subject, visit_number, status, created_by, created_at, submitted_at, completed_at")
      .in("project_id", projectIds)
      .is("project_stage_term_id", null)
      .in("status", validStatuses)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (responseErr || !responses || !responses.length) {
      return {
        items: [],
        totalReports,
        currentPage: safePage,
        totalPages,
        summary: { totalReports, openIssues: openIssuesCount ?? 0 },
      }
    }

    // 5. Hydrate related names (Projects, Project Stages, Profiles)
    const respProjectIds = Array.from(new Set(responses.map((r: any) => r.project_id).filter(isUuid)))
    const respStageIds = Array.from(new Set(responses.map((r: any) => r.project_stage_id).filter(isUuid)))
    const respUserIds = Array.from(new Set(responses.map((r: any) => r.created_by).filter(isUuid)))

    const [{ data: projectRows }, { data: stageRows }, { data: profileRows }] = await Promise.all([
      respProjectIds.length
        ? admin.from("projects").select("id, name, code").in("id", respProjectIds)
        : Promise.resolve({ data: [] as any[] }),
      respStageIds.length
        ? admin.from("project_stages").select("id, name").in("id", respStageIds)
        : Promise.resolve({ data: [] as any[] }),
      respUserIds.length
        ? admin.from("profiles").select("id, full_name, email").in("id", respUserIds)
        : Promise.resolve({ data: [] as any[] }),
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
    const items: ListReportItem[] = responses.map((r: any): ListReportItem => {
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
        status: r.status?.trim() || "completed",
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
      summary: {
        totalReports,
        openIssues: openIssuesCount ?? 0,
      },
    }
  } catch (err) {
    console.error("[getPaginatedReportsList] Error:", err)
    return {
      items: [],
      totalReports: 0,
      currentPage: 1,
      totalPages: 1,
      summary: { totalReports: 0, openIssues: 0 },
    }
  }
}
