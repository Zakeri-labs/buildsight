import { statusLabel } from "@/lib/stages/execution"
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
}

export type ExtractedSourceDocument = {
  filename: string
  pageCount: number
  pages: ExtractedPdfPage[]
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
    project: "Project",
    projectReference: "Project Reference",
    stage: "Stage",
    term: "Term",
    documentNumber: "Document Number",
    visitNumber: "Visit Number",
    date: "Date",
    status: "Status",
    subject: "Subject",
    type: "Type",
    checklist: "Inspection Checklist",
    approvals: "Approval Information",
    evidence: "Image Evidence",
    documents: "Related Documents",
    sourceDocument: "Original Uploaded Document",
    noContent: "No content recorded.",
    checked: "Completed",
    unchecked: "Open",
  },
  ar: {
    title: "الترجمة العربية",
    project: "المشروع",
    projectReference: "مرجع المشروع",
    stage: "المرحلة",
    term: "البند",
    documentNumber: "رقم المستند",
    visitNumber: "رقم الزيارة",
    date: "التاريخ",
    status: "الحالة",
    subject: "الموضوع",
    type: "النوع",
    checklist: "قائمة فحص التفتيش",
    approvals: "معلومات الاعتماد",
    evidence: "صور الإثبات",
    documents: "المستندات المرتبطة",
    sourceDocument: "المستند الأصلي المرفوع",
    noContent: "لا يوجد محتوى مسجل.",
    checked: "مكتمل",
    unchecked: "مفتوح",
  },
} as const

