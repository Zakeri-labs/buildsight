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
    .select("id, report_name, approval_required, project_stage_id, parent_term_id, is_active, project_stages!inner(project_id, name, status)")
    .eq("id", termId)
    .eq("project_stages.project_id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Project report term not found.")
  return data
}

function assertActiveTermScope(term: any) {
  const stageScope = Array.isArray(term.project_stages) ? term.project_stages[0] : term.project_stages
  if (!term.is_active || stageScope?.status === "disabled") {
    throw new Error("This stage or term is inactive and cannot accept new work.")
  }
}

function nextReportNumber() {
  const year = new Date().getFullYear()
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()
  return `IR-${year}-${suffix}`
}

function revalidateProjectStageViews(projectId: string) {
  revalidatePath(`/projects/${projectId}/stages`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/projects")
  revalidatePath("/")
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
    assertActiveTermScope(term)
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

    if (!term.parent_term_id) {
      const { count: activeSubtermCount, error: subtermError } = await admin
        .from("project_stage_terms")
        .select("id", { count: "exact", head: true })
        .eq("parent_term_id", input.termId)
        .eq("is_active", true)
      if (subtermError) throw subtermError
      if ((activeSubtermCount ?? 0) > 0 && !existing) {
        return { ok: false, error: "Complete the workflow on a sub-term instead of the parent term." }
      }
    }

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
    revalidateProjectStageViews(input.projectId)
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
      .select("id, status, project_stage_term_id")
      .eq("id", input.responseId)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (responseError) throw responseError
    if (!response) return { ok: false, error: "Report response not found." }
    assertActiveTermScope(await termScope(input.projectId, response.project_stage_term_id))
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
      .select("status, project_stage_term_id")
      .eq("id", attachment.response_id)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (responseError) throw responseError
    if (!response) return { ok: false, error: "Report response not found." }
    assertActiveTermScope(await termScope(input.projectId, response.project_stage_term_id))
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
    assertActiveTermScope(await termScope(input.projectId, response.project_stage_term_id))
    if (response.status !== "submitted" && response.status !== "under_review") {
      return { ok: false, error: "Only submitted reports can be approved or rejected." }
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
    revalidateProjectStageViews(input.projectId)
    revalidatePath(`/projects/${input.projectId}/stages/${term.project_stage_id}/terms/${response.project_stage_term_id}`)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not save the review decision.")
  }
}

const SUBTERM_NAME_MAX_LENGTH = 200

type ProjectStageSelectionInput = {
  projectId: string
  selectedTemplateStageIds: string[]
}

function normalizedName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

async function activeSiblingNameExists(parentTermId: string, name: string, excludeId?: string) {
  const admin = createAdminClient()
  let query = admin
    .from("project_stage_terms")
    .select("id, report_name")
    .eq("parent_term_id", parentTermId)
    .eq("is_active", true)
  if (excludeId) query = query.neq("id", excludeId)
  const { data, error } = await query
  if (error) throw error
  const normalized = name.toLowerCase()
  return (data ?? []).some((row: any) => normalizedName(row.report_name).toLowerCase() === normalized)
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505")
}

async function projectOrganization(projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("projects")
    .select("id, supervising_organization_id")
    .eq("id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Project not found.")
  return data
}

async function deriveProjectStageStatus(projectStageId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("project_stage_terms")
    .select("status, is_required")
    .eq("project_stage_id", projectStageId)
    .is("parent_term_id", null)
    .eq("is_active", true)
  if (error) throw error
  const terms = data ?? []
  if (!terms.length) return "not_started"
  const required = terms.filter((term: any) => term.is_required)
  const counted = required.length ? required : terms
  if (counted.every((term: any) => ["approved", "completed"].includes(term.status))) return "completed"
  if (terms.some((term: any) => term.status !== "not_started")) return "in_progress"
  return "not_started"
}

export async function saveProjectStageSelectionAction(
  input: ProjectStageSelectionInput,
): Promise<StageActionResult> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const project = await projectOrganization(input.projectId)
    const admin = createAdminClient()
    if (!Array.isArray(input.selectedTemplateStageIds)) {
      return { ok: false, error: "Select valid project stages." }
    }
    const requestedIds = Array.from(new Set(input.selectedTemplateStageIds.filter((id): id is string => typeof id === "string" && Boolean(id))))

    const { data: libraryStages, error: libraryError } = await admin
      .from("stages")
      .select("id, name, description, sort_order, is_active")
      .eq("organization_id", project.supervising_organization_id)
      .order("sort_order", { ascending: true })
    if (libraryError) throw libraryError

    const { error: instantiateError } = await admin.rpc("instantiate_project_stages", {
      target_project_id: input.projectId,
    })
    if (instantiateError) throw instantiateError

    const { data: existingRows, error: existingError } = await admin
      .from("project_stages")
      .select("id, template_stage_id, status")
      .eq("project_id", input.projectId)
    if (existingError) throw existingError
    const existingByTemplate = new Map<string, any>(
      (existingRows ?? []).filter((row: any) => row.template_stage_id).map((row: any) => [row.template_stage_id as string, row]),
    )
    const allowed = new Map(
      (libraryStages ?? [])
        .filter((stage: any) => stage.is_active !== false || existingByTemplate.has(stage.id))
        .map((stage: any) => [stage.id as string, stage]),
    )
    if (requestedIds.some((id) => !allowed.has(id))) {
      return { ok: false, error: "One or more selected stages are unavailable." }
    }

    for (const templateId of requestedIds) {
      const existing = existingByTemplate.get(templateId)
      if (!existing) throw new Error("Selected stage could not be instantiated.")
      if (existing.status === "disabled") {
        const restoredStatus = await deriveProjectStageStatus(existing.id)
        const { error } = await admin
          .from("project_stages")
          .update({ status: restoredStatus })
          .eq("id", existing.id)
          .eq("project_id", input.projectId)
        if (error) throw error
      }
    }

    const selected = new Set(requestedIds)
    const disableIds = (existingRows ?? [])
      .filter((row: any) => row.template_stage_id && !selected.has(row.template_stage_id) && row.status !== "disabled")
      .map((row: any) => row.id as string)
    if (disableIds.length) {
      const { error } = await admin
        .from("project_stages")
        .update({ status: "disabled" })
        .in("id", disableIds)
        .eq("project_id", input.projectId)
      if (error) throw error
    }

    await audit({
      actorId,
      action: "project_stages.selection_updated",
      entityType: "project",
      entityId: input.projectId,
      projectId: input.projectId,
      metadata: { selectedTemplateStageIds: requestedIds },
    })
    revalidateProjectStageViews(input.projectId)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not update project stages.")
  }
}

