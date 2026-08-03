import type { ProjectStageAttachment } from "@/lib/db/project-stages"

export const TRANSLATION_SECTION_KEYS = [
  "feedback",
  "observation",
  "findings",
  "recommendations",
  "correctiveActions",
] as const

export type TranslationSectionKey = (typeof TRANSLATION_SECTION_KEYS)[number]

export type TranslationChecklistItem = {
  id: string
  label: string
  checked: boolean
  result?: "pass" | "fail" | "na" | "in_progress" | string
  notes: string
}

export type TranslationApprovalItem = {
  id: string
  reviewerName: string
  decision: string
  comments: string
  decidedAt: string
}

export type AttachmentTranslation = {
  attachmentId: string
  filename: string
  contentHtml: string
}

export type TranslationReportContent = {
  stageName: string
  termName: string
  reportTitle: string
  subject: string
  reportType: string
  sections: Record<TranslationSectionKey, string>
  checklist: TranslationChecklistItem[]
  approvals: TranslationApprovalItem[]
  attachmentTranslations: AttachmentTranslation[]
}

export type StageTranslationRecord = {
  id: string
  status: "pending" | "completed" | "failed"
  originalContent: TranslationReportContent
  translatedContent: TranslationReportContent | null
  generatedAt: string | null
  createdAt: string
  updatedAt: string
  originalPdfPath: string | null
  arabicPdfPath: string | null
  bilingualPdfPath: string | null
}

export type StageTranslationPageData = {
  project: { id: string; name: string; code: string | null }
  stage: { id: string; name: string }
  term: { id: string; name: string; required: boolean }
  response: {
    id: string
    reportNumber: string
    visitNumber: number
    reportType: string
    subject: string | null
    reportTitle: string
    status: string
    createdAt: string
    updatedAt: string
    content: TranslationReportContent
    createdBy?: { id?: string; name: string; email?: string | null } | null
    attachments: ProjectStageAttachment[]
  }
  translation: StageTranslationRecord | null
}
