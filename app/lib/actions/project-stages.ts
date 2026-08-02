"use server"

import { revalidatePath } from "next/cache"
import { assertProjectAdmin, assertProjectMember, assertProjectReviewer, audit, AuthzError } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerClient } from "@/lib/supabase/server"
import {
  EMPTY_TERM_RESPONSE_CONTENT,
  STAGE_DOCUMENT_ACCEPTED_MIME_TYPES,
  STAGE_DOCUMENT_MAX_FILE_BYTES,
  STAGE_EVIDENCE_MAX_FILE_BYTES,
  isReportType,
  isSubtermResponseType,
  sanitizeReportHtml,
  type ReportTypeValue,
  type SubtermResponseType,
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
          result: (item.result === "pass" || item.result === "fail" || item.result === "na" ? item.result : item.checked ? "pass" : "") as "" | "pass" | "fail" | "na",
          notes: item.notes ? String(item.notes).slice(0, 2_000) : undefined,
        })).filter((item) => item.label.length > 0)
      : EMPTY_TERM_RESPONSE_CONTENT.checklist,
    answer: typeof value.answer === "string" ? value.answer.trim().slice(0, 10_000) : "",
    selection: typeof value.selection === "string" ? value.selection.trim().slice(0, 50) : "",
    measurementValue: typeof value.measurementValue === "string" ? value.measurementValue.trim().slice(0, 100) : "",
    measurementUnit: typeof value.measurementUnit === "string" ? value.measurementUnit.trim().slice(0, 100) : "",
    dateValue: typeof value.dateValue === "string" ? value.dateValue.trim().slice(0, 30) : "",
  }
}

async function termScope(projectId: string, termId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("project_stage_terms")
    .select("id, report_name, approval_required, response_type, instructions, responsible_user_id, project_stage_id, parent_term_id, is_active, project_stages!inner(project_id, name, status)")
    .eq("id", termId)
    .eq("project_stages.project_id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Project report term not found.")
  let parentActive = true
  if (data.parent_term_id) {
    const { data: parent, error: parentError } = await admin
      .from("project_stage_terms")
      .select("is_active")
      .eq("id", data.parent_term_id)
      .maybeSingle()
    if (parentError) throw parentError
    parentActive = parent?.is_active === true
  }
  return { ...data, parent_active: parentActive }
}

function assertActiveTermScope(term: any) {
  const stageScope = Array.isArray(term.project_stages) ? term.project_stages[0] : term.project_stages
  if (!term.is_active || term.parent_active === false || stageScope?.status === "disabled") {
    throw new Error("This stage or term is inactive and cannot accept new work.")
  }
}


function plainText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim()
}

async function validateConfiguredSubmission(
  admin: ReturnType<typeof createAdminClient>,
  responseType: SubtermResponseType,
  content: TermResponseContent,
  responseId: string | null,
) {
  switch (responseType) {
    case "text":
      return plainText(content.answer || content.feedback) ? null : "A written response is required before submission."
    case "inspection_checklist": {
      const rows = content.checklist.filter((item) => item.label.trim())
      if (!rows.length) return "Add at least one checklist item before submission."
      return rows.every((item) => item.result === "pass" || item.result === "fail" || item.result === "na")
        ? null
        : "Complete every checklist item before submission."
    }
    case "yes_no":
      return content.selection === "yes" || content.selection === "no" ? null : "Select Yes or No before submission."
    case "pass_fail":
      return content.selection === "pass" || content.selection === "fail" || content.selection === "na" ? null : "Select Pass, Fail, or N/A before submission."
    case "measurement": {
      const value = Number(content.measurementValue)
      return content.measurementValue.trim() && Number.isFinite(value) ? null : "Enter a valid measurement before submission."
    }
    case "date": {
      const value = Date.parse(content.dateValue)
      return content.dateValue && Number.isFinite(value) ? null : "Select a valid date before submission."
    }
    case "file_upload":
    case "photo_evidence": {
      if (!responseId) return responseType === "file_upload" ? "Upload at least one file before submission." : "Upload at least one photo before submission."
      const kind = responseType === "file_upload" ? "document" : "evidence_image"
      const { count, error } = await admin
        .from("response_attachments")
        .select("id", { count: "exact", head: true })
        .eq("response_id", responseId)
        .eq("attachment_kind", kind)
      if (error) throw error
      return (count ?? 0) > 0 ? null : responseType === "file_upload" ? "Upload at least one file before submission." : "Upload at least one photo before submission."
    }
    default:
      return null
  }
}

