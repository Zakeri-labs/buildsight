import "server-only"

import { assertProjectMember, audit } from "@/lib/auth/guards"
import { loadStageTranslationPageData } from "@/lib/stage-translations/data"
import type {
  AttachmentTranslation,
  TranslationApprovalItem,
  TranslationChecklistItem,
  TranslationReportContent,
  TranslationSectionKey,
} from "@/lib/stage-translations/types"
import { sanitizeReportHtml } from "@/lib/stages/execution"
import { createAdminClient } from "@/lib/supabase/admin"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const OPENAI_MODEL = process.env.OPENAI_TRANSLATION_MODEL?.trim() || "gpt-5.6"
const SIGNED_URL_TTL_SECONDS = 20 * 60
const TRANSLATION_BUCKET = "project-stage-translations"
const STAGE_EVIDENCE_BUCKET = "project-stage-evidence"
const MAX_READABLE_ATTACHMENTS = 8

const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set([
  "pdf", "txt", "md", "json", "html", "xml", "doc", "docx", "rtf", "odt",
  "ppt", "pptx", "csv", "xls", "xlsx", "tsv",
])

const MEDIA_TOKEN_PATTERN = /^\[\[\[BUILDSIGHT_[A-Z0-9_]+_MEDIA_\d+\]\]\]$/

type OpenAiContentItem =
  | { type: "input_text"; text: string }
  | { type: "input_file"; file_url: string }

type MediaPlaceholder = { token: string; html: string }
type TextSegment = { id: string; text: string }
type HtmlTranslationTemplate = { templateHtml: string; segments: TextSegment[] }

type RawTranslation = {
  stageName: string
  termName: string
  reportTitle: string
  subject: string
  reportType: string
  sections: Record<TranslationSectionKey, TextSegment[]>
  checklist: TranslationChecklistItem[]
  approvals: TranslationApprovalItem[]
  attachmentTranslations: AttachmentTranslation[]
}

function extension(name: string) {
  return name.toLowerCase().split(".").pop() ?? ""
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, max = 250_000) {
  return typeof value === "string" ? value.slice(0, max) : ""
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function decodeHtmlText(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
}

function outputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim()
  const values: string[] = []
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if ((content?.type === "output_text" || content?.type === "text") && typeof content.text === "string") {
        values.push(content.text)
      }
    }
  }
  return values.join("\n").trim()
}

function protectInlineMedia(html: string, prefix: string) {
  const media: MediaPlaceholder[] = []
  const protectedHtml = html.replace(/<img\b[^>]*>/gi, (match) => {
    const token = `[[[BUILDSIGHT_${prefix.toUpperCase()}_MEDIA_${String(media.length + 1).padStart(3, "0")}]]]`
    media.push({ token, html: match })
    return token
  })
  return { protectedHtml, media }
}

function restoreInlineMedia(html: string, media: MediaPlaceholder[]) {
  let result = html
  const missing: string[] = []
  for (const item of media) {
    if (result.includes(item.token)) {
      result = result.replace(item.token, item.html).replaceAll(item.token, "")
    } else {
      missing.push(item.html)
    }
  }
  if (missing.length) result += missing.join("")
  return result
}

function createHtmlTranslationTemplate(html: string, prefix: string): HtmlTranslationTemplate {
  const segments: TextSegment[] = []
  const parts = html.split(/(<[^>]+>)/g)
  const templateHtml = parts.map((part) => {
    if (!part || part.startsWith("<")) return part
    return part.split(/(\[\[\[BUILDSIGHT_[A-Z0-9_]+_MEDIA_\d+\]\]\])/g).map((piece) => {
      if (!piece || MEDIA_TOKEN_PATTERN.test(piece.trim())) return piece
      const match = piece.match(/^(\s*)([\s\S]*?)(\s*)$/)
      const leading = match?.[1] ?? ""
      const core = match?.[2] ?? piece
      const trailing = match?.[3] ?? ""
      if (!core.trim()) return piece
      const id = `${prefix}_TEXT_${String(segments.length + 1).padStart(4, "0")}`
      segments.push({ id, text: decodeHtmlText(core.trim()) })
      return `${leading}[[[${id}]]]${trailing}`
    }).join("")
  }).join("")
  return { templateHtml, segments }
}

function restoreTranslatedTemplate(template: HtmlTranslationTemplate, translatedSegments: TextSegment[]) {
  const translated = new Map(translatedSegments.map((segment) => [segment.id, segment.text]))
  let html = template.templateHtml
  for (const source of template.segments) {
    const value = translated.get(source.id)?.trim() || source.text
    html = html.replaceAll(`[[[${source.id}]]]`, escapeHtml(value))
  }
  return sanitizeReportHtml(html)
}

