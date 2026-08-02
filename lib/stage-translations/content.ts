import { REPORT_TYPES, sanitizeReportHtml, type StageReportContent } from "@/lib/stages/execution"
import type {
  AttachmentTranslation,
  TranslationApprovalItem,
  TranslationChecklistItem,
  TranslationReportContent,
  TranslationSectionKey,
} from "@/lib/stage-translations/types"

const EMPTY_SECTIONS: Record<TranslationSectionKey, string> = {
  feedback: "",
  observation: "",
  findings: "",
  recommendations: "",
  correctiveActions: "",
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, max = 250_000) {
  return typeof value === "string" ? value.slice(0, max) : ""
}

export function reportTypeLabel(value: string, language: "en" | "ar" = "en") {
  const definition = REPORT_TYPES.find((item) => item.value === value)
  if (!definition) return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  return language === "ar" ? definition.labelAr : definition.label
}

export function buildOriginalTranslationContent(input: {
  stageName: string
  termName: string
  reportTitle: string
  subject: string | null
  reportType: string
  responseContent: StageReportContent
  approvals: Array<{ id: string; reviewerName: string; decision: string; comments: string | null; decidedAt: string }>
}): TranslationReportContent {
  return {
    stageName: input.stageName,
    termName: input.termName,
    reportTitle: input.reportTitle,
    subject: input.subject ?? "",
    reportType: reportTypeLabel(input.reportType, "en"),
    sections: {
      feedback: sanitizeReportHtml(input.responseContent.feedback),
      observation: sanitizeReportHtml(input.responseContent.observation),
      findings: sanitizeReportHtml(input.responseContent.findings),
      recommendations: sanitizeReportHtml(input.responseContent.recommendations),
      correctiveActions: sanitizeReportHtml(input.responseContent.correctiveActions),
    },
    checklist: input.responseContent.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      checked: item.checked,
      notes: item.notes ?? "",
    })),
    approvals: input.approvals.map((item) => ({
      id: item.id,
      reviewerName: item.reviewerName,
      decision: item.decision,
      comments: item.comments ?? "",
      decidedAt: item.decidedAt,
    })),
    attachmentTranslations: [],
  }
}

function parseChecklist(value: unknown): TranslationChecklistItem[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 250).map((item, index) => {
    const row = objectValue(item)
    return {
      id: stringValue(row.id, 100) || `checklist-${index + 1}`,
      label: stringValue(row.label, 2_000),
      checked: row.checked === true,
      notes: stringValue(row.notes, 4_000),
    }
  })
}

function parseApprovals(value: unknown): TranslationApprovalItem[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 100).map((item, index) => {
    const row = objectValue(item)
    return {
      id: stringValue(row.id, 100) || `approval-${index + 1}`,
      reviewerName: stringValue(row.reviewerName, 500),
      decision: stringValue(row.decision, 500),
      comments: stringValue(row.comments, 10_000),
      decidedAt: stringValue(row.decidedAt, 100),
    }
  })
}

function parseAttachmentTranslations(value: unknown): AttachmentTranslation[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).map((item) => {
    const row = objectValue(item)
    return {
      attachmentId: stringValue(row.attachmentId, 100),
      filename: stringValue(row.filename, 1_000),
      contentHtml: sanitizeReportHtml(row.contentHtml),
    }
  }).filter((item) => item.attachmentId || item.filename || item.contentHtml)
}

export function parseTranslationContent(value: unknown): TranslationReportContent | null {
  const row = objectValue(value)
  if (!Object.keys(row).length) return null
  const sectionRow = objectValue(row.sections)
  return {
    stageName: stringValue(row.stageName, 2_000),
    termName: stringValue(row.termName, 2_000),
    reportTitle: stringValue(row.reportTitle, 2_000),
    subject: stringValue(row.subject, 4_000),
    reportType: stringValue(row.reportType, 1_000),
    sections: {
      ...EMPTY_SECTIONS,
      feedback: sanitizeReportHtml(sectionRow.feedback),
      observation: sanitizeReportHtml(sectionRow.observation),
      findings: sanitizeReportHtml(sectionRow.findings),
      recommendations: sanitizeReportHtml(sectionRow.recommendations),
      correctiveActions: sanitizeReportHtml(sectionRow.correctiveActions),
    },
    checklist: parseChecklist(row.checklist),
    approvals: parseApprovals(row.approvals),
    attachmentTranslations: parseAttachmentTranslations(row.attachmentTranslations),
  }
}
