import type {
  StageTranslationPageData,
  StageTranslationRecord,
  TranslationReportContent,
  TranslationSectionKey,
} from "@/lib/stage-translations/types"

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
}

export type PreservedSourceLayout = {
  filename: string
  contentHtml: string
  pages: ExtractedPdfPage[]
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
    checklist: "Inspection Checklist",
    approvals: "Approval Information",
    evidence: "Image Evidence",
    documents: "Related Documents",
    sourceVisuals: "Original PDF Image Evidence",
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
    sourceVisuals: "صور الإثبات من ملف PDF الأصلي",
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
      sectionKey: "evidence",
      preferredWidthRatio: 0.72,
      alignment: "center" as const,
    }))
  return { key: "evidence", title: LABELS[language].evidence, images }
}

function documentsSection(
  data: StageTranslationPageData,
  content: TranslationReportContent,
  language: "en" | "ar",
  skipAttachmentId?: string | null,
): PdfSectionTemplate[] {
  const documents = data.response.attachments.filter((item) =>
    item.attachmentKind === "document" && item.id !== skipAttachmentId,
  )
  if (!documents.length) return [{ key: "documents", title: LABELS[language].documents, html: "" }]
  return documents.map((document, index) => {
    const translated = content.attachmentTranslations.find((item) => item.attachmentId === document.id)
    const html = translated?.contentHtml || `<p>${document.originalFilename}</p>`
    return {
      key: index === 0 ? "documents" : `document-${index + 1}`,
      title: index === 0 ? LABELS[language].documents : document.originalFilename,
      html,
    }
  })
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
    .filter((page) => page.imageDataUrl && page.imageExtractionComplete === false)
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
  for (const image of pairedImages) {
    const sectionKey = image.sectionKey
    const existing = input.sections.find((section) => section.key === sectionKey)
    const item: PdfImageTemplate = {
      src: image.src,
      caption: input.language === "ar" ? image.arabicCaption : image.englishCaption,
      sourcePage: image.pageNumber,
      sectionKey,
      preferredWidthRatio: Math.max(0.42, Math.min(1, (input.sourceDocument?.pages.find((page) => page.pageNumber === image.pageNumber)?.images?.find((source) => source.order === image.order)?.widthRatio ?? 0.72) * 1.35)),
      alignment: (() => {
        const source = input.sourceDocument?.pages.find((page) => page.pageNumber === image.pageNumber)?.images?.find((candidate) => candidate.order === image.order)
        if (!source) return "center" as const
        const center = source.xRatio + source.widthRatio / 2
        return center < 0.4 ? "left" as const : center > 0.6 ? "right" as const : "center" as const
      })(),
    }
    if (existing) {
      existing.images = [...(existing.images ?? []), item]
    } else {
      const title = input.language === "ar" ? image.arabicSectionTitle : image.englishSectionTitle
      input.sections.push({ key: sectionKey, title, images: [item] })
    }
  }
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

  const sourcePdf = sourcePdfAttachment(data)
  const sourceLayoutHtml = language === "ar"
    ? sourcePdfTranslationHtml(data, translation) || structuredSourceHtml(content, language)
    : sourcePdfEnglishHtml(sourceDocument)
  const sourceLayout = sourceDocument && sourcePdf && sourceLayoutHtml.trim()
    ? { filename: sourcePdf.originalFilename, contentHtml: sourceLayoutHtml, pages: sourceDocument.pages }
    : null

  const sections: PdfSectionTemplate[] = SECTION_LABELS.map((section) => ({
    key: section.key,
    title: language === "ar" ? section.ar : section.en,
    html: content.sections[section.key],
  }))
  sections.push(checklistSection(content, language))
  sections.push(approvalSection(content, language))
  sections.push(evidenceSection(data, language))
  sections.push(...documentsSection(data, content, language, sourceLayout ? sourcePdf?.id : null))

  if (sourceDocument && !sourceLayout) {
    addSourcePdfImages({ data, translation, sourceDocument, language, sections })
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
    sourceLayout,
  }
}
