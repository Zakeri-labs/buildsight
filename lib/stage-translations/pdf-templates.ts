import type {
  StageTranslationPageData,
  StageTranslationRecord,
  TranslationReportContent,
  TranslationSectionKey,
} from "@/lib/stage-translations/types"
import { statusLabel } from "@/lib/stages/execution"

export type PdfKind = "original" | "arabic" | "bilingual"

export type SourceImageSectionHint =
  | TranslationSectionKey
  | "checklist"
  | "approvals"
  | "evidence"
  | "documents"

export type ExtractedPdfImage = {
  id: string
  pageNumber: number
  order: number
  dataUrl: string
  sourceCaption: string
  contextText: string
  sectionHint: SourceImageSectionHint | null
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
  fingerprint?: string
  decorative?: boolean
  decorativeReason?: "repeated-header" | "repeated-footer" | "repeated-background" | "tiny-edge-artwork" | "repeated-watermark"
  isMask?: boolean
}

export type ExtractedPdfLayoutBlock = {
  id: string
  pageNumber: number
  order: number
  type: "heading" | "paragraph" | "table"
  text: string
  level?: number
  headers?: string[]
  rows?: string[][]
  sectionHint: SourceImageSectionHint | null
  xRatio: number
  yRatio: number
  widthRatio: number
  heightRatio: number
  fontSize: number
}

export type ExtractedPdfPage = {
  pageNumber: number
  textHtml: string
  imageDataUrl?: string | null
  hasImages?: boolean
  images?: ExtractedPdfImage[]
  layoutBlocks?: ExtractedPdfLayoutBlock[]
  imageExtractionComplete?: boolean
}

export type ExtractedSourceDocument = {
  filename: string
  pageCount: number
  pages: ExtractedPdfPage[]
}

export type PdfImageTemplate = {
  src: string
  caption: string
  sourcePage?: number
  sectionKey?: string
  preferredWidthRatio?: number
  alignment?: "left" | "center" | "right"
  /** Position in the source document flow, from 0 (before the first block) to 1 (after the final block). */
  flowRatio?: number
  /** Source paint order used to keep repeated/similar evidence images stable. */
  sourceOrder?: number
  /** Source vertical position used as a deterministic secondary sort key. */
  sourceYRatio?: number
  /** Images extracted from the source PDF are rendered inside the translated attachment flow. */
  flowTarget?: "section" | "documents" | "gallery"
}

export type PdfSectionTemplate = {
  key: string
  title: string
  html?: string
  table?: {
    headers: string[]
    rows: string[][]
  }
  images?: PdfImageTemplate[]
  imageTitle?: string
  documentsHtml?: string
  documentsTitle?: string
  sourceDocumentHtml?: string
  otherDocumentsHtml?: string
}

export type PreservedSourceLayout = {
  filename: string
  contentHtml: string
  pages: ExtractedPdfPage[]
}

import type { ReportCcRecipient } from "@/lib/report-cc/types"

export type PdfRecipientInfo = {
  id?: string
  name: string
  role?: string | null
  company?: string | null
  email?: string | null
  type?: "internal" | "external"
}

export type LanguagePdfTemplate = {
  language: "en" | "ar"
  direction: "ltr" | "rtl"
  title: string
  badge: string
  projectName: string
  projectReference: string
  stageName: string
  termName: string
  reportNumber: string
  visitNumber: string
  createdAt: string
  creatorName: string
  status: string
  reportType: string
  subject: string
  reportToRecipients: PdfRecipientInfo[]
  ccRecipients: PdfRecipientInfo[]
  rawCcStrings?: string[]
  generatedAt: string | null
  sections: PdfSectionTemplate[]
  sourceLayout?: PreservedSourceLayout | null
}

export type BilingualSourceImage = {
  src: string
  pageNumber: number
  order: number
  sectionKey: SourceImageSectionHint | "source-visuals"
  englishSectionTitle: string
  arabicSectionTitle: string
  englishCaption: string
  arabicCaption: string
}

const SECTION_LABELS: Array<{ key: TranslationSectionKey; en: string; ar: string }> = [
  { key: "feedback", en: "Feedback", ar: "الملاحظات العامة" },
  { key: "observation", en: "Observation", ar: "المعاينة" },
  { key: "findings", en: "Findings", ar: "النتائج" },
  { key: "recommendations", en: "Recommendations", ar: "التوصيات" },
  { key: "correctiveActions", en: "Corrective Actions", ar: "الإجراءات التصحيحية" },
]