function reportNumberCandidates(responseId: string) {
  const year = new Date().getFullYear()
  const compactId = responseId.replaceAll("-", "").toUpperCase()
  return [8, 12, compactId.length]
    .map((length) => `IR-${year}-${compactId.slice(0, length)}`)
    .filter((value, index, values) => values.indexOf(value) === index)
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
  responseId: string
  reportType: ReportTypeValue
  subject?: string
  reportTitle: string
  content: Partial<TermResponseContent>
  submit?: boolean
  saveStatus?: "draft" | "in_progress"
}): Promise<StageActionResult<{ responseId: string; reportNumber: string; visitNumber: number; status: string }>> {
  try {
    const actorId = await assertProjectMember(input.projectId)
    const term = await termScope(input.projectId, input.termId)
    assertActiveTermScope(term)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.responseId)) {
      return { ok: false, error: "Invalid report identifier." }
    }
    const title = input.reportTitle.trim()
    if (!title) return { ok: false, error: "Report title is required." }
    if (!isReportType(input.reportType)) return { ok: false, error: "Select a valid report type." }
    const content = normalizeContent(input.content)
    const admin = createAdminClient()
    // Perform user-owned response writes with the authenticated server client so
    // auth.uid() is available to the existing RLS policies. The admin client is
    // kept only for trusted scope/validation reads after authorization.
    const userClient = await createServerClient()
    const { data: existing, error: existingError } = await admin
      .from("term_responses")
      .select("id, report_number, visit_number, status, created_by, project_stage_term_id")
      .eq("id", input.responseId)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing && existing.project_stage_term_id !== input.termId) {
      return { ok: false, error: "This report does not belong to the selected term." }
    }

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

    if (existing && existing.created_by !== actorId && term.responsible_user_id !== actorId) {
      await assertProjectAdmin(input.projectId)
    }

    const configuredResponseType: SubtermResponseType = isSubtermResponseType(term.response_type) ? term.response_type : "combined"
    if (input.submit) {
      const validationError = await validateConfiguredSubmission(admin, configuredResponseType, content, input.responseId)
      if (validationError) return { ok: false, error: validationError }
    }

    if (existing && ["approved", "completed"].includes(existing.status)) {
      return { ok: false, error: "This report is finalized and cannot be modified." }
    }
    if (existing && ["submitted", "under_review"].includes(existing.status)) {
      return { ok: false, error: "This report is awaiting review and cannot be edited or resubmitted." }
    }

    const nextStatus = input.submit
      ? term.approval_required ? "submitted" : "completed"
      : input.saveStatus === "in_progress" ? "in_progress" : "draft"
    const now = new Date().toISOString()
    let reportNumber = existing?.report_number ?? reportNumberCandidates(input.responseId)[0]
    let assignedVisitNumber = existing?.visit_number ?? 1

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        report_type: input.reportType,
        subject: input.subject?.trim() || null,
        report_title: title,
        response_content: content,
        status: nextStatus,
        updated_by: actorId,
        completed_at: input.submit && !term.approval_required ? now : null,
      }
      if (input.submit) updatePayload.submitted_at = now
      else if (existing.status === "rejected") updatePayload.submitted_at = null
      const { error } = await userClient.from("term_responses").update(updatePayload).eq("id", existing.id)
      if (error) {
        if (error.code === "23505") return { ok: false, error: "A report with the same reference already exists." }
        throw error
      }
    } else {
      let created = false
      for (const candidate of reportNumberCandidates(input.responseId)) {
        reportNumber = candidate
        const { error } = await userClient.from("term_responses").insert({
          id: input.responseId,
          project_id: input.projectId,
          project_stage_term_id: input.termId,
          report_number: reportNumber,
          visit_number: 1,
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
        if (!error) {
          created = true
          break
        }
        if (error.code !== "23505") throw error

        const { data: retry, error: retryError } = await admin
          .from("term_responses")
          .select("id, project_id, report_number, visit_number, status, project_stage_term_id")
          .eq("id", input.responseId)
          .maybeSingle()
        if (retryError) throw retryError
        if (retry) {
          if (retry.project_id !== input.projectId || retry.project_stage_term_id !== input.termId) {
            return { ok: false, error: "The report identifier is already in use." }
          }
          return { ok: true, data: { responseId: retry.id, reportNumber: retry.report_number, visitNumber: retry.visit_number, status: retry.status } }
        }

        // A rare report-number collision can safely retry with a longer UUID suffix.
      }
      if (!created) return { ok: false, error: "Could not allocate a unique report number. Try again." }
      const { data: inserted, error: insertedError } = await admin
        .from("term_responses")
        .select("visit_number")
        .eq("id", input.responseId)
        .eq("project_id", input.projectId)
        .single()
      if (insertedError) throw insertedError
      assignedVisitNumber = inserted.visit_number
    }

    await audit({
      actorId,
      action: input.submit ? "stage_report.submitted" : "stage_report.saved",
      entityType: "term_response",
      entityId: input.responseId,
      projectId: input.projectId,
      metadata: { termId: input.termId, reportNumber, reportName: term.report_name },
    })
    revalidateProjectStageViews(input.projectId)
    revalidatePath(`/projects/${input.projectId}/stages/${term.project_stage_id}/terms/${input.termId}`)
    revalidatePath(`/projects/${input.projectId}/stages/${term.project_stage_id}/terms/${input.termId}/reports/${input.responseId}`)
    return { ok: true, data: { responseId: input.responseId, reportNumber, visitNumber: assignedVisitNumber, status: nextStatus } }
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
    const userClient = await createServerClient()
    const { data: response, error: responseError } = await admin
      .from("term_responses")
      .select("id, status, project_stage_term_id, created_by")
      .eq("id", input.responseId)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (responseError) throw responseError
    if (!response) return { ok: false, error: "Report response not found." }
    const scope = await termScope(input.projectId, response.project_stage_term_id)
    assertActiveTermScope(scope)
    if (response.created_by !== actorId && scope.responsible_user_id !== actorId) await assertProjectAdmin(input.projectId)
    if (["submitted", "under_review", "approved", "completed"].includes(response.status)) {
      return { ok: false, error: "Attachments cannot be changed while this report is awaiting review or finalized." }
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
    const { data, error } = await userClient.from("response_attachments").insert(rows).select("id")
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
    if (["submitted", "under_review", "approved", "completed"].includes(response.status)) {
      return { ok: false, error: "Attachments cannot be changed while this report is awaiting review or finalized." }
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
    // Reviewers must be able to resolve already-submitted work even when the
    // Stage, Term, or Sub-term is later disabled for new employee activity.
    await termScope(input.projectId, response.project_stage_term_id)
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
    revalidatePath(`/projects/${input.projectId}/stages/${term.project_stage_id}/terms/${response.project_stage_term_id}/reports/${input.responseId}`)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not save the review decision.")
  }
}

type ProjectStageSelectionInput = {
  projectId: string
  selectedTemplateStageIds: string[]
  selectedTemplateTermIds: string[]
  selectedTemplateSubtermIds: string[]
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505")
}

async function projectOrganization(projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("projects")
    .select("id, supervising_organization_id, created_at")
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

function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) return null
  return Array.from(new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0)))
}