async function parentTermScope(projectId: string, parentTermId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("project_stage_terms")
    .select("id, project_stage_id, parent_term_id, is_active, project_stages!inner(project_id, status)")
    .eq("id", parentTermId)
    .eq("project_stages.project_id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Parent term not found.")
  if (data.parent_term_id) throw new Error("A sub-term cannot contain another sub-term.")
  if (!data.is_active) throw new Error("This parent term is inactive.")
  const stage = Array.isArray(data.project_stages) ? data.project_stages[0] : data.project_stages
  if (stage?.status === "disabled") throw new Error("This stage is inactive.")
  return data
}

export async function createProjectSubtermAction(input: {
  projectId: string
  parentTermId: string
  name: string
  required: boolean
  approvalRequired: boolean
}): Promise<StageActionResult<{ id: string }>> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const parent = await parentTermScope(input.projectId, input.parentTermId)
    if (typeof input.required !== "boolean" || typeof input.approvalRequired !== "boolean") {
      return { ok: false, error: "Select valid Sub-term settings." }
    }
    const name = normalizedName(input.name)
    if (!name) return { ok: false, error: "Sub-term name is required." }
    if (name.length > SUBTERM_NAME_MAX_LENGTH) return { ok: false, error: `Sub-term name must be ${SUBTERM_NAME_MAX_LENGTH} characters or fewer.` }
    const admin = createAdminClient()
    if (await activeSiblingNameExists(input.parentTermId, name)) {
      return { ok: false, error: "A sub-term with this name already exists under the parent term." }
    }

    const { data: lastRows, error: orderError } = await admin
      .from("project_stage_terms")
      .select("sort_order")
      .eq("parent_term_id", input.parentTermId)
      .order("sort_order", { ascending: false })
      .limit(1)
    if (orderError) throw orderError
    const sortOrder = ((lastRows?.[0] as any)?.sort_order ?? 0) + 10

    const { data, error } = await admin
      .from("project_stage_terms")
      .insert({
        project_stage_id: parent.project_stage_id,
        parent_term_id: input.parentTermId,
        report_name: name,
        is_required: input.required,
        approval_required: input.approvalRequired,
        due_date_rule: "none",
        status: "not_started",
        sort_order: sortOrder,
        is_active: true,
      })
      .select("id")
      .single()
    if (error) {
      if (isUniqueViolation(error)) return { ok: false, error: "A sub-term with this name already exists under the parent term." }
      throw error
    }
    await audit({ actorId, action: "project_subterm.created", entityType: "project_stage_term", entityId: data.id, projectId: input.projectId, metadata: { parentTermId: input.parentTermId, name } })
    revalidateProjectStageViews(input.projectId)
    return { ok: true, data: { id: data.id } }
  } catch (error) {
    return actionError(error, "Could not add the sub-term.")
  }
}