function translationSchema() {
  const stringField = { type: "string" }
  const segmentArray = {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["id", "text"],
      properties: { id: stringField, text: stringField },
    },
  }
  return {
    type: "object",
    additionalProperties: false,
    required: ["stageName", "termName", "reportTitle", "subject", "reportType", "sections", "checklist", "approvals", "attachmentTranslations"],
    properties: {
      stageName: stringField,
      termName: stringField,
      reportTitle: stringField,
      subject: stringField,
      reportType: stringField,
      sections: {
        type: "object",
        additionalProperties: false,
        required: ["feedback", "observation", "findings", "recommendations", "correctiveActions"],
        properties: {
          feedback: segmentArray,
          observation: segmentArray,
          findings: segmentArray,
          recommendations: segmentArray,
          correctiveActions: segmentArray,
        },
      },
      checklist: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label", "checked", "notes"],
          properties: {
            id: stringField,
            label: stringField,
            checked: { type: "boolean" },
            notes: stringField,
          },
        },
      },
      approvals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "reviewerName", "decision", "comments", "decidedAt"],
          properties: {
            id: stringField,
            reviewerName: stringField,
            decision: stringField,
            comments: stringField,
            decidedAt: stringField,
          },
        },
      },
      attachmentTranslations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["attachmentId", "filename", "contentHtml"],
          properties: {
            attachmentId: stringField,
            filename: stringField,
            contentHtml: stringField,
          },
        },
      },
    },
  }
}

function parseSegments(value: unknown): TextSegment[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 5000).map((item) => {
    const row = objectValue(item)
    return { id: stringValue(row.id, 120), text: stringValue(row.text, 20_000) }
  }).filter((item) => item.id)
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
  return value.slice(0, MAX_READABLE_ATTACHMENTS).map((item) => {
    const row = objectValue(item)
    return {
      attachmentId: stringValue(row.attachmentId, 100),
      filename: stringValue(row.filename, 1_000),
      contentHtml: sanitizeReportHtml(stringValue(row.contentHtml)),
    }
  }).filter((item) => item.attachmentId || item.filename || item.contentHtml)
}

function parseRawTranslation(value: unknown): RawTranslation | null {
  const row = objectValue(value)
  if (!Object.keys(row).length) return null
  const sections = objectValue(row.sections)
  return {
    stageName: stringValue(row.stageName, 2_000),
    termName: stringValue(row.termName, 2_000),
    reportTitle: stringValue(row.reportTitle, 2_000),
    subject: stringValue(row.subject, 4_000),
    reportType: stringValue(row.reportType, 1_000),
    sections: {
      feedback: parseSegments(sections.feedback),
      observation: parseSegments(sections.observation),
      findings: parseSegments(sections.findings),
      recommendations: parseSegments(sections.recommendations),
      correctiveActions: parseSegments(sections.correctiveActions),
    },
    checklist: parseChecklist(row.checklist),
    approvals: parseApprovals(row.approvals),
    attachmentTranslations: parseAttachmentTranslations(row.attachmentTranslations),
  }
}

function normalizeTranslation(
  value: unknown,
  original: TranslationReportContent,
  templatesBySection: Record<TranslationSectionKey, HtmlTranslationTemplate>,
  mediaBySection: Record<TranslationSectionKey, MediaPlaceholder[]>,
  readableAttachments: Array<{ id: string; filename: string }>,
): TranslationReportContent {
  const parsed = parseRawTranslation(value)
  if (!parsed) throw new Error("The AI service returned an invalid translation.")

  const sections = {} as Record<TranslationSectionKey, string>
  for (const key of Object.keys(original.sections) as TranslationSectionKey[]) {
    const structuredHtml = restoreTranslatedTemplate(templatesBySection[key], parsed.sections[key])
    sections[key] = sanitizeReportHtml(restoreInlineMedia(structuredHtml, mediaBySection[key]))
  }

  const checklist = original.checklist.map((source, index) => {
    const translated = parsed.checklist.find((item) => item.id === source.id) ?? parsed.checklist[index]
    return {
      id: source.id,
      label: translated?.label?.trim() || source.label,
      checked: source.checked,
      notes: translated?.notes?.trim() || "",
    }
  })

  const approvals = original.approvals.map((source, index) => {
    const translated = parsed.approvals.find((item) => item.id === source.id) ?? parsed.approvals[index]
    return {
      id: source.id,
      reviewerName: source.reviewerName,
      decision: translated?.decision?.trim() || source.decision,
      comments: translated?.comments?.trim() || "",
      decidedAt: source.decidedAt,
    }
  })

  const allowedAttachments = new Map(readableAttachments.map((item) => [item.id, item.filename]))
  const attachmentTranslations = parsed.attachmentTranslations
    .filter((item) => allowedAttachments.has(item.attachmentId))
    .map((item) => ({
      attachmentId: item.attachmentId,
      filename: allowedAttachments.get(item.attachmentId)!,
      contentHtml: sanitizeReportHtml(item.contentHtml),
    }))

  return {
    stageName: parsed.stageName.trim() || original.stageName,
    termName: parsed.termName.trim() || original.termName,
    reportTitle: parsed.reportTitle.trim() || original.reportTitle,
    subject: parsed.subject.trim(),
    reportType: parsed.reportType.trim() || original.reportType,
    sections,
    checklist,
    approvals,
    attachmentTranslations,
  }
}

