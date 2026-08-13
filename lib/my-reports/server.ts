import "server-only"

import { resolveCalendarProjectScope, resolveExplicitSupervisorProjectScope } from "@/lib/calendar/server"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

export type MyReportItem = {
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
  createdAt: string
  submittedAt: string | null
  completedAt: string | null
  href: string
}

export async function getSupervisorMyReports(userId: string): Promise<MyReportItem[]> {
  if (!isUuid(userId)) return []

  try {
    let scope = await resolveExplicitSupervisorProjectScope(userId)
    if (!scope.length) {
      scope = await resolveCalendarProjectScope(userId)
    }
    const projectIds = Array.from(new Set(scope.map((p) => p.id).filter(isUuid)))

    const admin = createAdminClient()

    // Fetch recent report responses for supervised projects or created by user
    const { data: responses, error: responseErr } = projectIds.length
      ? await admin
          .from("term_responses")
          .select("id, project_id, project_stage_id, report_number, report_title, subject, visit_number, status, created_by, created_at, submitted_at, completed_at")
          .in("project_id", projectIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : await admin
          .from("term_responses")
          .select("id, project_id, project_stage_id, report_number, report_title, subject, visit_number, status, created_by, created_at, submitted_at, completed_at")
          .eq("created_by", userId)
          .order("created_at", { ascending: false })
          .limit(100)

    if (responseErr || !responses || !responses.length) return []

    // Fetch related projects and project_stages
    const respProjectIds = Array.from(new Set(responses.map((r: any) => r.project_id).filter(isUuid)))
    const respStageIds = Array.from(new Set(responses.map((r: any) => r.project_stage_id).filter(isUuid)))

    const [{ data: projectRows }, { data: stageRows }] = await Promise.all([
      respProjectIds.length
        ? admin.from("projects").select("id, name, code").in("id", respProjectIds)
        : Promise.resolve({ data: [] as any[] }),
      respStageIds.length
        ? admin.from("project_stages").select("id, name").in("id", respStageIds)
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

    return responses.map((r: any): MyReportItem => {
      const proj = projectById.get(r.project_id) ?? { name: "Project", code: null }
      const stageName = stageById.get(r.project_stage_id) ?? "Stage"
      const reportTitle = r.report_title?.trim() || r.subject?.trim() || `Report ${r.report_number || ""}`.trim() || "Inspection Report"
      const visitNo = Number.isInteger(Number(r.visit_number)) && Number(r.visit_number) > 0 ? Number(r.visit_number) : null

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
        createdAt: r.created_at || new Date().toISOString(),
        submittedAt: r.submitted_at || null,
        completedAt: r.completed_at || null,
        href: `/projects/${r.project_id}/stages/${r.project_stage_id}/reports/${r.id}`,
      }
    })
  } catch (err) {
    console.error("[my-reports] error fetching supervisor reports:", err)
    return []
  }
}