const PDF_CSS = `
  html, body { margin: 0; padding: 0; background: #ffffff; color: #1e293b; }
  body { font-family: Arial, Tahoma, sans-serif; font-size: 12px; line-height: 1.55; }
  * { box-sizing: border-box; }
  .pdf-root { width: 100%; background: #ffffff; color: #1e293b; }
  .top-rule { height: 7px; background: #1d4ed8; }
  .header { padding: 20px 24px 16px; background: #f8fafc; border-bottom: 1px solid #cbd5e1; }
  .header-table, .meta-table, .pair-table, .check-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .header-table td { vertical-align: top; }
  .eyebrow { color: #1d4ed8; font-size: 10px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; }
  h1 { margin: 5px 0 2px; color: #0f172a; font-size: 22px; line-height: 1.25; }
  .subtitle { margin: 0; color: #475569; font-size: 11px; }
  .language-badge { display: inline-block; min-width: 44px; padding: 7px 9px; color: #1e40af; background: #eff6ff; border: 1px solid #bfdbfe; text-align: center; font-size: 10px; font-weight: 700; }
  .meta-table { margin-top: 14px; }
  .meta-table td { width: 25%; padding: 4px; vertical-align: top; }
  .meta-box { min-height: 48px; padding: 7px 8px; background: #ffffff; border: 1px solid #cbd5e1; }
  .meta-label { color: #64748b; font-size: 8px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
  .meta-value { margin-top: 3px; color: #0f172a; font-size: 10px; font-weight: 700; overflow-wrap: anywhere; }
  .content { padding: 18px 24px 24px; }
  .section { margin: 0 0 18px; }
  .section-title { margin: 0 0 9px; padding: 0 0 6px; color: #0f172a; border-bottom: 1px solid #cbd5e1; font-size: 15px; line-height: 1.3; }
  .rich { color: #334155; overflow-wrap: anywhere; }
  .rich p { margin: 0 0 8px; }
  .rich h1, .rich h2, .rich h3, .rich h4 { margin: 12px 0 6px; color: #0f172a; page-break-after: avoid; }
  .rich h1 { font-size: 17px; } .rich h2 { font-size: 15px; } .rich h3 { font-size: 13px; } .rich h4 { font-size: 12px; }
  .rich ul, .rich ol { margin: 0 0 9px; padding-left: 20px; }
  [dir="rtl"] .rich ul, [dir="rtl"] .rich ol { padding-left: 0; padding-right: 20px; }
  .rich li { margin-bottom: 3px; }
  .rich table { width: 100%; margin: 8px 0 12px; border-collapse: collapse; table-layout: fixed; }
  .rich th, .rich td { padding: 6px; border: 1px solid #94a3b8; vertical-align: top; overflow-wrap: anywhere; }
  .rich th { background: #e2e8f0; color: #0f172a; font-weight: 700; }
  .rich img { display: block; max-width: 100%; height: auto; margin: 8px auto; }
  .empty { color: #64748b; font-style: italic; }
  .check-table { border: 1px solid #cbd5e1; }
  .check-table th, .check-table td { padding: 7px; border: 1px solid #cbd5e1; vertical-align: top; }
  .check-table th { background: #e2e8f0; color: #0f172a; font-size: 9px; }
  .status-ok { color: #166534; font-weight: 700; }
  .status-open { color: #92400e; font-weight: 700; }
  .approval { margin-bottom: 8px; padding: 8px; border: 1px solid #cbd5e1; page-break-inside: avoid; }
  .approval-name { color: #0f172a; font-weight: 700; }
  .approval-meta { color: #64748b; font-size: 9px; }
  .approval-comment { margin-top: 6px; padding: 7px; background: #f8fafc; }
  .evidence-grid { width: 100%; border-collapse: separate; border-spacing: 6px; table-layout: fixed; }
  .evidence-grid td { width: 33.333%; padding: 0; vertical-align: top; border: 1px solid #cbd5e1; page-break-inside: avoid; }
  .evidence-grid img { display: block; width: 100%; height: auto; }
  .caption { padding: 5px; color: #475569; font-size: 8px; overflow-wrap: anywhere; }
  .document-box { margin-bottom: 8px; padding: 8px; border: 1px solid #cbd5e1; page-break-inside: avoid; }
  .document-name { color: #1d4ed8; font-weight: 700; overflow-wrap: anywhere; }
  .source-page { margin: 0 0 14px; padding: 8px; border: 1px solid #cbd5e1; page-break-inside: avoid; }
  .source-page-label { margin-bottom: 6px; color: #475569; font-size: 9px; font-weight: 700; }
  .source-page img { display: block; width: 100%; height: auto; border: 1px solid #e2e8f0; }
  .pair-table { margin-bottom: 13px; border: 1px solid #94a3b8; }
  .pair-table th, .pair-table td { width: 50%; padding: 9px; border: 1px solid #cbd5e1; vertical-align: top; overflow-wrap: anywhere; }
  .pair-table th { background: #e2e8f0; color: #0f172a; font-size: 12px; }
  .pair-table .english { direction: ltr; text-align: left; }
  .pair-table .arabic { direction: rtl; text-align: right; font-family: Tahoma, Arial, sans-serif; }
  .footer { padding: 8px 24px; color: #64748b; background: #f8fafc; border-top: 1px solid #cbd5e1; text-align: center; font-size: 8px; }
  .no-break, table, tr, figure, img, .meta-box { page-break-inside: avoid; break-inside: avoid; }
  .page-break { page-break-before: always; break-before: page; }
`

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function safeText(value: unknown, fallback = "—") {
  const normalized = String(value ?? "").trim()
  return escapeHtml(normalized || fallback)
}