async function createSignedUrl(path: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(STAGE_EVIDENCE_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export async function generateStageTranslation(input: {
  projectId: string
  stageId: string
  termId?: string | null
  responseId: string
}) {
  const userId = await assertProjectMember(input.projectId)
  const pageData = await loadStageTranslationPageData(input.projectId, input.stageId, userId, input.responseId, input.termId)
  if (!pageData) throw new Error("Save the inspection report before generating a translation.")

  const admin = createAdminClient()
  const { data: activeStage, error: stageError } = await admin
    .from("project_stages")
    .select("id")
    .eq("id", input.stageId)
    .eq("project_id", input.projectId)
    .neq("status", "disabled")
    .maybeSingle()

  if (stageError) throw stageError
  if (!activeStage) throw new Error("This stage is inactive and cannot accept new translations.")

  let realTermId: string | null = null
  if (input.termId && input.termId !== input.stageId) {
    const { data: activeTerm } = await admin
      .from("project_stage_terms")
      .select("id, parent_term_id")
      .eq("id", input.termId)
      .eq("project_stage_id", input.stageId)
      .eq("is_active", true)
      .maybeSingle()
    if (activeTerm) {
      realTermId = activeTerm.id
      if (activeTerm.parent_term_id) {
        const { data: activeParent } = await admin
          .from("project_stage_terms")
          .select("id")
          .eq("id", activeTerm.parent_term_id)
          .eq("project_stage_id", input.stageId)
          .eq("is_active", true)
          .maybeSingle()
        if (!activeParent) throw new Error("This parent Term is inactive and cannot accept new translations.")
      }
    }
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error("Document Translation is not configured. Add OPENAI_API_KEY to the server environment.")

  const original = pageData.response.content
  const mediaBySection = {} as Record<TranslationSectionKey, MediaPlaceholder[]>
  const templatesBySection = {} as Record<TranslationSectionKey, HtmlTranslationTemplate>
  const structuredSections = {} as Record<TranslationSectionKey, HtmlTranslationTemplate>
  for (const key of Object.keys(original.sections) as TranslationSectionKey[]) {
    const protectedValue = protectInlineMedia(original.sections[key], key)
    mediaBySection[key] = protectedValue.media
    const template = createHtmlTranslationTemplate(protectedValue.protectedHtml, key.toUpperCase())
    templatesBySection[key] = template
    structuredSections[key] = template
  }

  const content: OpenAiContentItem[] = []
  const documentAttachments = pageData.response.attachments
    .filter((item) => item.attachmentKind === "document" && SUPPORTED_ATTACHMENT_EXTENSIONS.has(extension(item.originalFilename)))
    .slice(0, MAX_READABLE_ATTACHMENTS)
  const readableAttachmentInputs: Array<{ id: string; filename: string; url: string }> = []
  for (const attachment of documentAttachments) {
    const url = await createSignedUrl(attachment.storagePath)
    if (url) readableAttachmentInputs.push({ id: attachment.id, filename: attachment.originalFilename, url })
  }
  const readableAttachments = readableAttachmentInputs.map(({ id, filename }) => ({ id, filename }))

  const sourceDocument = {
    project: pageData.project.name,
    projectReference: pageData.project.code ?? "",
    stage: pageData.stage.name,
    term: pageData.term.name,
    documentNumber: pageData.response.reportNumber,
    visitNumber: pageData.response.visitNumber,
    date: pageData.response.createdAt,
    status: pageData.response.status,
    stageName: original.stageName,
    termName: original.termName,
    reportTitle: original.reportTitle,
    subject: original.subject,
    reportType: original.reportType,
    sections: structuredSections,
    checklist: original.checklist,
    approvals: original.approvals,
    evidenceImages: pageData.response.attachments
      .filter((item) => item.attachmentKind !== "document")
      .map((item) => ({ id: item.id, filename: item.originalFilename })),
    readableAttachments,
  }

  content.push({
    type: "input_text",
    text: [
      "Translate the complete construction inspection document from English into professional Arabic.",
      "This is translation only: do not summarize, shorten, omit, reinterpret, add, or invent any information.",
      "The application rich-text sections are supplied as immutable HTML templates plus textSegments. Return one Arabic translation for every text segment using the exact same segment id. Never add, remove, rename, merge, split, or reorder segment ids.",
      "The application reconstructs the final Arabic HTML from the original template, so headings, paragraphs, lists, tables, links, and image positions will remain unchanged.",
      "Use established construction terminology, including: Inspection Report = تقرير التفتيش, Concrete Pour = صب الخرسانة, Reinforcement = حديد التسليح, Formwork = الشدات/القوالب, Submittal = تقديم فني, Approval = اعتماد, NCR = تقرير عدم المطابقة, Snag List = قائمة الملاحظات, Corrective Action = إجراء تصحيحي, Testing and Commissioning = الاختبارات والتشغيل التجريبي.",
      "For each readable attachment supplied after this JSON, add exactly one attachmentTranslations entry using its exact attachmentId and filename. Translate all readable text without summarizing. Preserve page order and return structured HTML with headings, paragraphs, lists, and real <table>/<tr>/<th>/<td> elements whenever the source contains a table. Never flatten tables into prose.",
      "Original evidence and PDF images are reused by the application and PDF renderer. Do not invent replacement images or data URLs.",
      "Keep project names, checklist IDs, approval IDs, attachment IDs, reviewer names, dates, booleans, filenames, report numbers, measurements, and URLs unchanged unless they are human-readable descriptive text.",
      `SOURCE DOCUMENT JSON:\n${JSON.stringify(sourceDocument)}`,
    ].join("\n\n"),
  })

  for (const attachment of readableAttachmentInputs) {
    content.push({ type: "input_text", text: `READABLE ATTACHMENT — attachmentId: ${attachment.id}; filename: ${attachment.filename}` })
    content.push({ type: "input_file", file_url: attachment.url })
  }

  let translationId = pageData.translation?.id ?? null
  if (translationId) {
    const { error } = await admin
      .from("translation_documents")
      .update({ translation_status: "pending", original_content: original, created_by: userId, updated_at: new Date().toISOString() })
      .eq("id", translationId)
    if (error) throw error
  } else {
    const { data, error } = await admin
      .from("translation_documents")
      .insert({
        project_id: pageData.project.id,
        project_stage_id: pageData.stage.id,
        project_stage_term_id: realTermId,
        response_id: pageData.response.id,
        original_content: original,
        translated_content: null,
        translation_status: "pending",
        created_by: userId,
      })
      .select("id")
      .single()
    if (error) throw error
    translationId = data.id
  }

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        max_output_tokens: 24_000,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "construction_document_translation",
            description: "A complete Arabic translation that preserves the source document structure.",
            strict: true,
            schema: translationSchema(),
          },
        },
      }),
      signal: AbortSignal.timeout(180_000),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI request failed with status ${response.status}.`)
    const text = outputText(payload)
    if (!text) throw new Error("The AI service returned an empty translation.")

    let rawTranslation: unknown
    try {
      rawTranslation = JSON.parse(text)
    } catch {
      throw new Error("The AI service returned an invalid translation format.")
    }

    const translated = normalizeTranslation(rawTranslation, original, templatesBySection, mediaBySection, readableAttachments)
    const generatedAt = new Date().toISOString()
    const previousPdfPaths = [
      pageData.translation?.originalPdfPath,
      pageData.translation?.arabicPdfPath,
      pageData.translation?.bilingualPdfPath,
    ].filter((value): value is string => Boolean(value))

    const { error } = await admin
      .from("translation_documents")
      .update({
        original_content: original,
        translated_content: translated,
        translation_status: "completed",
        generated_at: generatedAt,
        original_pdf_url: null,
        arabic_pdf_url: null,
        bilingual_pdf_url: null,
        updated_at: generatedAt,
      })
      .eq("id", translationId)
    if (error) throw error

    if (previousPdfPaths.length) await admin.storage.from(TRANSLATION_BUCKET).remove(previousPdfPaths).catch(() => undefined)

    await audit({
      actorId: userId,
      action: "stage_translation.generate",
      entityType: "translation_document",
      entityId: translationId,
      projectId: pageData.project.id,
      metadata: { stageId: pageData.stage.id, termId: pageData.term.id, responseId: pageData.response.id },
    })

    return {
      id: translationId,
      status: "completed" as const,
      originalContent: original,
      translatedContent: translated,
      generatedAt,
      createdAt: pageData.translation?.createdAt ?? generatedAt,
      updatedAt: generatedAt,
      originalPdfPath: null,
      arabicPdfPath: null,
      bilingualPdfPath: null,
    }
  } catch (error) {
    await admin
      .from("translation_documents")
      .update({ translation_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", translationId)
    throw error
  }
}