export async function updateProjectSubtermAction(input: {
  projectId: string
  subtermId: string
  name: string
  required: boolean
  approvalRequired: boolean
}): Promise<StageActionResult> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { data: subterm, error: lookupError } = await admin
      .from("project_stage_terms")
      .select("id, parent_term_id, project_stage_id, is_active, project_stages!inner(project_id)")
      .eq("id", input.subtermId)
      .eq("project_stages.project_id", input.projectId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!subterm?.parent_term_id) return { ok: false, error: "Sub-term not found." }
    if (!subterm.is_active) return { ok: false, error: "Archived sub-terms must be restored before editing." }
    await parentTermScope(input.projectId, subterm.parent_term_id)
    if (typeof input.required !== "boolean" || typeof input.approvalRequired !== "boolean") {
      return { ok: false, error: "Select valid Sub-term settings." }
    }
    const name = normalizedName(input.name)
    if (!name) return { ok: false, error: "Sub-term name is required." }
    if (name.length > SUBTERM_NAME_MAX_LENGTH) return { ok: false, error: `Sub-term name must be ${SUBTERM_NAME_MAX_LENGTH} characters or fewer.` }

    if (await activeSiblingNameExists(subterm.parent_term_id, name, input.subtermId)) {
      return { ok: false, error: "A sub-term with this name already exists under the parent term." }
    }

    const { error } = await admin
      .from("project_stage_terms")
      .update({ report_name: name, is_required: input.required, approval_required: input.approvalRequired })
      .eq("id", input.subtermId)
    if (error) {
      if (isUniqueViolation(error)) return { ok: false, error: "A sub-term with this name already exists under the parent term." }
      throw error
    }
    await audit({ actorId, action: "project_subterm.updated", entityType: "project_stage_term", entityId: input.subtermId, projectId: input.projectId, metadata: { name } })
    revalidateProjectStageViews(input.projectId)
    revalidatePath(`/projects/${input.projectId}/stages/${subterm.project_stage_id}/terms/${input.subtermId}`)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not update the sub-term.")
  }
}

export async function deleteProjectSubtermAction(input: {
  projectId: string
  subtermId: string
}): Promise<StageActionResult<{ archived: boolean }>> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { data: subterm, error: lookupError } = await admin
      .from("project_stage_terms")
      .select("id, parent_term_id, project_stage_id, project_stages!inner(project_id)")
      .eq("id", input.subtermId)
      .eq("project_stages.project_id", input.projectId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!subterm?.parent_term_id) return { ok: false, error: "Sub-term not found." }
    await parentTermScope(input.projectId, subterm.parent_term_id)
    const { count, error: responseError } = await admin
      .from("term_responses")
      .select("id", { count: "exact", head: true })
      .eq("project_stage_term_id", input.subtermId)
    if (responseError) throw responseError
    const archived = (count ?? 0) > 0
    if (archived) {
      const { error } = await admin.from("project_stage_terms").update({ is_active: false }).eq("id", input.subtermId)
      if (error) throw error
    } else {
      const { error } = await admin.from("project_stage_terms").delete().eq("id", input.subtermId)
      if (error) throw error
    }
    await audit({ actorId, action: archived ? "project_subterm.archived" : "project_subterm.deleted", entityType: "project_stage_term", entityId: input.subtermId, projectId: input.projectId })
    revalidateProjectStageViews(input.projectId)
    return { ok: true, data: { archived } }
  } catch (error) {
    return actionError(error, "Could not remove the sub-term.")
  }
}

export async function restoreProjectSubtermAction(input: {
  projectId: string
  subtermId: string
}): Promise<StageActionResult> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { data: subterm, error: lookupError } = await admin
      .from("project_stage_terms")
      .select("id, parent_term_id, report_name, project_stages!inner(project_id)")
      .eq("id", input.subtermId)
      .eq("project_stages.project_id", input.projectId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!subterm?.parent_term_id) return { ok: false, error: "Sub-term not found." }
    await parentTermScope(input.projectId, subterm.parent_term_id)
    if (await activeSiblingNameExists(subterm.parent_term_id, normalizedName(subterm.report_name), input.subtermId)) {
      return { ok: false, error: "An active sub-term with this name already exists." }
    }
    const { error } = await admin.from("project_stage_terms").update({ is_active: true }).eq("id", input.subtermId)
    if (error) {
      if (isUniqueViolation(error)) return { ok: false, error: "An active sub-term with this name already exists." }
      throw error
    }
    await audit({ actorId, action: "project_subterm.restored", entityType: "project_stage_term", entityId: input.subtermId, projectId: input.projectId })
    revalidateProjectStageViews(input.projectId)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not restore the sub-term.")
  }
}
