import "server-only"

import { assertProjectMember, audit } from "@/lib/auth/guards"
import { loadStageTranslationPageData } from "@/lib/stage-translations/data"
import { parseTranslationContent } from "@/lib/stage-translations/content"
import type { TranslationReportContent, TranslationSectionKey } from "@/lib/stage-translations/types"
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

type OpenAiContentItem =
  | { type: "input_text"; text: string }
  | { type: "input_file"; file_url: string }

type MediaPlaceholder = { token: string; html: string }

function extension(name: string) {
  return name.toLowerCase().split(".").pop() ?? ""
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
  const protectedHtml = html.replace(/<figure\b[\s\S]*?<\/figure>|<img\b[^>]*>/gi, (match) => {
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
    } else missing.push(item.html)
  }
  if (missing.length) result += missing.join("")
  return result
}

function translationSchema() {
  const stringField = { type: "string" }
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
          feedback: stringField,
          observation: stringField,
          findings: stringField,
          recommendations: stringField,
          correctiveActions: stringField,
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

function normalizeTranslation(
  value: unknown,
  original: TranslationReportContent,
  mediaBySection: Record<TranslationSectionKey, MediaPlaceholder[]>,
  readableAttachments: Array<{ id: string; filename: string }>,
): TranslationReportContent {
  const parsed = parseTranslationContent(value)
  if (!parsed) throw new Error("The AI service returned an invalid translation.")

  const sections = { ...parsed.sections }
  for (const key of Object.keys(sections) as TranslationSectionKey[]) {
    sections[key] = restoreInlineMedia(sections[key], mediaBySection[key])
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
      contentHtml: item.contentHtml,
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
  termId: string
}) {
  const userId = await assertProjectMember(input.projectId)
  const pageData = await loadStageTranslationPageData(input.projectId, input.stageId, input.termId, userId)
  if (!pageData) throw new Error("Save the inspection report before generating a translation.")

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error("Document Translation is not configured. Add OPENAI_API_KEY to the server environment.")

  const original = pageData.response.content
  const mediaBySection = {} as Record<TranslationSectionKey, MediaPlaceholder[]>
  const protectedSections = {} as Record<TranslationSectionKey, string>
  for (const key of Object.keys(original.sections) as TranslationSectionKey[]) {
    const protectedValue = protectInlineMedia(original.sections[key], key)
    protectedSections[key] = protectedValue.protectedHtml
    mediaBySection[key] = protectedValue.media
  }

  const content: OpenAiContentItem[] = []
  const readableAttachments: Array<{ id: string; filename: string }> = []
  const documentAttachments = pageData.response.attachments
    .filter((item) => item.attachmentKind === "document" && SUPPORTED_ATTACHMENT_EXTENSIONS.has(extension(item.originalFilename)))
    .slice(0, MAX_READABLE_ATTACHMENTS)

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
    sections: protectedSections,
    checklist: original.checklist,
    approvals: original.approvals,
    evidenceImages: pageData.response.attachments
      .filter((item) => item.attachmentKind !== "document")
      .map((item) => ({ id: item.id, filename: item.originalFilename })),
    readableAttachments: documentAttachments.map((item) => ({ id: item.id, filename: item.originalFilename })),
  }

  content.push({
    type: "input_text",
    text: [
      "Translate the complete construction inspection document from English into professional Arabic.",
      "This is translation only: do not summarize, shorten, omit, reinterpret, add, or invent any information.",
      "Preserve engineering meaning, measurements, references, report numbers, dates, names, URLs, HTML structure, tables, lists, links, and all [[[BUILDSIGHT_...]]] media placeholders exactly.",
      "Use established construction terminology, including: Inspection Report = تقرير التفتيش, Concrete Pour = صب الخرسانة, Reinforcement = حديد التسليح, Formwork = الشدات/القوالب, Submittal = تقديم فني, Approval = اعتماد, NCR = تقرير عدم المطابقة, Snag List = قائمة الملاحظات, Corrective Action = إجراء تصحيحي, Testing and Commissioning = الاختبارات والتشغيل التجريبي.",
      "Return Arabic HTML fragments in every rich-text field. Preserve the original tags and translate only human-readable text inside them.",
      "Translate stageName and termName into professional Arabic. Keep project names, checklist IDs, approval IDs, attachment IDs, reviewer names, dates, booleans, and filenames unchanged. Translate checklist wording, decisions, comments, and readable attachment text.",
      "For each readable attachment supplied after this JSON, add one attachmentTranslations entry using its exact attachmentId and filename. Translate all readable text without summarizing. Use structured HTML paragraphs, headings, lists, and tables where appropriate.",
      "Do not include evidence images in attachmentTranslations; they are automatically reused in the translated document.",
      `SOURCE DOCUMENT JSON:\n${JSON.stringify(sourceDocument)}`,
    ].join("\n\n"),
  })

  for (const attachment of documentAttachments) {
    const url = await createSignedUrl(attachment.storagePath)
    if (!url) continue
    readableAttachments.push({ id: attachment.id, filename: attachment.originalFilename })
    content.push({ type: "input_text", text: `READABLE ATTACHMENT — attachmentId: ${attachment.id}; filename: ${attachment.originalFilename}` })
    content.push({ type: "input_file", file_url: url })
  }

  const admin = createAdminClient()
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
        project_stage_term_id: pageData.term.id,
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
        max_output_tokens: 16_000,
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "construction_document_translation",
            description: "A complete Arabic translation of a structured construction inspection document.",
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

    const translated = normalizeTranslation(rawTranslation, original, mediaBySection, readableAttachments)
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