export function sanitizePdfHtml(value: string, projectId?: string) {
  let safe = value
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link|base)[\s\S]*?>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link|base)\b[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:((['"])[\s\S]*?\2)|[^\s>]+)/gi, "")
    .replace(/\s(?:class|id|style)\s*=\s*(?:((['"])[\s\S]*?\2)|[^\s>]+)/gi, "")
    .replace(/(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi, "")
    .replace(/\b(?:lab|lch|oklab|oklch|color-mix|light-dark|var)\s*\([^)]*\)/gi, "#000000")

  if (projectId) {
    safe = safe.replace(/(["'])\/api\/stage-evidence\?([^"']+)\1/gi, (match, quote: string, query: string) => {
      const sourceParams = new URLSearchParams(query.replaceAll("&amp;", "&"))
      const path = sourceParams.get("path")
      if (!path) return match
      const proxyParams = new URLSearchParams({
        projectId,
        path,
        filename: sourceParams.get("filename") || "inline-image",
      })
      return `${quote}/api/stage-translations/source?${proxyParams.toString()}${quote}`
    })
  }
  return safe
}

function formatDate(value: string, language: "en" | "ar", includeTime = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(language === "ar" ? "ar" : "en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date)
}

function richHtml(html: string, empty: string, projectId?: string) {
  const safe = sanitizePdfHtml(html, projectId).trim()
  return safe ? `<div class="rich">${safe}</div>` : `<p class="empty">${escapeHtml(empty)}</p>`
}

function metaCell(label: string, value: string) {
  return `<td><div class="meta-box"><div class="meta-label">${escapeHtml(label)}</div><div class="meta-value">${safeText(value)}</div></div></td>`
}

function metaTable(data: StageTranslationPageData, content: TranslationReportContent, language: "en" | "ar") {
  const labels = LABELS[language]
  const values = [
    [labels.project, data.project.name],
    [labels.projectReference, data.project.code || "—"],
    [labels.stage, content.stageName || data.stage.name],
    [labels.term, content.termName || data.term.name],
    [labels.documentNumber, data.response.reportNumber],
    [labels.visitNumber, String(data.response.visitNumber)],
    [labels.date, formatDate(data.response.createdAt, language)],
    [labels.status, statusLabel(data.response.status as never, language)],
    [labels.type, content.reportType || "—"],
    [labels.subject, content.subject || "—"],
  ]
  const rows: string[] = []
  for (let index = 0; index < values.length; index += 4) {
    rows.push(`<tr>${values.slice(index, index + 4).map(([label, value]) => metaCell(label, value)).join("")}${"<td></td>".repeat(Math.max(0, 4 - values.slice(index, index + 4).length))}</tr>`)
  }
  return `<table class="meta-table"><tbody>${rows.join("")}</tbody></table>`
}

function reportHeader(
  data: StageTranslationPageData,
  content: TranslationReportContent,
  language: "en" | "ar",
  generatedAt: string | null,
  bilingual = false,
) {
  const title = bilingual ? "Bilingual Construction Document · مستند إنشائي ثنائي اللغة" : LABELS[language].title
  const badge = bilingual ? "EN / AR" : language.toUpperCase()
  const direction = language === "ar" ? "rtl" : "ltr"
  return `
    <div class="top-rule"></div>
    <header class="header no-break" dir="${direction}">
      <table class="header-table"><tbody><tr>
        <td>
          <div class="eyebrow">${escapeHtml(title)}</div>
          <h1>${safeText(content.reportTitle || data.response.reportTitle)}</h1>
          <p class="subtitle">${safeText(content.termName || data.term.name)}</p>
        </td>
        <td style="width:70px;text-align:${language === "ar" ? "left" : "right"}"><span class="language-badge">${escapeHtml(badge)}</span></td>
      </tr></tbody></table>
      ${metaTable(data, content, language)}
      ${generatedAt ? `<p class="subtitle" style="margin-top:8px">${language === "ar" ? "تاريخ إنشاء الترجمة" : "Translation generated"}: ${escapeHtml(formatDate(generatedAt, language, true))}</p>` : ""}
    </header>`
}

function checklist(content: TranslationReportContent, language: "en" | "ar") {
  const labels = LABELS[language]
  if (!content.checklist.length) return `<p class="empty">${escapeHtml(labels.noContent)}</p>`
  return `<table class="check-table"><thead><tr><th style="width:7%">#</th><th>${language === "ar" ? "البند" : "Item"}</th><th style="width:20%">${language === "ar" ? "الحالة" : "Status"}</th></tr></thead><tbody>${content.checklist.map((item, index) => `
    <tr><td>${index + 1}</td><td><strong>${safeText(item.label, "")}</strong>${item.notes ? `<div>${safeText(item.notes, "")}</div>` : ""}</td><td class="${item.checked ? "status-ok" : "status-open"}">${item.checked ? labels.checked : labels.unchecked}</td></tr>`).join("")}</tbody></table>`
}

function approvals(content: TranslationReportContent, language: "en" | "ar") {
  if (!content.approvals.length) return `<p class="empty">${language === "ar" ? "لا توجد قرارات اعتماد مسجلة." : "No approval decisions recorded."}</p>`
  return content.approvals.map((approval) => `<div class="approval"><div class="approval-name">${safeText(approval.reviewerName)}</div><div class="approval-meta">${safeText(approval.decision)} · ${escapeHtml(formatDate(approval.decidedAt, language, true))}</div>${approval.comments ? `<div class="approval-comment">${safeText(approval.comments, "")}</div>` : ""}</div>`).join("")
}

function evidenceRows(data: StageTranslationPageData) {
  const images = data.response.attachments.filter((item) => item.attachmentKind === "evidence_image" || item.attachmentKind === "inline_image")
  if (!images.length) return ""
  const cells = images.map((image) => {
    const params = new URLSearchParams({
      projectId: data.project.id,
      path: image.storagePath,
      filename: image.originalFilename,
    })
    return `<td><img src="/api/stage-translations/source?${params.toString()}" alt="${escapeHtml(image.originalFilename)}"><div class="caption">${escapeHtml(image.originalFilename)}</div></td>`
  })
  const rows: string[] = []
  for (let index = 0; index < cells.length; index += 3) rows.push(`<tr>${cells.slice(index, index + 3).join("")}${"<td></td>".repeat(Math.max(0, 3 - cells.slice(index, index + 3).length))}</tr>`)
  return `<table class="evidence-grid"><tbody>${rows.join("")}</tbody></table>`
}

function documents(data: StageTranslationPageData, content: TranslationReportContent, language: "en" | "ar") {
  const docs = data.response.attachments.filter((item) => item.attachmentKind === "document")
  if (!docs.length) return `<p class="empty">${language === "ar" ? "لا توجد مرفقات مرتبطة." : "No related attachments."}</p>`
  return docs.map((document) => {
    const translated = content.attachmentTranslations.find((item) => item.attachmentId === document.id)
    return `<div class="document-box"><div class="document-name">${escapeHtml(document.originalFilename)}</div>${translated?.contentHtml ? `<div style="margin-top:8px">${richHtml(translated.contentHtml, LABELS[language].noContent, data.project.id)}</div>` : ""}</div>`
  }).join("")
}

function languageBody(data: StageTranslationPageData, content: TranslationReportContent, language: "en" | "ar", source?: ExtractedSourceDocument | null) {
  const labels = LABELS[language]
  const sections = SECTION_LABELS.map((section) => `<section class="section"><h2 class="section-title">${escapeHtml(language === "ar" ? section.ar : section.en)}</h2>${richHtml(content.sections[section.key], labels.noContent, data.project.id)}</section>`).join("")
  const sourcePages = language === "en" && source ? `<section class="section page-break"><h2 class="section-title">${escapeHtml(labels.sourceDocument)} · ${escapeHtml(source.filename)}</h2>${source.pages.map((page) => `<div class="source-page"><div class="source-page-label">Page ${page.pageNumber} / ${source.pageCount}</div>${page.imageDataUrl ? `<img src="${page.imageDataUrl}" alt="Page ${page.pageNumber}">` : richHtml(page.textHtml, labels.noContent, data.project.id)}</div>`).join("")}</section>` : ""
  return `${sections}
    <section class="section"><h2 class="section-title">${escapeHtml(labels.checklist)}</h2>${checklist(content, language)}</section>
    <section class="section"><h2 class="section-title">${escapeHtml(labels.approvals)}</h2>${approvals(content, language)}</section>
    <section class="section"><h2 class="section-title">${escapeHtml(labels.evidence)}</h2>${evidenceRows(data) || `<p class="empty">${language === "ar" ? "لا توجد صور إثبات." : "No image evidence."}</p>`}</section>
    <section class="section"><h2 class="section-title">${escapeHtml(labels.documents)}</h2>${documents(data, content, language)}</section>
    ${sourcePages}`
}

function pair(titleEn: string, titleAr: string, english: string, arabic: string) {
  return `<table class="pair-table"><thead><tr><th class="english">${escapeHtml(titleEn)}</th><th class="arabic">${escapeHtml(titleAr)}</th></tr></thead><tbody><tr><td class="english">${english}</td><td class="arabic">${arabic}</td></tr></tbody></table>`
}

function splitHtmlBlocks(html: string, count: number, projectId?: string) {
  if (count <= 1) return [sanitizePdfHtml(html)]
  const safe = sanitizePdfHtml(html, projectId)
  const blocks = safe.match(/<(?:h[1-6]|p|ul|ol|table|blockquote|div)\b[^>]*>[\s\S]*?<\/(?:h[1-6]|p|ul|ol|table|blockquote|div)>/gi) ?? [safe]
  const totalLength = Math.max(1, blocks.reduce((sum, block) => sum + block.length, 0))
  const target = totalLength / count
  const chunks: string[] = []
  let current = ""
  for (const block of blocks) {
    if (chunks.length < count - 1 && current && current.length + block.length > target) {
      chunks.push(current)
      current = ""
    }
    current += block
  }
  chunks.push(current)
  while (chunks.length < count) chunks.push("")
  return chunks.slice(0, count)
}

function sourcePairs(source: ExtractedSourceDocument | null | undefined, translated: TranslationReportContent, projectId: string) {
  if (!source?.pages.length) return ""
  const attachmentHtml = translated.attachmentTranslations.find((item) => item.filename === source.filename)?.contentHtml
    ?? translated.attachmentTranslations[0]?.contentHtml
    ?? ""
  const chunks = splitHtmlBlocks(attachmentHtml, source.pages.length, projectId)
  return `<div class="page-break"></div>${source.pages.map((page, index) => pair(
    `Original PDF · Page ${page.pageNumber}`,
    `المستند الأصلي · الصفحة ${page.pageNumber}`,
    `${page.imageDataUrl ? `<div class="source-page"><img src="${page.imageDataUrl}" alt="Page ${page.pageNumber}"></div>` : ""}${richHtml(page.textHtml, LABELS.en.noContent, projectId)}`,
    richHtml(chunks[index] || "", LABELS.ar.noContent, projectId),
  )).join("")}`
}

function bilingualBody(data: StageTranslationPageData, translated: TranslationReportContent, source?: ExtractedSourceDocument | null) {
  const original = data.response.content
  const infoEn = `<div class="rich"><p><strong>Stage:</strong> ${safeText(original.stageName)}</p><p><strong>Term:</strong> ${safeText(original.termName)}</p><p><strong>Type:</strong> ${safeText(original.reportType)}</p><p><strong>Subject:</strong> ${safeText(original.subject)}</p></div>`
  const infoAr = `<div class="rich"><p><strong>المرحلة:</strong> ${safeText(translated.stageName)}</p><p><strong>البند:</strong> ${safeText(translated.termName)}</p><p><strong>النوع:</strong> ${safeText(translated.reportType)}</p><p><strong>الموضوع:</strong> ${safeText(translated.subject)}</p></div>`
  return `${pair("Document Information", "معلومات المستند", infoEn, infoAr)}
    ${SECTION_LABELS.map((section) => pair(section.en, section.ar, richHtml(original.sections[section.key], LABELS.en.noContent, data.project.id), richHtml(translated.sections[section.key], LABELS.ar.noContent, data.project.id))).join("")}
    ${pair(LABELS.en.checklist, LABELS.ar.checklist, checklist(original, "en"), checklist(translated, "ar"))}
    ${pair(LABELS.en.approvals, LABELS.ar.approvals, approvals(original, "en"), approvals(translated, "ar"))}
    ${pair(LABELS.en.evidence, LABELS.ar.evidence, evidenceRows(data) || `<p class="empty">No image evidence.</p>`, evidenceRows(data) || `<p class="empty">لا توجد صور إثبات.</p>`)}
    ${pair(LABELS.en.documents, LABELS.ar.documents, documents(data, original, "en"), documents(data, translated, "ar"))}
    ${sourcePairs(source, translated, data.project.id)}`
}

export function buildTranslationPdfDocument(input: {
  kind: PdfKind
  data: StageTranslationPageData
  translation: StageTranslationRecord | null
  sourceDocument?: ExtractedSourceDocument | null
}) {
  const { kind, data, translation, sourceDocument } = input
  const translated = translation?.translatedContent ?? null
  if (kind !== "original" && !translated) throw new Error("Generate the Arabic translation before exporting PDFs.")
  const bilingual = kind === "bilingual"
  const language = kind === "arabic" ? "ar" : "en"
  const content: TranslationReportContent = kind === "arabic" ? translated! : data.response.content
  const body = bilingual
    ? bilingualBody(data, translated!, sourceDocument)
    : languageBody(data, content, language, sourceDocument)
  const header = reportHeader(data, bilingual ? data.response.content : content, language, translation?.generatedAt ?? null, bilingual)
  const footer = `<footer class="footer">${escapeHtml(data.project.name)} · ${escapeHtml(data.response.reportNumber)} · ${bilingual ? "English / العربية" : escapeHtml(LABELS[language].title)}</footer>`
  const direction = language === "ar" && !bilingual ? "rtl" : "ltr"
  return `<!doctype html><html lang="${bilingual ? "en" : language}" dir="${direction}"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>${PDF_CSS}</style></head><body><main id="pdf-root" class="pdf-root">${header}<div class="content">${body}</div>${footer}</main></body></html>`
}
