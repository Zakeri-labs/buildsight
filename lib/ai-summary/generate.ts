import "server-only"

import { assertProjectMember } from "@/lib/auth/guards"
import { getDocumentTypeDefinition, normalizeDocumentType } from "@/lib/documents/document-types"
import { getRichTextImagePaths, isRichTextDocument } from "@/lib/documents/rich-text"
import { getSimpleUploadCategory } from "@/lib/documents/simple-upload"
import { sanitizeReportHtml } from "@/lib/stages/execution"
import { createAdminClient } from "@/lib/supabase/admin"
import { richTextToPlainText } from "@/lib/ai-summary/sources"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const OPENAI_MODEL = "gpt-5.6"
const SIGNED_URL_TTL_SECONDS = 20 * 60
const MAX_SELECTED_SOURCES = 30
const MAX_CUSTOM_INSTRUCTIONS = 2_000

const SUPPORTED_FILE_EXTENSIONS = new Set([
  "pdf", "txt", "md", "json", "html", "xml", "doc", "docx", "rtf", "odt",
  "ppt", "pptx", "csv", "xls", "xlsx", "tsv", "iif",
])
const IMAGE_MIME_PREFIX = "image/"

export type GenerateAiSummaryInput = {
  projectId: string
  responseIds: string[]
  documentIds: string[]
  instructions?: string
  locale?: "en" | "ar"
}

type OpenAiContentItem =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "low" | "auto" }
  | { type: "input_file"; file_url: string; detail?: "low" | "auto" }

function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item))))
}

function htmlToPlainText(value: unknown): string {
  const sanitized = sanitizeReportHtml(value)
  return sanitized
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function extension(name: string) {
  return name.toLowerCase().split(".").pop() ?? ""
}

function isSupportedFile(name: string, mimeType: string) {
  if (mimeType.startsWith(IMAGE_MIME_PREFIX)) return false
  return SUPPORTED_FILE_EXTENSIONS.has(extension(name))
}

function outputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim()
  const parts: string[] = []
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if ((content?.type === "output_text" || content?.type === "text") && typeof content.text === "string") {
        parts.push(content.text)
      }
    }
  }
  return parts.join("\n").trim()
}

