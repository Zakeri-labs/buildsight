import { REPORT_TYPES, sanitizeReportHtml, type TermResponseContent } from "@/lib/stages/execution"
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
  recommendationsDuringCasting: "",
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
  responseContent: TermResponseContent
  approvals: Array<{ id: string; reviewerName: string; decision: string; comments: string | null; decidedAt: string }>
  attachments?: Array<{ id: string; storagePath: string; originalFilename: string; sortOrder?: number; attachmentKind?: string }>
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
      recommendationsDuringCasting: sanitizeReportHtml(input.responseContent.recommendationsDuringCasting),
    },
    checklist: input.responseContent.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      checked: item.checked,
      result: item.result,
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
    attachments: (input.attachments ?? []).map((item) => ({
      id: item.id,
      storagePath: item.storagePath,
      originalFilename: item.originalFilename,
      sortOrder: item.sortOrder,
      attachmentKind: item.attachmentKind,
    })),
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
      result: stringValue(row.result, 50) || undefined,
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

function parseAttachments(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.slice(0, 100).map((item) => {
    const row = objectValue(item)
    return {
      id: stringValue(row.id, 100),
      storagePath: stringValue(row.storagePath, 2_000),
      originalFilename: stringValue(row.originalFilename, 1_000),
      sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : undefined,
      attachmentKind: stringValue(row.attachmentKind, 50) || undefined,
    }
  }).filter((item) => item.id || item.storagePath)
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
      recommendationsDuringCasting: sanitizeReportHtml(sectionRow.recommendationsDuringCasting),
    },
    checklist: parseChecklist(row.checklist),
    approvals: parseApprovals(row.approvals),
    attachmentTranslations: parseAttachmentTranslations(row.attachmentTranslations),
    attachments: parseAttachments(row.attachments),
  }
}

export function isReportTextStale(
  current: TranslationReportContent | null | undefined,
  translatedOriginal: TranslationReportContent | null | undefined,
): boolean {
  if (!current || !translatedOriginal) return false

  if ((current.reportTitle || "").trim() !== (translatedOriginal.reportTitle || "").trim()) return true
  if ((current.subject || "").trim() !== (translatedOriginal.subject || "").trim()) return true
  if ((current.reportType || "").trim() !== (translatedOriginal.reportType || "").trim()) return true
  if ((current.stageName || "").trim() !== (translatedOriginal.stageName || "").trim()) return true
  if ((current.termName || "").trim() !== (translatedOriginal.termName || "").trim()) return true

  const sectionKeys: TranslationSectionKey[] = [
    "feedback",
    "observation",
    "findings",
    "recommendations",
    "correctiveActions",
    "recommendationsDuringCasting",
  ]
  for (const key of sectionKeys) {
    const currSec = (current.sections?.[key] || "").trim()
    const origSec = (translatedOriginal.sections?.[key] || "").trim()
    if (currSec !== origSec) return true
  }

  const currChecklist = current.checklist || []
  const origChecklist = translatedOriginal.checklist || []
  if (currChecklist.length !== origChecklist.length) return true
  for (let i = 0; i < currChecklist.length; i++) {
    const c = currChecklist[i]
    const o = origChecklist[i]
    if (c.id !== o.id) return true
    if ((c.label || "").trim() !== (o.label || "").trim()) return true
    if (c.checked !== o.checked) return true
    if ((c.result || "") !== (o.result || "")) return true
    if ((c.notes || "").trim() !== (o.notes || "").trim()) return true
  }

  return false
}

export function isReportContentStale(
  current: TranslationReportContent | null | undefined,
  translatedOriginal: TranslationReportContent | null | undefined,
): boolean {
  if (!current || !translatedOriginal) return false
  if (isReportTextStale(current, translatedOriginal)) return true

  const currAttachments = current.attachments || []
  const origAttachments = translatedOriginal.attachments || []
  if (currAttachments.length !== origAttachments.length) return true
  for (let i = 0; i < currAttachments.length; i++) {
    const c = currAttachments[i]
    const o = origAttachments[i]
    if (c.id !== o.id) return true
    if ((c.storagePath || "") !== (o.storagePath || "")) return true
    if ((c.originalFilename || "") !== (o.originalFilename || "")) return true
    if (c.sortOrder !== o.sortOrder) return true
    if ((c.attachmentKind || "") !== (o.attachmentKind || "")) return true
  }

  return false
}

