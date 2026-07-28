import "server-only"

import { loadProjectStageTerm } from "@/lib/db/project-stages"
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

export async function loadStageTranslationPageData(
  projectId: string,
  stageId: string,
  termId: string,
  userId: string,
): Promise<StageTranslationPageData | null> {
  const execution = await loadProjectStageTerm(projectId, termId, userId)
  if (!execution || execution.stage.id !== stageId || !execution.term.response) return null

  const response = execution.term.response
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

  const admin = createAdminClient()
  const { data: translation, error } = await admin
    .from("translation_documents")
    .select("id, translation_status, original_content, translated_content, original_pdf_url, arabic_pdf_url, bilingual_pdf_url, generated_at, created_at, updated_at")
    .eq("response_id", response.id)
    .maybeSingle()
  if (error) throw error

  return {
    project: execution.project,
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
      attachments: response.attachments,
    },
    translation: translation ? mapTranslation(translation, originalContent) : null,
  }
}
