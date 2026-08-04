import "server-only"

import { loadDirectProjectStageReport, loadProjectStageReport, loadProjectStageTerm, type ProjectTermResponse } from "@/lib/db/project-stages"
import { buildOriginalTranslationContent, parseTranslationContent } from "@/lib/stage-translations/content"
import type { StageTranslationPageData, StageTranslationRecord } from "@/lib/stage-translations/types"
import { createAdminClient } from "@/lib/supabase/admin"

function mapTranslation(row: any, fallbackOriginal: StageTranslationRecord["originalContent"]): StageTranslationRecord {
  return {
    id: row.id,
    status: row.translation_status,
    originalContent: parseTranslationContent(row.original_content) ?? fallbackOriginal,
    translatedContent: parseTranslationContent(row.translated_content),
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    originalPdfPath: row.original_pdf_url,
    arabicPdfPath: row.arabic_pdf_url,
    bilingualPdfPath: row.bilingual_pdf_url,
  }
}

async function loadTranslationContext(responseId: string, projectId: string) {
  const admin = createAdminClient()
  const [translationResult, projectResult] = await Promise.all([
    admin
      .from("translation_documents")
      .select("id, translation_status, original_content, translated_content, original_pdf_url, arabic_pdf_url, bilingual_pdf_url, generated_at, created_at, updated_at")
      .eq("response_id", responseId)
      .maybeSingle(),
    admin
      .from("projects")
      .select("location, plot_no")
      .eq("id", projectId)
      .maybeSingle(),
  ])
  if (translationResult.error) throw translationResult.error
  if (projectResult.error) throw projectResult.error
  return { translation: translationResult.data, projectDetails: projectResult.data }
}

async function buildPageData(
  execution: Awaited<ReturnType<typeof loadProjectStageTerm>>,
  response: ProjectTermResponse,
): Promise<StageTranslationPageData | null> {
  if (!execution) return null
  const originalContent = buildOriginalTranslationContent({
    stageName: execution.stage.name,
    termName: execution.term.reportName,
    reportTitle: response.reportTitle,
    subject: response.subject,
    reportType: response.reportType,
    responseContent: response.content,
    approvals: response.approvals.map((approval) => ({
      id: approval.id,
      reviewerName: approval.reviewer.name,
      decision: approval.decision,
      comments: approval.comments,
      decidedAt: approval.decidedAt,
    })),
  })
  const { translation, projectDetails } = await loadTranslationContext(response.id, execution.project.id)
  return {
    project: {
      ...execution.project,
      location: projectDetails?.location ?? null,
      plotNo: projectDetails?.plot_no ?? null,
    },
    stage: { id: execution.stage.id, name: execution.stage.name },
    term: { id: execution.term.id, name: execution.term.reportName, required: execution.term.required },
    response: {
      id: response.id,
      reportNumber: response.reportNumber,
      visitNumber: response.visitNumber,
      reportType: response.reportType,
      subject: response.subject,
      reportTitle: response.reportTitle,
      status: response.status,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
      content: originalContent,
      createdBy: response.createdBy ? { id: response.createdBy.id, name: response.createdBy.name, email: response.createdBy.email } : null,
      attachments: response.attachments,
    },
    translation: translation ? mapTranslation(translation, originalContent) : null,
  }
}

async function buildDirectStagePageData(
  execution: Awaited<ReturnType<typeof loadDirectProjectStageReport>>,
  response: ProjectTermResponse,
): Promise<StageTranslationPageData | null> {
  if (!execution || !response) return null
  const originalContent = buildOriginalTranslationContent({
    stageName: execution.stage.name,
    termName: `${execution.stage.name} Report`,
    reportTitle: response.reportTitle,
    subject: response.subject,
    reportType: response.reportType,
    responseContent: response.content,
    approvals: response.approvals.map((approval) => ({
      id: approval.id,
      reviewerName: approval.reviewer.name,
      decision: approval.decision,
      comments: approval.comments,
      decidedAt: approval.decidedAt,
    })),
  })
  const { translation, projectDetails } = await loadTranslationContext(response.id, execution.project.id)
  return {
    project: {
      ...execution.project,
      location: projectDetails?.location ?? null,
      plotNo: projectDetails?.plot_no ?? null,
    },
    stage: { id: execution.stage.id, name: execution.stage.name },
    term: { id: execution.stage.id, name: `${execution.stage.name} Report`, required: false },
    response: {
      id: response.id,
      reportNumber: response.reportNumber,
      visitNumber: response.visitNumber,
      reportType: response.reportType,
      subject: response.subject,
      reportTitle: response.reportTitle,
      status: response.status,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
      content: originalContent,
      createdBy: response.createdBy ? { id: response.createdBy.id, name: response.createdBy.name, email: response.createdBy.email } : null,
      attachments: response.attachments,
    },
    translation: translation ? mapTranslation(translation, originalContent) : null,
  }
}

export async function loadStageTranslationPageData(
  projectId: string,
  stageId: string,
  userId: string,
  responseId: string,
  termId?: string | null,
): Promise<StageTranslationPageData | null> {
  if (termId && termId !== stageId) {
    const execution = await loadProjectStageReport(projectId, termId, responseId, userId)
    if (execution) return buildPageData(execution, execution.response)
  }

  const directExecution = await loadDirectProjectStageReport(projectId, stageId, responseId, userId)
  if (directExecution) {
    return buildDirectStagePageData(directExecution, directExecution.response)
  }

  return null
}