async function signedUrl(bucket: string, path: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

async function addStoredAsset(
  content: OpenAiContentItem[],
  asset: { bucket: string; path: string; filename: string; mimeType: string; label: string },
) {
  const url = await signedUrl(asset.bucket, asset.path)
  if (!url) {
    content.push({ type: "input_text", text: `${asset.label}: ${asset.filename} (file was unavailable during summary generation).` })
    return
  }

  content.push({ type: "input_text", text: `${asset.label}: ${asset.filename}` })
  if (asset.mimeType.startsWith(IMAGE_MIME_PREFIX)) {
    content.push({ type: "input_image", image_url: url, detail: "low" })
  } else if (isSupportedFile(asset.filename, asset.mimeType)) {
    content.push({ type: "input_file", file_url: url, ...(asset.mimeType === "application/pdf" ? { detail: "low" as const } : {}) })
  } else {
    content.push({ type: "input_text", text: `The attached file format (${asset.mimeType || extension(asset.filename) || "unknown"}) is recorded as evidence, but its binary contents cannot be read by the AI model.` })
  }
}

export async function generateAiSummary(rawInput: GenerateAiSummaryInput) {
  const projectId = rawInput.projectId?.trim()
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("A valid project is required.")
  await assertProjectMember(projectId)

  const responseIds = uniqueIds(rawInput.responseIds)
  const documentIds = uniqueIds(rawInput.documentIds)
  if (responseIds.length + documentIds.length === 0) throw new Error("Select at least one inspection report or project document.")
  if (responseIds.length + documentIds.length > MAX_SELECTED_SOURCES) throw new Error(`Select no more than ${MAX_SELECTED_SOURCES} sources at a time.`)

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error("AI Summary is not configured. Add OPENAI_API_KEY to the server environment.")

  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, name, code")
    .eq("id", projectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project) throw new Error("Project not found.")

  const [{ data: responses, error: responseError }, { data: documents, error: documentError }] = await Promise.all([
    responseIds.length
      ? admin
          .from("term_responses")
          .select("id, project_stage_term_id, report_number, visit_number, report_type, subject, report_title, response_content, status, created_by, created_at, updated_at, submitted_at, completed_at")
          .eq("project_id", projectId)
          .in("id", responseIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    documentIds.length
      ? admin
          .from("documents")
          .select("id, reference, title, document_type, status, content, created_at, updated_at, published_at, creation_mode, simple_upload_category, file_storage_path, original_filename, file_mime_type")
          .eq("project_id", projectId)
          .in("id", documentIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (responseError) throw responseError
  if (documentError) throw documentError
  if ((responses?.length ?? 0) !== responseIds.length || (documents?.length ?? 0) !== documentIds.length) {
    throw new Error("One or more selected sources are unavailable or do not belong to this project.")
  }

  const termIds = (responses ?? []).map((row: any) => row.project_stage_term_id as string)
  const responseRowIds = (responses ?? []).map((row: any) => row.id as string)
  const [{ data: terms }, { data: attachments }, { data: approvals }] = await Promise.all([
    termIds.length
      ? admin.from("project_stage_terms").select("id, project_stage_id, parent_term_id, report_name, is_required, approval_required, is_active").in("id", termIds)
      : Promise.resolve({ data: [] as any[] }),
    responseRowIds.length
      ? admin
          .from("response_attachments")
          .select("id, response_id, storage_path, original_filename, mime_type, attachment_kind, sort_order, created_at")
          .in("response_id", responseRowIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    responseRowIds.length
      ? admin
          .from("approvals")
          .select("id, response_id, reviewer_id, decision, comments, decided_at")
          .in("response_id", responseRowIds)
          .order("decided_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
  ])

  const stageIds = Array.from(new Set((terms ?? []).map((row: any) => row.project_stage_id as string)))
  const parentIds = Array.from(new Set((terms ?? []).map((row: any) => row.parent_term_id).filter(Boolean))) as string[]
  const reviewerIds = Array.from(new Set((approvals ?? []).map((row: any) => row.reviewer_id as string)))
  const [{ data: stages }, { data: reviewers }, { data: parents }] = await Promise.all([
    stageIds.length ? admin.from("project_stages").select("id, name, status").in("id", stageIds) : Promise.resolve({ data: [] as any[] }),
    reviewerIds.length ? admin.from("profiles").select("id, full_name, email").in("id", reviewerIds) : Promise.resolve({ data: [] as any[] }),
    parentIds.length ? admin.from("project_stage_terms").select("id, is_active").in("id", parentIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const parentActive = new Map<string, boolean>((parents ?? []).map((row: any) => [row.id, row.is_active !== false]))

  const termMap = new Map<string, {
    project_stage_id: string
    parent_term_id: string | null
    report_name: string
    is_required: boolean
    approval_required: boolean
    is_active: boolean
  }>(
    (terms ?? []).map((row: any) => [row.id, {
      project_stage_id: row.project_stage_id,
      parent_term_id: row.parent_term_id,
      report_name: row.report_name,
      is_required: row.is_required === true,
      approval_required: row.approval_required === true,
      is_active: row.is_active !== false,
    }]),
  )
  const stageMap = new Map<string, { name: string; status: string }>(
    (stages ?? []).map((row: any) => [row.id, { name: row.name, status: row.status }]),
  )
  const selectedInactiveTerm = termIds.some((termId) => {
    const term = termMap.get(termId)
    if (!term || !term.is_active || (term.parent_term_id && parentActive.get(term.parent_term_id) !== true)) return true
    const stage = stageMap.get(term.project_stage_id)
    return !stage || stage.status === "disabled"
  })
  if (selectedInactiveTerm) {
    throw new Error("One or more selected inspection reports belong to an inactive stage or term.")
  }
  const reviewerMap = new Map<string, string>((reviewers ?? []).map((row: any) => [row.id, row.full_name?.trim() || row.email || "Reviewer"]))
  const attachmentsByResponse = new Map<string, any[]>()
  for (const row of attachments ?? []) {
    const current = attachmentsByResponse.get(row.response_id) ?? []
    current.push(row)
    attachmentsByResponse.set(row.response_id, current)
  }
  const approvalsByResponse = new Map<string, any[]>()
  for (const row of approvals ?? []) {
    const current = approvalsByResponse.get(row.response_id) ?? []
    current.push(row)
    approvalsByResponse.set(row.response_id, current)
  }

  const content: OpenAiContentItem[] = []
  const locale = rawInput.locale === "ar" ? "ar" : "en"
  const customInstructions = rawInput.instructions?.trim().slice(0, MAX_CUSTOM_INSTRUCTIONS) ?? ""
  content.push({
    type: "input_text",
    text: [
      `Prepare a professional construction project summary for ${project.name}${project.code ? ` (${project.code})` : ""}.`,
      `Output language: ${locale === "ar" ? "Arabic" : "English"}.`,
      "Use only the selected source records and their automatically included evidence. Do not invent measurements, dates, decisions, or progress.",
      "Organise the result with clear headings: Executive Summary, Progress and Status, Key Observations and Findings, Risks / Non-Conformances, Recommendations and Corrective Actions, Approvals and Decisions, and Evidence Reviewed.",
      customInstructions ? `Additional user instructions: ${customInstructions}` : "",
    ].filter(Boolean).join("\n"),
  })

  for (const response of responses ?? []) {
    const term = termMap.get(response.project_stage_term_id)
    const stageName = term ? stageMap.get(term.project_stage_id)?.name ?? "Project stage" : "Project stage"
    const responseContent = safeObject(response.response_content)
    const approvalRows = approvalsByResponse.get(response.id) ?? []
    const approvalText = approvalRows.length
      ? approvalRows.map((approval) => {
          const reviewer = reviewerMap.get(approval.reviewer_id) ?? "Reviewer"
          return `- ${approval.decision} by ${reviewer} on ${approval.decided_at}${approval.comments ? `: ${approval.comments}` : ""}`
        }).join("\n")
      : "No approval decision recorded."
    const checklist = Array.isArray(responseContent.checklist)
      ? responseContent.checklist.map((item: any) => `- [${item?.checked ? "x" : " "}] ${String(item?.label ?? "Checklist item")}${item?.notes ? ` — ${item.notes}` : ""}`).join("\n")
      : ""

    content.push({
      type: "input_text",
      text: [
        `\nSOURCE: INSPECTION REPORT`,
        `Stage: ${stageName}`,
        `Term: ${term?.report_name ?? response.report_title}`,
        `Report title: ${response.report_title}`,
        `Report number: ${response.report_number}`,
        `Visit number: ${response.visit_number}`,
        `Type: ${response.report_type}`,
        `Status: ${response.status}`,
        `Required: ${term?.is_required ? "Yes" : "No"}`,
        `Approval required: ${term?.approval_required ? "Yes" : "No"}`,
        `Subject: ${response.subject ?? "—"}`,
        `Created: ${response.created_at}`,
        `Updated: ${response.updated_at}`,
        `Feedback:\n${htmlToPlainText(responseContent.feedback) || "—"}`,
        `Observation:\n${htmlToPlainText(responseContent.observation) || "—"}`,
        `Findings:\n${htmlToPlainText(responseContent.findings) || "—"}`,
        `Recommendations:\n${htmlToPlainText(responseContent.recommendations) || "—"}`,
        `Corrective actions:\n${htmlToPlainText(responseContent.correctiveActions) || "—"}`,
        checklist ? `Checklist:\n${checklist}` : "Checklist: —",
        `Approval information:\n${approvalText}`,
      ].join("\n"),
    })

    for (const attachment of attachmentsByResponse.get(response.id) ?? []) {
      await addStoredAsset(content, {
        bucket: "project-stage-evidence",
        path: attachment.storage_path,
        filename: attachment.original_filename,
        mimeType: attachment.mime_type,
        label: attachment.attachment_kind === "document"
          ? `Related document attached to ${response.report_title}`
          : `Image evidence attached to ${response.report_title}`,
      })
    }
  }

  for (const document of documents ?? []) {
    const type = getDocumentTypeDefinition(normalizeDocumentType(document.document_type))
    const simpleCategory = getSimpleUploadCategory(document.simple_upload_category)
    const richText = isRichTextDocument(document.content) ? document.content : null
    content.push({
      type: "input_text",
      text: [
        `\nSOURCE: PROJECT DOCUMENT`,
        `Reference: ${document.reference}`,
        `Title: ${document.title}`,
        `Type: ${simpleCategory?.label ?? type.label}`,
        `Status: ${document.status}`,
        `Created: ${document.created_at}`,
        `Updated: ${document.updated_at}`,
        richText ? `Document content:\n${richTextToPlainText(richText) || "—"}` : "Document content is provided in the attached file.",
      ].join("\n"),
    })

    if (richText) {
      for (const path of getRichTextImagePaths(richText)) {
        await addStoredAsset(content, {
          bucket: "document-images",
          path,
          filename: path.split("/").pop() || "embedded-image",
          mimeType: "image/jpeg",
          label: `Embedded image in ${document.title}`,
        })
      }
    }

    if (document.file_storage_path) {
      await addStoredAsset(content, {
        bucket: "document-images",
        path: document.file_storage_path,
        filename: document.original_filename || document.title,
        mimeType: document.file_mime_type || "application/octet-stream",
        label: `Uploaded project document ${document.title}`,
      })
    }
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      max_output_tokens: 2_500,
      input: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(120_000),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI request failed with status ${response.status}.`
    throw new Error(message)
  }
  const summary = outputText(payload)
  if (!summary) throw new Error("The AI service returned an empty summary. Try again.")

  return {
    summary,
    sourceCount: responseIds.length + documentIds.length,
    inspectionCount: responseIds.length,
    documentCount: documentIds.length,
  }
}
