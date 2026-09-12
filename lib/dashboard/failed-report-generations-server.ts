import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { isProjectUuid } from "@/lib/auth/project-access"

export type FailedReportGenerationItem = {
  translationId: string
  responseId: string
  projectId: string
  projectStageId: string
  projectName: string
  projectCode: string | null
  stageName: string
  reportTitle: string
  subject: string | null
  visitNumber: number | null
  translationStatus: string
  originalPdfUrl: string | null
  bilingualPdfUrl: string | null
  updatedAt: string
}

export async function getFailedReportGenerations({
  orgId,
  projectId,
  limit = 50,
}: {
  orgId?: string | null
  projectId?: string | null
  limit?: number
}): Promise<FailedReportGenerationItem[]> {
  try {
    const admin = createAdminClient()

    let targetProjectIds: string[] = []
    if (projectId && isProjectUuid(projectId)) {
      targetProjectIds = [projectId]
    } else if (orgId && isProjectUuid(orgId)) {
      const { data: orgProjects } = await admin
        .from("projects")
        .select("id")
        .eq("supervising_organization_id", orgId)
      targetProjectIds = (orgProjects ?? []).map((p: any) => p.id).filter(isProjectUuid)
    }

    if (!targetProjectIds.length) {
      const { data: allProjects } = await admin
        .from("projects")
        .select("id")
        .limit(200)
      targetProjectIds = (allProjects ?? []).map((p: any) => p.id).filter(isProjectUuid)
    }

    if (!targetProjectIds.length) {
      return []
    }

    // Query translation_documents where bilingual_pdf_url is NULL or original_pdf_url is NULL or translation_status is 'failed'
    const { data: translationRows, error: transError } = await admin
      .from("translation_documents")
      .select("id, project_id, project_stage_id, response_id, translation_status, original_pdf_url, bilingual_pdf_url, updated_at, created_at")
      .in("project_id", targetProjectIds)
      .or("bilingual_pdf_url.is.null,original_pdf_url.is.null,translation_status.eq.failed")
      .order("updated_at", { ascending: false })
      .limit(limit)

    if (transError) {
      console.error("[getFailedReportGenerations] query error:", transError)
      return []
    }

    if (!translationRows || translationRows.length === 0) {
      return []
    }

    const responseIds = Array.from(new Set(translationRows.map((r: any) => r.response_id).filter(isProjectUuid)))
    const projectIds = Array.from(new Set(translationRows.map((r: any) => r.project_id).filter(isProjectUuid)))
    const stageIds = Array.from(new Set(translationRows.map((r: any) => r.project_stage_id).filter(isProjectUuid)))

    const [
      { data: responses },
      { data: projects },
      { data: stages },
    ] = await Promise.all([
      responseIds.length
        ? admin
            .from("term_responses")
            .select("id, project_id, project_stage_id, report_title, subject, visit_number, status, report_number")
            .in("id", responseIds)
        : Promise.resolve({ data: [] as any[] }),
      projectIds.length
        ? admin
            .from("projects")
            .select("id, name, code")
            .in("id", projectIds)
        : Promise.resolve({ data: [] as any[] }),
      stageIds.length
        ? admin
            .from("project_stages")
            .select("id, name")
            .in("id", stageIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const responseMap = new Map((responses ?? []).map((r: any) => [r.id, r]))
    const projectMap = new Map((projects ?? []).map((p: any) => [p.id, p]))
    const stageMap = new Map((stages ?? []).map((s: any) => [s.id, s]))

    const result: FailedReportGenerationItem[] = []

    for (const row of translationRows) {
      const response = responseMap.get(row.response_id)
      if (!response) continue

      const project = projectMap.get(row.project_id) ?? { name: "Project", code: null }
      const stage = stageMap.get(row.project_stage_id) ?? { name: "Stage" }

      const reportTitle =
        response.report_title?.trim() ||
        response.subject?.trim() ||
        (response.report_number ? `Report #${response.report_number}` : "Inspection Report")

      const visitNumber =
        Number.isInteger(Number(response.visit_number)) && Number(response.visit_number) > 0
          ? Number(response.visit_number)
          : null

      result.push({
        translationId: row.id,
        responseId: row.response_id,
        projectId: row.project_id,
        projectStageId: row.project_stage_id,
        projectName: project.name?.trim() || "Project",
        projectCode: project.code?.trim() || null,
        stageName: stage.name?.trim() || "Stage",
        reportTitle,
        subject: response.subject?.trim() || null,
        visitNumber,
        translationStatus: row.translation_status || "pending",
        originalPdfUrl: row.original_pdf_url ?? null,
        bilingualPdfUrl: row.bilingual_pdf_url ?? null,
        updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      })
    }

    return result
  } catch (error) {
    console.error("[getFailedReportGenerations] error:", error)
    return []
  }
}