const LABELS = {
  en: {
    title: "English Original Document",
    projectInformation: "Project Information",
    reportDetails: "Report Details",
    attachments: "Attachments",
    checklist: "Inspection Checklist",
    approvals: "Approval Information",
    evidence: "Images",
    documents: "Related Documents",
    sourceVisuals: "Original PDF Image Evidence",
    field: "Field",
    value: "Value",
    project: "Project Name",
    projectReference: "Project Reference",
    stage: "Stage",
    term: "Term Name",
    reportNumber: "Report Number",
    visitNumber: "Visit Number",
    reportDate: "Date",
    reportStatus: "Status",
    reportType: "Type",
    subject: "Subject",
    noContent: "No content recorded.",
    noAttachments: "No related attachments.",
    item: "Item",
    state: "Status",
    checked: "Completed",
    unchecked: "Open",
    reviewer: "Reviewer",
    decision: "Decision",
    comments: "Comments",
    date: "Date",
  },
  ar: {
    title: "الترجمة العربية",
    projectInformation: "معلومات المشروع",
    reportDetails: "تفاصيل التقرير",
    attachments: "المرفقات والصور",
    checklist: "قائمة فحص التفتيش",
    approvals: "معلومات الاعتماد",
    evidence: "الصور",
    documents: "المستندات المرتبطة",
    sourceVisuals: "صور الإثبات من ملف PDF الأصلي",
    field: "الحقل",
    value: "القيمة",
    project: "اسم المشروع",
    projectReference: "مرجع المشروع",
    stage: "المرحلة",
    term: "اسم البند",
    reportNumber: "رقم التقرير",
    visitNumber: "رقم الزيارة",
    reportDate: "التاريخ",
    reportStatus: "الحالة",
    reportType: "النوع",
    subject: "الموضوع",
    noContent: "لا يوجد محتوى مسجل.",
    noAttachments: "لا توجد مرفقات مرتبطة.",
    item: "البند",
    state: "الحالة",
    checked: "مكتمل",
    unchecked: "مفتوح",
    reviewer: "المراجع",
    decision: "القرار",
    comments: "التعليقات",
    date: "التاريخ",
  },
} as const

const CAPTION_PATTERNS = {
  en: /^(?:figure|fig\.?|photo|image|plate|photograph)\s*(?:(?:no\.?|number)\s*)?[\d٠-٩]*/i,
  ar: /^(?:الشكل|شكل|الصورة|صورة|اللقطة|لقطة)\s*(?:رقم\s*)?[\d٠-٩]*/i,
} as const

function attachmentImageUrl(data: StageTranslationPageData, path: string, filename: string) {
  const params = new URLSearchParams({
    projectId: data.project.id,
    path,
    filename,
  })
  return `/api/stage-translations/source?${params.toString()}`
}

function projectInformationSection(
  data: StageTranslationPageData,
  content: TranslationReportContent,
  language: "en" | "ar",
): PdfSectionTemplate {
  const labels = LABELS[language]
  return {
    key: "projectInformation",
    title: labels.projectInformation,
    html: "", // Redundant; top 8 cards already contain this information
  }
}

function reportDetailsSection(
  data: StageTranslationPageData,
  content: TranslationReportContent,
  language: "en" | "ar",
): PdfSectionTemplate {
  const labels = LABELS[language]
  return {
    key: "reportDetails",
    title: labels.reportDetails,
    table: {
      headers: [labels.field, labels.value],
      rows: [
        [labels.reportType, content.reportType || data.response.reportType || "—"],
        [labels.subject, content.subject || data.response.subject || labels.noContent],
      ],
    },
  }
}

function checklistSection(content: TranslationReportContent, language: "en" | "ar"): PdfSectionTemplate {
  const labels = LABELS[language]
  if (!content?.checklist || !content.checklist.length) {
    return { key: "checklist", title: labels.checklist, html: "" }
  }
  return {
    key: "checklist",
    title: labels.checklist,
    table: {
      headers: ["#", labels.item, labels.state, language === "ar" ? "الملاحظات" : "Notes"],
      rows: content.checklist.map((item, index) => [
        String(index + 1),
        item.label,
        item.result || (item.checked ? "pass" : "pending"),
        item.notes || "",
      ]),
    },
  }
}