function dueDateFromRule(projectCreatedAt: string, rule: string) {
  const date = new Date(projectCreatedAt)
  if (!Number.isFinite(date.getTime())) return null
  const days = rule === "within_3_days" ? 3 : rule === "within_7_days" ? 7 : rule === "within_14_days" ? 14 : 0
  if (rule !== "stage_start" && days === 0) return null
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function saveProjectStageSelectionAction(
  input: ProjectStageSelectionInput,
): Promise<StageActionResult> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const project = await projectOrganization(input.projectId)
    const requestedStageIds = uniqueIds(input.selectedTemplateStageIds)
    const requestedTermIds = uniqueIds(input.selectedTemplateTermIds)
    const requestedSubtermIds = uniqueIds(input.selectedTemplateSubtermIds)
    if (!requestedStageIds || !requestedTermIds || !requestedSubtermIds) {
      return { ok: false, error: "Select a valid project workflow configuration." }
    }

    const admin = createAdminClient()
    const [
      { data: libraryStages, error: libraryStageError },
      { data: libraryTerms, error: libraryTermError },
      { data: existingStages, error: existingStageError },
    ] = await Promise.all([
      admin
        .from("stages")
        .select("id, name, description, sort_order, is_active")
        .eq("organization_id", project.supervising_organization_id)
        .order("sort_order", { ascending: true }),
      admin
        .from("stage_terms")
        .select("id, stage_id, parent_term_id, report_name, is_required, responsible_organization_id, responsible_user_id, due_date_rule, approval_required, template_reference, response_type, instructions, status, sort_order, stages!inner(organization_id)")
        .eq("stages.organization_id", project.supervising_organization_id)
        .order("sort_order", { ascending: true }),
      admin
        .from("project_stages")
        .select("id, template_stage_id, status")
        .eq("project_id", input.projectId),
    ])
    if (libraryStageError) throw libraryStageError
    if (libraryTermError) throw libraryTermError
    if (existingStageError) throw existingStageError

    let projectStages = existingStages ?? []
    const existingStageByTemplate = new Map<string, any>(
      projectStages
        .filter((stage: any) => stage.template_stage_id)
        .map((stage: any) => [stage.template_stage_id as string, stage]),
    )
    const libraryStageById = new Map<string, any>((libraryStages ?? []).map((stage: any) => [stage.id as string, stage]))
    const libraryTermById = new Map<string, any>((libraryTerms ?? []).map((term: any) => [term.id as string, term]))

    const allRequestedDefinitionIds = [...requestedTermIds, ...requestedSubtermIds]
    if (requestedStageIds.some((id) => !libraryStageById.has(id) || (libraryStageById.get(id)?.is_active === false && !existingStageByTemplate.has(id)))) {
      return { ok: false, error: "One or more selected stages are unavailable." }
    }
    if (allRequestedDefinitionIds.some((id) => {
      const definition = libraryTermById.get(id)
      return !definition || (definition.status === "disabled" && !existingStageByTemplate.has(definition.stage_id))
    })) {
      return { ok: false, error: "One or more selected terms are unavailable." }
    }
    if (requestedTermIds.some((id) => libraryTermById.get(id)?.parent_term_id)) {
      return { ok: false, error: "A Sub-term was submitted as a parent Term." }
    }
    if (requestedSubtermIds.some((id) => !libraryTermById.get(id)?.parent_term_id)) {
      return { ok: false, error: "A parent Term was submitted as a Sub-term." }
    }

    const neededStageIds = new Set(requestedStageIds)
    for (const id of allRequestedDefinitionIds) {
      const definition = libraryTermById.get(id)
      if (definition) neededStageIds.add(definition.stage_id)
    }

    const missingStageRows = Array.from(neededStageIds)
      .filter((id) => !existingStageByTemplate.has(id))
      .map((id) => {
        const definition = libraryStageById.get(id)
        if (!definition || definition.is_active === false) return null
        return {
          project_id: input.projectId,
          template_stage_id: definition.id,
          name: definition.name,
          description: definition.description,
          status: requestedStageIds.includes(definition.id) ? "not_started" : "disabled",
          sort_order: definition.sort_order,
        }
      })
      .filter(Boolean)
    if (missingStageRows.length) {
      const { error } = await admin.from("project_stages").insert(missingStageRows)
      if (error && !isUniqueViolation(error)) throw error
      const { data, error: reloadError } = await admin
        .from("project_stages")
        .select("id, template_stage_id, status")
        .eq("project_id", input.projectId)
      if (reloadError) throw reloadError
      projectStages = data ?? []
    }

    const projectStageByTemplate = new Map<string, any>(
      projectStages
        .filter((stage: any) => stage.template_stage_id)
        .map((stage: any) => [stage.template_stage_id as string, stage]),
    )
    const projectStageIds = projectStages.map((stage: any) => stage.id as string)
    const { data: currentTerms, error: currentTermsError } = projectStageIds.length
      ? await admin
          .from("project_stage_terms")
          .select("id, project_stage_id, template_term_id, parent_term_id, is_active")
          .in("project_stage_id", projectStageIds)
      : { data: [], error: null }
    if (currentTermsError) throw currentTermsError
    let projectTerms = currentTerms ?? []
    let projectTermByTemplate = new Map<string, any>(
      projectTerms
        .filter((term: any) => term.template_term_id)
        .map((term: any) => [term.template_term_id as string, term]),
    )

    const requiredParentTemplateIds = new Set(requestedTermIds)
    for (const subtermId of requestedSubtermIds) {
      const parentId = libraryTermById.get(subtermId)?.parent_term_id
      if (parentId) requiredParentTemplateIds.add(parentId)
    }

    const missingParents = Array.from(requiredParentTemplateIds)
      .filter((id) => !projectTermByTemplate.has(id))
      .map((id) => {
        const definition = libraryTermById.get(id)
        const projectStage = definition ? projectStageByTemplate.get(definition.stage_id) : null
        if (!definition || definition.parent_term_id || !projectStage || definition.status === "disabled") return null
        return {
          project_stage_id: projectStage.id,
          template_term_id: definition.id,
          parent_term_id: null,
          report_name: definition.report_name,
          is_required: definition.is_required,
          responsible_organization_id: definition.responsible_organization_id,
          responsible_user_id: definition.responsible_user_id,
          due_date_rule: definition.due_date_rule,
          due_date: dueDateFromRule(project.created_at, definition.due_date_rule),
          approval_required: definition.approval_required,
          template_reference: definition.template_reference,
          response_type: isSubtermResponseType(definition.response_type) ? definition.response_type : "combined",
          instructions: definition.instructions,
          status: "not_started",
          sort_order: definition.sort_order,
          is_active: requestedTermIds.includes(definition.id),
        }
      })
      .filter(Boolean)
    if (missingParents.length) {
      const { error } = await admin.from("project_stage_terms").insert(missingParents)
      if (error && !isUniqueViolation(error)) throw error
      const { data, error: reloadError } = await admin
        .from("project_stage_terms")
        .select("id, project_stage_id, template_term_id, parent_term_id, is_active")
        .in("project_stage_id", projectStageIds)
      if (reloadError) throw reloadError
      projectTerms = data ?? []
      projectTermByTemplate = new Map(
        projectTerms
          .filter((term: any) => term.template_term_id)
          .map((term: any) => [term.template_term_id as string, term]),
      )
    }

    const missingChildren = requestedSubtermIds
      .filter((id) => !projectTermByTemplate.has(id))
      .map((id) => {
        const definition = libraryTermById.get(id)
        const projectStage = definition ? projectStageByTemplate.get(definition.stage_id) : null
        const projectParent = definition?.parent_term_id ? projectTermByTemplate.get(definition.parent_term_id) : null
        if (!definition || !definition.parent_term_id || !projectStage || !projectParent || definition.status === "disabled") return null
        return {
          project_stage_id: projectStage.id,
          template_term_id: definition.id,
          parent_term_id: projectParent.id,
          report_name: definition.report_name,
          is_required: definition.is_required,
          responsible_organization_id: definition.responsible_organization_id,
          responsible_user_id: definition.responsible_user_id,
          due_date_rule: definition.due_date_rule,
          due_date: dueDateFromRule(project.created_at, definition.due_date_rule),
          approval_required: definition.approval_required,
          template_reference: definition.template_reference,
          response_type: isSubtermResponseType(definition.response_type) ? definition.response_type : "combined",
          instructions: definition.instructions,
          status: "not_started",
          sort_order: definition.sort_order,
          is_active: true,
        }
      })
      .filter(Boolean)
    if (missingChildren.length) {
      const { error } = await admin.from("project_stage_terms").insert(missingChildren)
      if (error && !isUniqueViolation(error)) throw error
      const { data, error: reloadError } = await admin
        .from("project_stage_terms")
        .select("id, project_stage_id, template_term_id, parent_term_id, is_active")
        .in("project_stage_id", projectStageIds)
      if (reloadError) throw reloadError
      projectTerms = data ?? []
      projectTermByTemplate = new Map(
        projectTerms
          .filter((term: any) => term.template_term_id)
          .map((term: any) => [term.template_term_id as string, term]),
      )
    }

    const selectedStageSet = new Set(requestedStageIds)
    for (const projectStage of projectStages) {
      const shouldEnable = projectStage.template_stage_id
        ? selectedStageSet.has(projectStage.template_stage_id) || selectedStageSet.has(projectStage.id)
        : selectedStageSet.has(projectStage.id)
      const nextStatus = shouldEnable
        ? projectStage.status === "disabled" ? await deriveProjectStageStatus(projectStage.id) : projectStage.status
        : "disabled"
      if (nextStatus !== projectStage.status) {
        const { error } = await admin
          .from("project_stages")
          .update({ status: nextStatus })
          .eq("id", projectStage.id)
          .eq("project_id", input.projectId)
        if (error) throw error
      }
    }

    const selectedTermSet = new Set(requestedTermIds)
    const selectedSubtermSet = new Set(requestedSubtermIds)
    const changedProjectTermIds: string[] = []
    for (const projectTerm of projectTerms) {
      if (!projectTerm.template_term_id) continue
      const definition = libraryTermById.get(projectTerm.template_term_id)
      if (!definition) continue
      const shouldEnable = definition.parent_term_id
        ? selectedSubtermSet.has(projectTerm.template_term_id)
        : selectedTermSet.has(projectTerm.template_term_id)
      if (projectTerm.is_active !== shouldEnable) {
        const { error } = await admin
          .from("project_stage_terms")
          .update({ is_active: shouldEnable })
          .eq("id", projectTerm.id)
        if (error) throw error
        changedProjectTermIds.push(projectTerm.id)
      }
    }

    // Recalculate the existing parent/Stage rollups after visibility changes.
    // The RPC ignores inactive hierarchy items while preserving all historical
    // response and approval records. Sequential execution avoids competing
    // updates when multiple changed Sub-terms share the same parent Term.
    for (const termId of changedProjectTermIds) {
      const { error } = await admin.rpc("refresh_project_stage_rollups", { target_term_id: termId })
      if (error) throw error
    }

    await audit({
      actorId,
      action: "project_stages.configuration_updated",
      entityType: "project",
      entityId: input.projectId,
      projectId: input.projectId,
      metadata: {
        selectedTemplateStageIds: requestedStageIds,
        selectedTemplateTermIds: requestedTermIds,
        selectedTemplateSubtermIds: requestedSubtermIds,
      },
    })
    revalidateProjectStageViews(input.projectId)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not update the project workflow configuration.")
  }
}

export async function createProjectStageAction(input: {
  projectId: string
  name: string
  description?: string
}): Promise<StageActionResult<{ stageId: string }>> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const name = input.name.trim()
    if (!name) return { ok: false, error: "Stage name is required." }

    const admin = createAdminClient()

    const { data: maxStage } = await admin
      .from("project_stages")
      .select("sort_order")
      .eq("project_id", input.projectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()

    const sortOrder = (maxStage?.sort_order ?? 0) + 1

    const { data: newStage, error } = await admin
      .from("project_stages")
      .insert({
        project_id: input.projectId,
        name,
        description: input.description?.trim() || null,
        status: "not_started",
        sort_order: sortOrder,
      })
      .select("id")
      .single()

    if (error) throw error

    await audit({
      actorId,
      action: "project_stage.created",
      entityType: "project_stage",
      entityId: newStage.id,
      projectId: input.projectId,
      metadata: { name },
    })

    revalidateProjectStageViews(input.projectId)
    return { ok: true, data: { stageId: newStage.id } }
  } catch (error) {
    return actionError(error, "Could not create project stage.")
  }
}

