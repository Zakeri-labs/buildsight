import type {
  StageTranslationPageData,
  StageTranslationRecord,
  TranslationReportContent,
  TranslationSectionKey,
} from "@/lib/stage-translations/types"

export type PdfKind = "original" | "arabic" | "bilingual"

export type ExtractedPdfPage = {
  pageNumber: number
  textHtml: string
  imageDataUrl?: string | null
  hasImages?: boolean
}

export type ExtractedSourceDocument = {
  filename: string
  pageCount: number
  pages: ExtractedPdfPage[]
}

export type PdfSectionTemplate = {
  key: string
  title: string
  html?: string
  table?: {
    headers: string[]
    rows: string[][]
  }
  images?: Array<{ src: string; caption: string }>
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
  status: string
  reportType: string
  subject: string
  generatedAt: string | null
  sections: PdfSectionTemplate[]
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
    checklist: "Inspection Checklist",
    approvals: "Approval Information",
    evidence: "Image Evidence",
    documents: "Related Documents",
    sourceVisuals: "Original Document Images",
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
    checklist: "قائمة فحص التفتيش",
    approvals: "معلومات الاعتماد",
    evidence: "صور الإثبات",
    documents: "المستندات المرتبطة",
    sourceVisuals: "صور المستند الأصلي",
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

function attachmentImageUrl(data: StageTranslationPageData, path: string, filename: string) {
  const params = new URLSearchParams({
    projectId: data.project.id,
    path,
    filename,
  })
  return `/api/stage-translations/source?${params.toString()}`
}

function checklistSection(content: TranslationReportContent, language: "en" | "ar"): PdfSectionTemplate {
  const labels = LABELS[language]
  return {
    key: "checklist",
    title: labels.checklist,
    table: {
      headers: ["#", labels.item, labels.state],
      rows: content.checklist.map((item, index) => [
        String(index + 1),
        item.notes ? `${item.label}\n${item.notes}` : item.label,
        item.checked ? labels.checked : labels.unchecked,
      ]),
    },
  }
}

function approvalSection(content: TranslationReportContent, language: "en" | "ar"): PdfSectionTemplate {
  const labels = LABELS[language]
  return {
    key: "approvals",
    title: labels.approvals,
    table: {
      headers: [labels.reviewer, labels.decision, labels.comments, labels.date],
      rows: content.approvals.map((item) => [item.reviewerName, item.decision, item.comments, item.decidedAt]),
    },
  }
}

function evidenceSection(data: StageTranslationPageData, language: "en" | "ar"): PdfSectionTemplate {
  const images = data.response.attachments
    .filter((item) => item.attachmentKind === "evidence_image" || item.attachmentKind === "inline_image")
    .map((item) => ({
      src: attachmentImageUrl(data, item.storagePath, item.originalFilename),
      caption: item.originalFilename,
    }))
  return { key: "evidence", title: LABELS[language].evidence, images }
}

function documentsSection(
  data: StageTranslationPageData,
  content: TranslationReportContent,
  language: "en" | "ar",
): PdfSectionTemplate[] {
  const documents = data.response.attachments.filter((item) => item.attachmentKind === "document")
  if (!documents.length) return [{ key: "documents", title: LABELS[language].documents, html: "" }]
  return documents.map((document, index) => {
    const translated = content.attachmentTranslations.find((item) => item.attachmentId === document.id)
    const html = translated?.contentHtml || `<p>${document.originalFilename}</p>`
    return {
      key: `document-${index + 1}`,
      title: index === 0 ? LABELS[language].documents : document.originalFilename,
      html,
    }
  })
}

export function buildLanguagePdfTemplate(input: {
  data: StageTranslationPageData
  translation: StageTranslationRecord | null
  language: "en" | "ar"
  sourceDocument?: ExtractedSourceDocument | null
}): LanguagePdfTemplate {
  const { data, translation, language, sourceDocument } = input
  const content = language === "ar" ? translation?.translatedContent : data.response.content
  if (!content) throw new Error("Generate the Arabic translation before exporting the Arabic PDF.")

  const sections: PdfSectionTemplate[] = SECTION_LABELS.map((section) => ({
    key: section.key,
    title: language === "ar" ? section.ar : section.en,
    html: content.sections[section.key],
  }))
  sections.push(checklistSection(content, language))
  sections.push(approvalSection(content, language))
  sections.push(evidenceSection(data, language))
  sections.push(...documentsSection(data, content, language))

  if (language === "ar" && sourceDocument) {
    const sourceImages = sourceDocument.pages
      .filter((page) => page.imageDataUrl)
      .map((page) => ({
        src: page.imageDataUrl!,
        caption: `الصفحة ${page.pageNumber} / ${sourceDocument.pageCount} — ${sourceDocument.filename}`,
      }))
    if (sourceImages.length) {
      sections.push({ key: "source-visuals", title: LABELS.ar.sourceVisuals, images: sourceImages })
    }
  }

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
    status: data.response.status,
    reportType: content.reportType || data.response.reportType,
    subject: content.subject || data.response.subject || "—",
    generatedAt: language === "ar" ? translation?.generatedAt ?? null : null,
    sections,
  }
}