function approvalSection(content: TranslationReportContent, language: "en" | "ar"): PdfSectionTemplate {
  const labels = LABELS[language]
  if (!content?.approvals || !content.approvals.length) {
    return { key: "approvals", title: labels.approvals, html: "" }
  }
  return {
    key: "approvals",
    title: labels.approvals,
    table: {
      headers: [labels.reviewer, labels.decision, labels.comments, labels.date],
      rows: content.approvals.map((item) => [item.reviewerName, item.decision, item.comments, item.decidedAt]),
    },
  }
}

function evidenceImages(data: StageTranslationPageData): PdfImageTemplate[] {
  return data.response.attachments
    .filter((item) => item.attachmentKind === "evidence_image" || item.attachmentKind === "inline_image")
    .map((item) => ({
      src: attachmentImageUrl(data, item.storagePath, item.originalFilename),
      caption: item.originalFilename,
      sectionKey: "attachments",
      preferredWidthRatio: 0.72,
      alignment: "center" as const,
    }))
}

function attachmentDocumentHtml(input: {
  data: StageTranslationPageData
  content: TranslationReportContent
  language: "en" | "ar"
  sourceDocument?: ExtractedSourceDocument | null
  documentId: string
}) {
  const document = input.data.response.attachments.find((item) => item.id === input.documentId)
  if (!document) return ""
  const sourcePdf = sourcePdfAttachment(input.data)
  const extractedEnglish = input.language === "en" && document.id === sourcePdf?.id
    ? sourcePdfEnglishHtml(input.sourceDocument)
    : ""
  const stored = input.content.attachmentTranslations.find((item) => item.attachmentId === document.id)
  const html = extractedEnglish.trim() ? extractedEnglish : stored?.contentHtml || ""
  const body = html.trim() || `<p>${escapeSourceHtml(document.originalFilename)}</p>`
  return `<section data-attachment-id="${escapeSourceHtml(document.id)}"><h3>${escapeSourceHtml(document.originalFilename)}</h3>${body}</section>`
}

function sourceAndOtherDocumentHtml(input: {
  data: StageTranslationPageData
  content: TranslationReportContent
  language: "en" | "ar"
  sourceDocument?: ExtractedSourceDocument | null
}) {
  const documents = input.data.response.attachments.filter((item) => item.attachmentKind === "document")
  const sourcePdf = sourcePdfAttachment(input.data)
  const sourceDocumentHtml = sourcePdf
    ? attachmentDocumentHtml({ ...input, documentId: sourcePdf.id })
    : ""
  const otherDocumentsHtml = documents
    .filter((document) => document.id !== sourcePdf?.id)
    .map((document) => attachmentDocumentHtml({ ...input, documentId: document.id }))
    .join("")
  return { sourceDocumentHtml, otherDocumentsHtml }
}

function attachmentsSection(input: {
  data: StageTranslationPageData
  content: TranslationReportContent
  language: "en" | "ar"
  sourceDocument?: ExtractedSourceDocument | null
}): PdfSectionTemplate {
  const labels = LABELS[input.language]
  const documentHtml = sourceAndOtherDocumentHtml(input)
  return {
    key: "attachments",
    title: labels.attachments,
    imageTitle: labels.evidence,
    images: evidenceImages(input.data),
    documentsTitle: labels.documents,
    documentsHtml: `${documentHtml.sourceDocumentHtml}${documentHtml.otherDocumentsHtml}`,
    sourceDocumentHtml: documentHtml.sourceDocumentHtml,
    otherDocumentsHtml: documentHtml.otherDocumentsHtml,
  }
}

