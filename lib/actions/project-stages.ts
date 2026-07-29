"use server"

import { revalidatePath } from "next/cache"
import { assertProjectAdmin, assertProjectMember, assertProjectReviewer, audit, AuthzError } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  EMPTY_TERM_RESPONSE_CONTENT,
  STAGE_DOCUMENT_ACCEPTED_MIME_TYPES,
  STAGE_DOCUMENT_MAX_FILE_BYTES,
  STAGE_EVIDENCE_MAX_FILE_BYTES,
  isReportType,
  sanitizeReportHtml,
  type ReportTypeValue,
  type TermResponseContent,
} from "@/lib/stages/execution"

export type StageActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

function actionError(error: unknown, fallback: string): StageActionResult<never> {
  return { ok: false, error: error instanceof AuthzError ? error.message : error instanceof Error ? error.message : fallback }
}

function normalizeContent(value: Partial<TermResponseContent>): TermResponseContent {
  return {
    feedback: sanitizeReportHtml(value.feedback),
    observation: sanitizeReportHtml(value.observation),
    findings: sanitizeReportHtml(value.findings),
    recommendations: sanitizeReportHtml(value.recommendations),
    correctiveActions: sanitizeReportHtml(value.correctiveActions),
    checklist: Array.isArray(value.checklist)
      ? value.checklist.slice(0, 100).map((item) => ({
          id: String(item.id || crypto.randomUUID()).slice(0, 100),
          label: String(item.label || "").trim().slice(0, 500),
          checked: Boolean(item.checked),
          notes: item.notes ? String(item.notes).slice(0, 2_000) : undefined,
        })).filter((item) => item.label.length > 0)
      : EMPTY_TERM_RESPONSE_CONTENT.checklist,
  }
}

async function termScope(projectId: string, termId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("project_stage_terms")
    .select("id, report_name, approval_required, project_stage_id, project_stages!inner(project_id, name)")
    .eq("id", termId)
    .eq("project_stages.project_id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Project report term not found.")
  return data
}

function nextReportNumber() {
  const year = new Date().getFullYear()
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()
  return `IR-${year}-${suffix}`
}

export async function saveTermResponseAction(input: {
  projectId: string
  termId: string
  reportType: ReportTypeValue
  visitNumber?: number
  subject?: string
  reportTitle: string
  content: Partial<TermResponseContent>
  submit?: boolean
  saveStatus?: "draft" | "in_progress"
}): Promise<StageActionResult<{ responseId: string; reportNumber: string; status: string }>> {
  try {
    const actorId = await assertProjectMember(input.projectId)
    const term = await termScope(input.projectId, input.termId)
    const title = input.reportTitle.trim()
    if (!title) return { ok: false, error: "Report title is required." }
    if (!isReportType(input.reportType)) return { ok: false, error: "Select a valid report type." }
    const visitNumber = Number.isInteger(input.visitNumber) && Number(input.visitNumber) > 0 ? Number(input.visitNumber) : 1
    const content = normalizeContent(input.content)
    const admin = createAdminClient()
    const { data: existing, error: existingError } = await admin
      .from("term_responses")
      .select("id, report_number, status")
      .eq("project_stage_term_id", input.termId)
      .maybeSingle()
    if (existingError) throw existingError

    const lockedStatuses = new Set(["approved", "completed"])
    if (existing && lockedStatuses.has(existing.status)) {
      return { ok: false, error: "This report is finalized and cannot be modified." }
    }

    const nextStatus = input.submit
      ? term.approval_required ? "submitted" : "completed"
      : input.saveStatus === "in_progress" ? "in_progress" : "draft"
    const now = new Date().toISOString()
    let responseId: string
    let reportNumber: string

    if (existing) {
      const { error } = await admin
        .from("term_responses")
        .update({
          report_type: input.reportType,
          visit_number: visitNumber,
          subject: input.subject?.trim() || null,
          report_title: title,
          response_content: content,
          status: nextStatus,
          updated_by: actorId,
          submitted_at: input.submit ? now : null,
          completed_at: input.submit && !term.approval_required ? now : null,
        })
        .eq("id", existing.id)
      if (error) throw error
      responseId = existing.id
      reportNumber = existing.report_number
    } else {
      reportNumber = nextReportNumber()
      const { data: created, error } = await admin
        .from("term_responses")
        .insert({
          project_id: input.projectId,
          project_stage_term_id: input.termId,
          report_number: reportNumber,
          visit_number: visitNumber,
          report_type: input.reportType,
          subject: input.subject?.trim() || null,
          report_title: title,
          response_content: content,
          status: nextStatus,
          created_by: actorId,
          updated_by: actorId,
          submitted_at: input.submit ? now : null,
          completed_at: input.submit && !term.approval_required ? now : null,
        })
        .select("id")
        .single()
      if (error) throw error
      responseId = created.id
    }

    await audit({
      actorId,
      action: input.submit ? "stage_report.submitted" : "stage_report.saved",
      entityType: "term_response",
      entityId: responseId,
      projectId: input.projectId,
      metadata: { termId: input.termId, reportNumber, reportName: term.report_name },
    })
    revalidatePath(`/projects/${input.projectId}/stages`)
    revalidatePath(`/projects/${input.projectId}/stages/${term.project_stage_id}/terms/${input.termId}`)
    return { ok: true, data: { responseId, reportNumber, status: nextStatus } }
  } catch (error) {
    return actionError(error, "Could not save the inspection report.")
  }
}

export type AttachmentRegistration = {
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  attachmentKind: "evidence_image" | "document" | "inline_image"
  sortOrder?: number
}

