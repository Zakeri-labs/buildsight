import { REPORT_TYPES, sanitizeReportHtml, type TermResponseContent } from "@/lib/stages/execution"
import type {
  AttachmentTranslation,
  TranslationApprovalItem,
  TranslationChecklistItem,
  TranslationRecipientItem,
  TranslationRecipients,
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
  rectificationAndSubsequentWork: "",
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

export function normalizeRecipientItem(item: unknown): TranslationRecipientItem | null {
  if (!item || typeof item !== "object") return null
  const row = item as Record<string, unknown>
  const name = stringValue(row.name, 500).trim()
  const email = stringValue(row.email, 500).trim()
  const company = stringValue(row.company, 500).trim()
  const role = stringValue(row.role, 500).trim()
  const id = stringValue(row.id, 100).trim()
  const type = stringValue(row.type, 50).trim()

  if (!name && !email && !company && !id) return null

  return {
    ...(id ? { id } : {}),
    ...(type ? { type } : {}),
    name: name || email || "Recipient",
    ...(email ? { email } : {}),
    ...(company ? { company } : {}),
    ...(role ? { role } : {}),
  }
}

export function sortRecipients(items: TranslationRecipientItem[]): TranslationRecipientItem[] {
  return [...items].sort((a, b) => {
    const keyA = `${a.id || ""}|${a.name || ""}|${a.email || ""}|${a.company || ""}|${a.role || ""}`.toLowerCase()
    const keyB = `${b.id || ""}|${b.name || ""}|${b.email || ""}|${b.company || ""}|${b.role || ""}`.toLowerCase()
    return keyA.localeCompare(keyB)
  })
}

export function parseRecipients(value: unknown): TranslationRecipients | undefined {
  if (!value || typeof value !== "object") return undefined
  const row = value as Record<string, unknown>
  const reportToRaw = Array.isArray(row.reportTo) ? row.reportTo : []
  const ccToRaw = Array.isArray(row.ccTo) ? row.ccTo : []

  const reportTo = sortRecipients(
    reportToRaw
      .map(normalizeRecipientItem)
      .filter((item): item is TranslationRecipientItem => item !== null)
  )
  const ccTo = sortRecipients(
    ccToRaw
      .map(normalizeRecipientItem)
      .filter((item): item is TranslationRecipientItem => item !== null)
  )

  if (!reportTo.length && !ccTo.length) return undefined
  return { reportTo, ccTo }
}

export type BuildTranslationRecipientsInput =
  | TranslationRecipients
  | Array<{
      id?: string
      type?: string
      recipient_type?: string
      name?: string | null
      external_name?: string | null
      email?: string | null
      external_email?: string | null
      company?: string | null
      external_company?: string | null
      role?: string | null
      external_role?: string | null
      group?: "reportTo" | "ccTo" | string | null
      recipient_group?: "reportTo" | "ccTo" | string | null
    }>

function formatRecipientsInput(input?: BuildTranslationRecipientsInput | null): TranslationRecipients | undefined {
  if (!input) return undefined
  if (typeof input === "object" && !Array.isArray(input)) {
    return parseRecipients(input)
  }
  if (Array.isArray(input)) {
    const reportToItems: TranslationRecipientItem[] = []
    const ccToItems: TranslationRecipientItem[] = []
    for (const r of input) {
      const group = (r.group || r.recipient_group || "") as string
      const item = normalizeRecipientItem({
        id: r.id,
        type: r.type || r.recipient_type,
        name: r.name || r.external_name || "",
        email: r.email || r.external_email || "",
        company: r.company || r.external_company || "",
        role: r.role || r.external_role || "",
      })
      if (!item) continue
      if (group === "reportTo") {
        reportToItems.push(item)
      } else if (group === "ccTo") {
        ccToItems.push(item)
      }
    }
    const reportTo = sortRecipients(reportToItems)
    const ccTo = sortRecipients(ccToItems)
    if (!reportTo.length && !ccTo.length) return undefined
    return { reportTo, ccTo }
  }
  return undefined
}

export function buildOriginalTranslationContent(input: {
  stageName: string
  termName: string
  reportTitle: string
  subject: string | null
  reportType: string
  visitDate?: string | null
  visitNumber?: number | string | null
  creatorName?: string | null
  projectName?: string | null
  projectCode?: string | null
  projectLocation?: string | null
  projectPhase?: string | null
  projectPlotNo?: string | null
  responseContent: TermResponseContent
  approvals: Array<{ id: string; reviewerName: string; decision: string; comments: string | null; decidedAt: string }>
  attachments?: Array<{ id: string; storagePath: string; originalFilename: string; sortOrder?: number; attachmentKind?: string }>
  recipients?: BuildTranslationRecipientsInput | null
}): TranslationReportContent {
  return {
    stageName: input.stageName,
    termName: input.termName,
    reportTitle: input.reportTitle,
    subject: input.subject ?? "",
    reportType: reportTypeLabel(input.reportType, "en"),
    visitDate: input.visitDate ?? "",
    visitNumber: input.visitNumber != null ? String(input.visitNumber) : "",
    creatorName: input.creatorName ?? "",
    projectName: input.projectName ?? "",
    projectCode: input.projectCode ?? "",
    projectLocation: input.projectLocation ?? "",
    projectPhase: input.projectPhase ?? "",
    projectPlotNo: input.projectPlotNo ?? "",
    sections: {
      feedback: sanitizeReportHtml(input.responseContent.feedback),
      observation: sanitizeReportHtml(input.responseContent.observation),
      findings: sanitizeReportHtml(input.responseContent.findings),
      recommendations: sanitizeReportHtml(input.responseContent.recommendations),
      correctiveActions: sanitizeReportHtml(input.responseContent.correctiveActions),
      recommendationsDuringCasting: sanitizeReportHtml(input.responseContent.recommendationsDuringCasting),
      rectificationAndSubsequentWork: sanitizeReportHtml(input.responseContent.rectificationAndSubsequentWork),
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
    recipients: formatRecipientsInput(input.recipients),
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
    visitDate: stringValue(row.visitDate, 100),
    visitNumber: stringValue(row.visitNumber, 100),
    creatorName: stringValue(row.creatorName, 500),
    projectName: stringValue(row.projectName, 2_000),
    projectCode: stringValue(row.projectCode, 500),
    projectLocation: stringValue(row.projectLocation, 2_000),
    projectPhase: stringValue(row.projectPhase, 500),
    projectPlotNo: stringValue(row.projectPlotNo, 500),
    sections: {
      ...EMPTY_SECTIONS,
      feedback: sanitizeReportHtml(sectionRow.feedback),
      observation: sanitizeReportHtml(sectionRow.observation),
      findings: sanitizeReportHtml(sectionRow.findings),
      recommendations: sanitizeReportHtml(sectionRow.recommendations),
      correctiveActions: sanitizeReportHtml(sectionRow.correctiveActions),
      recommendationsDuringCasting: sanitizeReportHtml(sectionRow.recommendationsDuringCasting),
      rectificationAndSubsequentWork: sanitizeReportHtml(sectionRow.rectificationAndSubsequentWork),
    },
    checklist: parseChecklist(row.checklist),
    approvals: parseApprovals(row.approvals),
    attachmentTranslations: parseAttachmentTranslations(row.attachmentTranslations),
    attachments: parseAttachments(row.attachments),
    recipients: parseRecipients(row.recipients),
  }
}

export const PREDEFINED_TEMPLATE_VERSION = 1

export function normalizeSectionHtml(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""

  // Treat empty tag variations (<p></p>, <p><br></p>, <br>, &nbsp;, whitespace) as empty
  const withoutTagsOrSpaces = trimmed
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim()

  const hasMedia = /<img\b|<table\b|<iframe\b|<video\b/i.test(trimmed)

  if (!withoutTagsOrSpaces && !hasMedia) {
    return ""
  }

  return trimmed
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
    "rectificationAndSubsequentWork",
  ]
  for (const key of sectionKeys) {
    const currSec = normalizeSectionHtml(current.sections?.[key])
    const origSec = normalizeSectionHtml(translatedOriginal.sections?.[key])
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
    if (Boolean(c.checked) !== Boolean(o.checked)) return true
    if ((c.result || "") !== (o.result || "")) return true
    if ((c.notes || "").trim() !== (o.notes || "").trim()) return true
  }

  return false
}

function areRecipientItemsEqual(a: TranslationRecipientItem, b: TranslationRecipientItem): boolean {
  if ((a.id || "") !== (b.id || "")) return false
  if ((a.type || "") !== (b.type || "")) return false
  if ((a.name || "").trim() !== (b.name || "").trim()) return false
  if ((a.email || "").trim().toLowerCase() !== (b.email || "").trim().toLowerCase()) return false
  if ((a.company || "").trim() !== (b.company || "").trim()) return false
  if ((a.role || "").trim() !== (b.role || "").trim()) return false
  return true
}

function areRecipientArraysEqual(
  curr: TranslationRecipientItem[] | undefined | null,
  orig: TranslationRecipientItem[] | undefined | null,
): boolean {
  const listA = sortRecipients(curr || [])
  const listB = sortRecipients(orig || [])
  if (listA.length !== listB.length) return false
  for (let i = 0; i < listA.length; i++) {
    if (!areRecipientItemsEqual(listA[i], listB[i])) return false
  }
  return true
}

export function isReportContentStale(
  current: TranslationReportContent | null | undefined,
  translatedOriginal: TranslationReportContent | null | undefined,
): boolean {
  if (!current || !translatedOriginal) return false
  if (isReportTextStale(current, translatedOriginal)) return true

  const currentVisitDate = current.visitDate ?? ""
  const originalVisitDate = translatedOriginal.visitDate ?? ""
  if (currentVisitDate !== originalVisitDate) return true

  const currentVisitNumber = current.visitNumber != null ? String(current.visitNumber) : ""
  const originalVisitNumber = translatedOriginal.visitNumber != null ? String(translatedOriginal.visitNumber) : ""
  if (currentVisitNumber !== originalVisitNumber) return true

  const currentCreatorName = current.creatorName ?? ""
  const originalCreatorName = translatedOriginal.creatorName ?? ""
  if (currentCreatorName !== originalCreatorName) return true

  const currentProjectName = current.projectName ?? ""
  const originalProjectName = translatedOriginal.projectName ?? ""
  if (currentProjectName !== originalProjectName) return true

  const currentProjectCode = current.projectCode ?? ""
  const originalProjectCode = translatedOriginal.projectCode ?? ""
  if (currentProjectCode !== originalProjectCode) return true

  const currentProjectLocation = current.projectLocation ?? ""
  const originalProjectLocation = translatedOriginal.projectLocation ?? ""
  if (currentProjectLocation !== originalProjectLocation) return true

  const currentProjectPhase = current.projectPhase ?? ""
  const originalProjectPhase = translatedOriginal.projectPhase ?? ""
  if (currentProjectPhase !== originalProjectPhase) return true

  const currentProjectPlotNo = current.projectPlotNo ?? ""
  const originalProjectPlotNo = translatedOriginal.projectPlotNo ?? ""
  if (currentProjectPlotNo !== originalProjectPlotNo) return true

  const currApprovals = current.approvals || []
  const origApprovals = translatedOriginal.approvals || []
  if (currApprovals.length !== origApprovals.length) return true
  for (let i = 0; i < currApprovals.length; i++) {
    const c = currApprovals[i]
    const o = origApprovals[i]
    if (c.id !== o.id) return true
    if ((c.reviewerName || "").trim() !== (o.reviewerName || "").trim()) return true
    if ((c.decision || "").trim() !== (o.decision || "").trim()) return true
    if ((c.comments || "").trim() !== (o.comments || "").trim()) return true
    if ((c.decidedAt || "").trim() !== (o.decidedAt || "").trim()) return true
  }

  const currAttachments = current.attachments || []
  const origAttachments = translatedOriginal.attachments || []
  if (currAttachments.length !== origAttachments.length) return true
  for (let i = 0; i < currAttachments.length; i++) {
    const c = currAttachments[i]
    const o = origAttachments[i]
    if (c.id !== o.id) return true
    if ((c.storagePath || "") !== (o.storagePath || "")) return true
    if ((c.originalFilename || "") !== (o.originalFilename || "")) return true
    if ((c.sortOrder ?? 0) !== (o.sortOrder ?? 0)) return true
    if ((c.attachmentKind || "") !== (o.attachmentKind || "")) return true
  }

  const currReportTo = current.recipients?.reportTo || []
  const origReportTo = translatedOriginal.recipients?.reportTo || []
  if (!areRecipientArraysEqual(currReportTo, origReportTo)) return true

  const currCcTo = current.recipients?.ccTo || []
  const origCcTo = translatedOriginal.recipients?.ccTo || []
  if (!areRecipientArraysEqual(currCcTo, origCcTo)) return true

  return false
}