function stripHtmlToLines(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:p|div|h[1-6]|li|figcaption|caption|tr|td|th|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

function captionCandidates(html: string, language: "en" | "ar") {
  if (!html.trim()) return []
  const explicit = Array.from(html.matchAll(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/gi))
    .map((match) => stripHtmlToLines(match[1]).join(" ").trim())
    .filter(Boolean)
  const lines = stripHtmlToLines(html)
  const patterned = lines.filter((line) => CAPTION_PATTERNS[language].test(line))
  return [...explicit, ...patterned].filter((value, index, values) => values.indexOf(value) === index)
}

function isPdfDocument(filename: string, mimeType: string) {
  return mimeType.toLowerCase() === "application/pdf" || filename.toLowerCase().endsWith(".pdf")
}

function sourcePdfTranslationHtml(data: StageTranslationPageData, translation: StageTranslationRecord | null) {
  const source = data.response.attachments
    .filter((item) => item.attachmentKind === "document" && isPdfDocument(item.originalFilename, item.mimeType))
    .sort((left, right) => left.sortOrder - right.sortOrder)[0]
  if (!source || !translation?.translatedContent) return ""
  return translation.translatedContent.attachmentTranslations.find((item) => item.attachmentId === source.id)?.contentHtml ?? ""
}

function sourcePdfAttachment(data: StageTranslationPageData) {
  return data.response.attachments
    .filter((item) => item.attachmentKind === "document" && isPdfDocument(item.originalFilename, item.mimeType))
    .sort((left, right) => left.sortOrder - right.sortOrder)[0] ?? null
}

function sourcePdfEnglishHtml(sourceDocument: ExtractedSourceDocument | null | undefined) {
  return (sourceDocument?.pages ?? [])
    .map((page) => `<section data-source-page="${page.pageNumber}">${page.textHtml}</section>`)
    .join("")
}

function escapeSourceHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function structuredSourceHtml(content: TranslationReportContent, language: "en" | "ar") {
  const labels = LABELS[language]
  const sections = SECTION_LABELS.map((section) =>
    `<h2>${language === "ar" ? section.ar : section.en}</h2>${content.sections[section.key] || ""}`,
  ).join("")
  const checklistRows = content.checklist.map((item, index) =>
    `<tr><td>${index + 1}</td><td>${escapeSourceHtml(item.label)}</td><td>${escapeSourceHtml(item.checked ? labels.checked : labels.unchecked)}</td></tr>`,
  ).join("")
  const approvalRows = content.approvals.map((item) =>
    `<tr><td>${escapeSourceHtml(item.reviewerName)}</td><td>${escapeSourceHtml(item.decision)}</td><td>${escapeSourceHtml(item.comments)}</td><td>${escapeSourceHtml(item.decidedAt)}</td></tr>`,
  ).join("")
  return [
    sections,
    `<h2>${labels.checklist}</h2><table><thead><tr><th>#</th><th>${labels.item}</th><th>${labels.state}</th></tr></thead><tbody>${checklistRows}</tbody></table>`,
    `<h2>${labels.approvals}</h2><table><thead><tr><th>${labels.reviewer}</th><th>${labels.decision}</th><th>${labels.comments}</th><th>${labels.date}</th></tr></thead><tbody>${approvalRows}</tbody></table>`,
  ].join("")
}

function sectionTitles(key: SourceImageSectionHint | "source-visuals") {
  const section = SECTION_LABELS.find((item) => item.key === key)
  if (section) return { en: section.en, ar: section.ar }
  if (key === "checklist") return { en: LABELS.en.checklist, ar: LABELS.ar.checklist }
  if (key === "approvals") return { en: LABELS.en.approvals, ar: LABELS.ar.approvals }
  if (key === "evidence") return { en: LABELS.en.evidence, ar: LABELS.ar.evidence }
  if (key === "documents") return { en: LABELS.en.documents, ar: LABELS.ar.documents }
  return { en: LABELS.en.sourceVisuals, ar: LABELS.ar.sourceVisuals }
}

function flattenSourceImages(sourceDocument: ExtractedSourceDocument | null | undefined) {
  if (!sourceDocument) return []
  return sourceDocument.pages
    .flatMap((page) => page.images ?? [])
    .filter((image) => image.decorative !== true)
    .sort((left, right) => left.pageNumber - right.pageNumber || left.order - right.order)
}

export function buildBilingualSourceImages(input: {
  data: StageTranslationPageData
  translation: StageTranslationRecord | null
  sourceDocument?: ExtractedSourceDocument | null
}): BilingualSourceImage[] {
  const images = flattenSourceImages(input.sourceDocument)
  const translatedCaptions = captionCandidates(sourcePdfTranslationHtml(input.data, input.translation), "ar")
  const extracted: BilingualSourceImage[] = images.map((image, index) => {
    const sectionKey = image.sectionHint ?? "source-visuals"
    const titles = sectionTitles(sectionKey)
    const englishCaption = image.sourceCaption || `Figure ${String(index + 1).padStart(2, "0")} — source PDF page ${image.pageNumber}`
    const arabicCaption = translatedCaptions[index] || `الصورة ${String(index + 1).padStart(2, "0")} — الصفحة ${image.pageNumber} من ملف PDF الأصلي`
    return {
      src: image.dataUrl,
      pageNumber: image.pageNumber,
      order: image.order,
      sectionKey,
      englishSectionTitle: titles.en,
      arabicSectionTitle: titles.ar,
      englishCaption,
      arabicCaption,
    }
  })
  const fallbackPages: BilingualSourceImage[] = (input.sourceDocument?.pages ?? [])
    .filter((page) => page.imageDataUrl && page.imageExtractionComplete === false && !(page.images ?? []).some((image) => image.decorative !== true))
    .map((page) => ({
      src: page.imageDataUrl!,
      pageNumber: page.pageNumber,
      order: 10_000,
      sectionKey: "source-visuals",
      englishSectionTitle: LABELS.en.sourceVisuals,
      arabicSectionTitle: LABELS.ar.sourceVisuals,
      englishCaption: `Source PDF page ${page.pageNumber} — full-page visual fallback preserving images that could not be decoded separately.`,
      arabicCaption: `الصفحة ${page.pageNumber} من ملف PDF الأصلي — نسخة مرئية كاملة للحفاظ على الصور التي تعذر استخراجها بشكل منفصل.`,
    }))
  return [...extracted, ...fallbackPages]
    .sort((left, right) => left.pageNumber - right.pageNumber || left.order - right.order)
}

function addSourcePdfImages(input: {
  data: StageTranslationPageData
  translation: StageTranslationRecord | null
  sourceDocument?: ExtractedSourceDocument | null
  language: "en" | "ar"
  sections: PdfSectionTemplate[]
}) {
  const pairedImages = buildBilingualSourceImages(input)
  const attachments = input.sections.find((section) => section.key === "attachments")
  if (!attachments) return

  const allSourceBlocks = (input.sourceDocument?.pages ?? [])
    .flatMap((page) => page.layoutBlocks ?? [])
    .sort((left, right) => left.pageNumber - right.pageNumber || left.yRatio - right.yRatio || left.xRatio - right.xRatio || left.order - right.order)

  const isBeforeImage = (block: ExtractedPdfLayoutBlock, pageNumber: number, yRatio: number) =>
    block.pageNumber < pageNumber || (block.pageNumber === pageNumber && block.yRatio < yRatio)

  for (const image of pairedImages) {
    const source = input.sourceDocument?.pages
      .find((page) => page.pageNumber === image.pageNumber)
      ?.images?.find((candidate) => candidate.order === image.order)
    const sectionKey = image.sectionKey === "checklist"
      ? "checklist"
      : image.sectionKey === "approvals"
        ? "approvals"
        : SECTION_LABELS.some((section) => section.key === image.sectionKey)
          ? image.sectionKey
          : "attachments"
    const targetSection = input.sections.find((section) => section.key === sectionKey) ?? attachments
    const sectionBlocks = sectionKey === "attachments"
      ? allSourceBlocks
      : allSourceBlocks.filter((block) => block.sectionHint === image.sectionKey)
    const anchorBlocks = sectionBlocks.length ? sectionBlocks : allSourceBlocks
    const beforeCount = anchorBlocks.filter((block) => isBeforeImage(block, image.pageNumber, source?.yRatio ?? 1)).length
    const flowRatio = anchorBlocks.length ? beforeCount / anchorBlocks.length : 1
    const item: PdfImageTemplate = {
      src: image.src,
      caption: input.language === "ar" ? image.arabicCaption : image.englishCaption,
      sourcePage: image.pageNumber,
      sectionKey,
      preferredWidthRatio: Math.max(0.42, Math.min(1, (source?.widthRatio ?? 0.72) * 1.35)),
      alignment: (() => {
        if (!source) return "center" as const
        const center = source.xRatio + source.widthRatio / 2
        return center < 0.4 ? "left" as const : center > 0.6 ? "right" as const : "center" as const
      })(),
      flowRatio,
      sourceOrder: image.order,
      sourceYRatio: source?.yRatio ?? 1,
      flowTarget: sectionKey === "attachments" ? "documents" : "section",
    }
    targetSection.images = [...(targetSection.images ?? []), item]
  }
}

export const PDF_UI_SECTION_KEYS = [
  "projectInformation",
  "reportDetails",
  "checklist",
  "feedback",
  "observation",
  "findings",
  "recommendations",
  "correctiveActions",
  "approvals",
  "attachments",
] as const

export function validateLanguagePdfTemplate(template: LanguagePdfTemplate) {
  const keys = template.sections.map((section) => section.key)
  const missing = PDF_UI_SECTION_KEYS.filter((key) => !keys.includes(key))
  if (missing.length) {
    throw new Error(`PDF document model is incomplete. Missing sections: ${missing.join(", ")}.`)
  }
  if (keys.length !== PDF_UI_SECTION_KEYS.length) {
    throw new Error("PDF document model contains an unexpected number of sections.")
  }
  const hasStructuredContent = template.sections.some((section) =>
    Boolean(section.html?.trim()) ||
    Boolean(section.table && Array.isArray(section.table.rows) && section.table.rows.length > 0) ||
    Boolean(section.images?.length) ||
    Boolean(section.documentsHtml?.trim()),
  )
  if (!hasStructuredContent) throw new Error("The structured report contains no exportable content.")
}

export function buildLanguagePdfTemplate(input: {
  data: StageTranslationPageData
  translation: StageTranslationRecord | null
  language: "en" | "ar"
  sourceDocument?: ExtractedSourceDocument | null
  ccRecipientsList?: ReportCcRecipient[]
  ccRecipients?: string[]
}): LanguagePdfTemplate {
  const { data, translation, language, sourceDocument, ccRecipientsList = [] } = input
  const content = language === "ar"
    ? translation?.translatedContent
    : translation?.originalContent ?? data.response.content
  if (!content) throw new Error("Generate the Arabic translation before exporting the Arabic PDF.")

  const reportToRecipients: PdfRecipientInfo[] = ccRecipientsList.slice(0, 1).map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    company: r.company,
    email: r.email,
    type: r.type,
  }))

  const ccRecipients: PdfRecipientInfo[] = ccRecipientsList.slice(1).map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    company: r.company,
    email: r.email,
    type: r.type,
  }))

  // If raw ccRecipients strings were provided (fallback), parse them
  if (!reportToRecipients.length && !ccRecipients.length && input.ccRecipients?.length) {
    input.ccRecipients.forEach((str, i) => {
      const parts = str.split("\n").map((s) => s.trim()).filter(Boolean)
      const name = parts[0] || "—"
      const details = parts.slice(1).join(" · ")
      const info: PdfRecipientInfo = { name, company: details }
      if (i === 0) reportToRecipients.push(info)
      else ccRecipients.push(info)
    })
  }

  const sections: PdfSectionTemplate[] = [
    projectInformationSection(data, content, language),
    reportDetailsSection(data, content, language),
    checklistSection(content, language),
    ...SECTION_LABELS.map((section) => ({
      key: section.key,
      title: language === "ar" ? section.ar : section.en,
      html: content.sections[section.key],
    })),
    approvalSection(content, language),
    attachmentsSection({ data, content, language, sourceDocument }),
  ]

  if (sourceDocument) addSourcePdfImages({ data, translation, sourceDocument, language, sections })

  return {
    language,
    direction: language === "ar" ? "rtl" : "ltr",
    title: LABELS[language].title,
    badge: language === "ar" ? "AR" : "EN",
    projectName: data.project.name,
    projectReference: data.project.code || "—",
    stageName: content.stageName || data.stage.name,
    termName: content.termName || data.term.name,
    reportNumber: data.response.reportNumber,
    visitNumber: String(data.response.visitNumber),
    createdAt: data.response.createdAt,
    creatorName: data.response.createdBy?.name || "—",
    status: data.response.status,
    reportType: content.reportType || data.response.reportType,
    subject: content.subject || data.response.subject || "—",
    reportToRecipients,
    ccRecipients,
    rawCcStrings: input.ccRecipients ?? [],
    generatedAt: language === "ar" ? translation?.generatedAt ?? null : null,
    sections,
    sourceLayout: null,
  }
}