export async function registerResponseAttachmentsAction(input: {
  projectId: string
  responseId: string
  attachments: AttachmentRegistration[]
}): Promise<StageActionResult<{ ids: string[] }>> {
  try {
    const actorId = await assertProjectMember(input.projectId)
    if (!input.attachments.length) return { ok: true, data: { ids: [] } }
    if (input.attachments.length > 20) return { ok: false, error: "Too many attachments." }
    const admin = createAdminClient()
    const { data: response, error: responseError } = await admin
      .from("term_responses")
      .select("id, status")
      .eq("id", input.responseId)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (responseError) throw responseError
    if (!response) return { ok: false, error: "Report response not found." }
    if (["approved", "completed"].includes(response.status)) {
      return { ok: false, error: "Attachments cannot be changed while this report is finalized." }
    }

    const prefix = `${input.projectId}/${input.responseId}/`
    const allowedDocuments = STAGE_DOCUMENT_ACCEPTED_MIME_TYPES as readonly string[]
    const rows = input.attachments.map((attachment, index) => {
      if (!attachment.storagePath.startsWith(prefix) || attachment.storagePath.includes("..")) {
        throw new Error("Invalid attachment storage path.")
      }
      if (!Number.isFinite(attachment.sizeBytes) || attachment.sizeBytes < 0) throw new Error("Invalid attachment size.")
      if (attachment.attachmentKind === "document") {
        if (attachment.sizeBytes > STAGE_DOCUMENT_MAX_FILE_BYTES) throw new Error("A document exceeds the 50 MB limit.")
        if (!allowedDocuments.includes(attachment.mimeType)) throw new Error("Unsupported document attachment type.")
      } else {
        if (attachment.sizeBytes > STAGE_EVIDENCE_MAX_FILE_BYTES) throw new Error("An image exceeds the 15 MB limit.")
        if (!attachment.mimeType.startsWith("image/")) throw new Error("Unsupported image attachment type.")
      }
      return {
        response_id: input.responseId,
        project_id: input.projectId,
        storage_path: attachment.storagePath,
        original_filename: attachment.originalFilename.slice(0, 500),
        mime_type: attachment.mimeType.slice(0, 200),
        size_bytes: attachment.sizeBytes,
        attachment_kind: attachment.attachmentKind,
        sort_order: attachment.sortOrder ?? index,
        uploaded_by: actorId,
      }
    })
    const { data, error } = await admin.from("response_attachments").insert(rows).select("id")
    if (error) throw error
    revalidatePath(`/projects/${input.projectId}/stages`)
    revalidatePath(`/projects/${input.projectId}/stages`, "page")
    return { ok: true, data: { ids: (data ?? []).map((row: any) => row.id as string) } }
  } catch (error) {
    return actionError(error, "Could not save attachment metadata.")
  }
}

export async function deleteResponseAttachmentAction(input: {
  projectId: string
  attachmentId: string
}): Promise<StageActionResult> {
  try {
    const actorId = await assertProjectMember(input.projectId)
    const admin = createAdminClient()
    const { data: attachment, error: lookupError } = await admin
      .from("response_attachments")
      .select("id, storage_path, uploaded_by, response_id")
      .eq("id", input.attachmentId)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!attachment) return { ok: false, error: "Attachment not found." }
    const { data: response, error: responseError } = await admin
      .from("term_responses")
      .select("status")
      .eq("id", attachment.response_id)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (responseError) throw responseError
    if (!response) return { ok: false, error: "Report response not found." }
    if (["approved", "completed"].includes(response.status)) {
      return { ok: false, error: "Attachments cannot be changed while this report is finalized." }
    }
    if (attachment.uploaded_by !== actorId) await assertProjectAdmin(input.projectId)
    const { error } = await admin.from("response_attachments").delete().eq("id", input.attachmentId)
    if (error) throw error
    await admin.storage.from("project-stage-evidence").remove([attachment.storage_path])
    revalidatePath(`/projects/${input.projectId}/stages`)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not delete the attachment.")
  }
}

export async function decideTermResponseAction(input: {
  projectId: string
  responseId: string
  decision: "approved" | "rejected"
  comments?: string
}): Promise<StageActionResult> {
  try {
    const reviewerId = await assertProjectReviewer(input.projectId)
    const comments = input.comments?.trim() || null
    if (input.decision === "rejected" && !comments) {
      return { ok: false, error: "Add review comments when rejecting a report." }
    }
    const admin = createAdminClient()
    const { data: response, error: lookupError } = await admin
      .from("term_responses")
      .select("id, project_stage_term_id, status")
      .eq("id", input.responseId)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!response) return { ok: false, error: "Report response not found." }
    if (response.status === "approved" || response.status === "completed") {
      return { ok: false, error: "This report has already been finalized." }
    }

    const { error: decisionError } = await admin.rpc("decide_project_stage_response", {
      target_response_id: input.responseId,
      target_project_id: input.projectId,
      target_reviewer_id: reviewerId,
      target_decision: input.decision,
      target_comments: comments,
    })
    if (decisionError) throw decisionError
    await audit({
      actorId: reviewerId,
      action: `stage_report.${input.decision}`,
      entityType: "term_response",
      entityId: input.responseId,
      projectId: input.projectId,
      metadata: { comments },
    })
    const term = await termScope(input.projectId, response.project_stage_term_id)
    revalidatePath(`/projects/${input.projectId}/stages`)
    revalidatePath(`/projects/${input.projectId}/stages/${term.project_stage_id}/terms/${response.project_stage_term_id}`)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not save the review decision.")
  }
}
