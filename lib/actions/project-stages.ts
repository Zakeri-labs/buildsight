"use server"

import { revalidatePath } from "next/cache"
import { assertProjectAdmin, assertProjectMember, assertProjectReviewer, audit, AuthzError } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient as createServerClient } from "@/lib/supabase/server"
import {
  EMPTY_STAGE_REPORT_CONTENT,
  STAGE_DOCUMENT_ACCEPTED_MIME_TYPES,
  STAGE_DOCUMENT_MAX_FILE_BYTES,
  STAGE_EVIDENCE_MAX_FILE_BYTES,
  isReportType,
  isStageReportResponseType,
  sanitizeReportHtml,
  type ReportTypeValue,
  type StageReportResponseType,
  type StageReportContent,
} from "@/lib/stages/execution"

export type StageActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

function actionError(error: unknown, fallback: string): StageActionResult<never> {
  return { ok: false, error: error instanceof AuthzError ? error.message : error instanceof Error ? error.message : fallback }
}

function normalizeContent(value: Partial<StageReportContent>): StageReportContent {
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
      : EMPTY_STAGE_REPORT_CONTENT.checklist,
    answer: typeof value.answer === "string" ? value.answer.trim().slice(0, 10_000) : "",
    selection: typeof value.selection === "string" ? value.selection.trim().slice(0, 50) : "",
    measurementValue: typeof value.measurementValue === "string" ? value.measurementValue.trim().slice(0, 100) : "",
    measurementUnit: typeof value.measurementUnit === "string" ? value.measurementUnit.trim().slice(0, 100) : "",
    dateValue: typeof value.dateValue === "string" ? value.dateValue.trim().slice(0, 30) : "",
  }
}

async function stageScope(projectId: string, stageId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("project_stages")
    .select("id, project_id, name, status")
    .eq("id", stageId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Project stage not found.")
  return data
}

function assertActiveStage(stage: { status: string }) {
  if (stage.status === "disabled") throw new Error("This stage is inactive and cannot accept new work.")
}


async function resolveResponsibleUserId(input: {
  projectId: string
  actorId: string
  requestedUserId?: string | null
  existingUserId?: string | null
}) {
  const targetUserId = input.requestedUserId?.trim() || input.existingUserId || input.actorId
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
    throw new Error("Select a valid responsible user.")
  }
  if (targetUserId !== input.actorId && targetUserId !== input.existingUserId) {
    await assertProjectAdmin(input.projectId)
  }

  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("supervising_organization_id")
    .eq("id", input.projectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project) throw new Error("Project not found.")

  const [projectMembershipResult, participantResult, organizationMembershipResult] = await Promise.all([
    admin
      .from("project_user_memberships")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("user_id", targetUserId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    admin
      .from("project_participants")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("key_contact_user_id", targetUserId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    admin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", project.supervising_organization_id)
      .eq("user_id", targetUserId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ])
  if (projectMembershipResult.error) throw projectMembershipResult.error
  if (participantResult.error) throw participantResult.error
  if (organizationMembershipResult.error) throw organizationMembershipResult.error
  if (!projectMembershipResult.data && !participantResult.data && !organizationMembershipResult.data) {
    throw new Error("The responsible user must be active and related to this project.")
  }
  return targetUserId
}

function plainText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim()
}

async function validateConfiguredSubmission(
  admin: ReturnType<typeof createAdminClient>,
  responseType: StageReportResponseType,
  content: StageReportContent,
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

function revalidateProjectStageViews(projectId: string, stageId?: string, responseId?: string) {
  revalidatePath(`/projects/${projectId}/stages`)
  if (stageId) revalidatePath(`/projects/${projectId}/stages/${stageId}`)
  if (stageId && responseId) revalidatePath(`/projects/${projectId}/stages/${stageId}/reports/${responseId}`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/projects")
  revalidatePath("/")
}

export async function saveStageReportAction(input: {
  projectId: string
  stageId: string
  responseId: string
  reportType: ReportTypeValue
  subject?: string
  reportTitle: string
  content: Partial<StageReportContent>
  responsibleUserId?: string | null
  submit?: boolean
  saveStatus?: "draft" | "in_progress"
}): Promise<StageActionResult<{ responseId: string; reportNumber: string; visitNumber: number; status: string }>> {
  try {
    const actorId = await assertProjectMember(input.projectId)
    const stage = await stageScope(input.projectId, input.stageId)
    assertActiveStage(stage)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.responseId)) {
      return { ok: false, error: "Invalid report identifier." }
    }
    const title = input.reportTitle.trim()
    if (!title) return { ok: false, error: "Report title is required." }
    if (!isReportType(input.reportType)) return { ok: false, error: "Select a valid report type." }

    const content = normalizeContent(input.content)
    const admin = createAdminClient()
    const userClient = await createServerClient()
    const { data: existing, error: existingError } = await admin
      .from("term_responses")
      .select("id, report_number, visit_number, status, created_by, responsible_user_id, project_stage_id, approval_required, response_type")
      .eq("id", input.responseId)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing && existing.project_stage_id !== input.stageId) {
      return { ok: false, error: "This report does not belong to the selected stage." }
    }
    if (existing && existing.created_by !== actorId && existing.responsible_user_id !== actorId) await assertProjectAdmin(input.projectId)
    const responsibleUserId = await resolveResponsibleUserId({
      projectId: input.projectId,
      actorId,
      requestedUserId: input.responsibleUserId,
      existingUserId: existing?.responsible_user_id,
    })

    const configuredResponseType: StageReportResponseType = isStageReportResponseType(existing?.response_type) ? existing.response_type : "combined"
    if (input.submit) {
      const validationError = await validateConfiguredSubmission(admin, configuredResponseType, content, input.responseId)
      if (validationError) return { ok: false, error: validationError }
    }
    if (existing && ["approved", "completed"].includes(existing.status)) return { ok: false, error: "This report is finalized and cannot be modified." }
    if (existing && ["submitted", "under_review"].includes(existing.status)) return { ok: false, error: "This report is awaiting review and cannot be edited or resubmitted." }

    const approvalRequired = existing?.approval_required !== false
    const nextStatus = input.submit
      ? approvalRequired ? "submitted" : "completed"
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
        responsible_user_id: responsibleUserId,
        completed_at: input.submit && !approvalRequired ? now : null,
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
          project_stage_id: input.stageId,
          project_stage_term_id: null,
          report_number: reportNumber,
          visit_number: 1,
          report_type: input.reportType,
          subject: input.subject?.trim() || null,
          report_title: title,
          response_content: content,
          status: nextStatus,
          created_by: actorId,
          updated_by: actorId,
          responsible_user_id: responsibleUserId,
          approval_required: true,
          response_type: "combined",
          template_reference: null,
          instructions: null,
          submitted_at: input.submit ? now : null,
          completed_at: null,
        })
        if (!error) {
          created = true
          break
        }
        if (error.code !== "23505") throw error
        const { data: retry, error: retryError } = await admin
          .from("term_responses")
          .select("id, project_id, project_stage_id, report_number, visit_number, status")
          .eq("id", input.responseId)
          .maybeSingle()
        if (retryError) throw retryError
        if (retry) {
          if (retry.project_id !== input.projectId || retry.project_stage_id !== input.stageId) return { ok: false, error: "The report identifier is already in use." }
          return { ok: true, data: { responseId: retry.id, reportNumber: retry.report_number, visitNumber: retry.visit_number, status: retry.status } }
        }
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
      metadata: { stageId: input.stageId, reportNumber, stageName: stage.name, responsibleUserId },
    })
    revalidateProjectStageViews(input.projectId, input.stageId, input.responseId)
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
      .select("id, status, project_stage_id, created_by, responsible_user_id")
      .eq("id", input.responseId)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (responseError) throw responseError
    if (!response) return { ok: false, error: "Report response not found." }
    const stage = await stageScope(input.projectId, response.project_stage_id)
    assertActiveStage(stage)
    if (response.created_by !== actorId && response.responsible_user_id !== actorId) await assertProjectAdmin(input.projectId)
    if (["submitted", "under_review", "approved", "completed"].includes(response.status)) {
      return { ok: false, error: "Attachments cannot be changed while this report is awaiting review or finalized." }
    }

    const prefix = `${input.projectId}/${input.responseId}/`
    const allowedDocuments = STAGE_DOCUMENT_ACCEPTED_MIME_TYPES as readonly string[]
    const rows = input.attachments.map((attachment, index) => {
      if (!attachment.storagePath.startsWith(prefix) || attachment.storagePath.includes("..")) throw new Error("Invalid attachment storage path.")
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
    revalidateProjectStageViews(input.projectId, response.project_stage_id, input.responseId)
    return { ok: true, data: { ids: (data ?? []).map((row: any) => row.id as string) } }
  } catch (error) {
    return actionError(error, "Could not save attachment metadata.")
  }
}

export async function deleteResponseAttachmentAction(input: { projectId: string; attachmentId: string }): Promise<StageActionResult> {
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
      .select("status, project_stage_id")
      .eq("id", attachment.response_id)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (responseError) throw responseError
    if (!response) return { ok: false, error: "Report response not found." }
    assertActiveStage(await stageScope(input.projectId, response.project_stage_id))
    if (["submitted", "under_review", "approved", "completed"].includes(response.status)) {
      return { ok: false, error: "Attachments cannot be changed while this report is awaiting review or finalized." }
    }
    if (attachment.uploaded_by !== actorId) await assertProjectAdmin(input.projectId)
    const { error } = await admin.from("response_attachments").delete().eq("id", input.attachmentId)
    if (error) throw error
    await admin.storage.from("project-stage-evidence").remove([attachment.storage_path])
    revalidateProjectStageViews(input.projectId, response.project_stage_id, attachment.response_id)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not delete the attachment.")
  }
}

export async function decideStageReportAction(input: {
  projectId: string
  responseId: string
  decision: "approved" | "rejected"
  comments?: string
}): Promise<StageActionResult> {
  try {
    const reviewerId = await assertProjectReviewer(input.projectId)
    const comments = input.comments?.trim() || null
    if (input.decision === "rejected" && !comments) return { ok: false, error: "Add review comments when rejecting a report." }
    const admin = createAdminClient()
    const { data: response, error: lookupError } = await admin
      .from("term_responses")
      .select("id, project_stage_id, status")
      .eq("id", input.responseId)
      .eq("project_id", input.projectId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!response) return { ok: false, error: "Report response not found." }
    await stageScope(input.projectId, response.project_stage_id)
    if (response.status !== "submitted" && response.status !== "under_review") return { ok: false, error: "Only submitted reports can be approved or rejected." }

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
      metadata: { comments, stageId: response.project_stage_id },
    })
    revalidateProjectStageViews(input.projectId, response.project_stage_id, input.responseId)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not save the review decision.")
  }
}

type ProjectStageSelectionInput = {
  projectId: string
  selectedTemplateStageIds: string[]
}

function uniqueIds(values: string[]) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const unique = Array.from(new Set(values))
  return unique.every((value) => uuid.test(value)) ? unique : null
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505")
}

async function deriveProjectStageStatus(projectStageId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("term_responses")
    .select("status")
    .eq("project_stage_id", projectStageId)
  if (error) throw error
  const reports = data ?? []
  if (!reports.length) return "not_started"
  if (reports.every((report: any) => report.status === "approved" || report.status === "completed")) return "completed"
  return "in_progress"
}

export async function updateProjectStageSelection(input: ProjectStageSelectionInput): Promise<StageActionResult> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const requestedStageIds = uniqueIds(input.selectedTemplateStageIds)
    if (!requestedStageIds) return { ok: false, error: "Invalid stage selection." }
    const admin = createAdminClient()
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, supervising_organization_id")
      .eq("id", input.projectId)
      .maybeSingle()
    if (projectError) throw projectError
    if (!project) return { ok: false, error: "Project not found." }

    const { data: libraryStages, error: libraryError } = await admin
      .from("stages")
      .select("id, name, description, sort_order, is_active")
      .eq("organization_id", project.supervising_organization_id)
    if (libraryError) throw libraryError
    const libraryStageById = new Map<string, any>((libraryStages ?? []).map((stage: any) => [stage.id as string, stage]))
    if (requestedStageIds.some((id) => !libraryStageById.has(id) || libraryStageById.get(id)?.is_active === false)) {
      return { ok: false, error: "One or more selected stages are unavailable." }
    }

    let { data: projectStages, error: projectStagesError } = await admin
      .from("project_stages")
      .select("id, template_stage_id, status")
      .eq("project_id", input.projectId)
    if (projectStagesError) throw projectStagesError
    projectStages = projectStages ?? []
    const existingByTemplate = new Map<string, any>(
      projectStages.filter((stage: any) => stage.template_stage_id).map((stage: any) => [stage.template_stage_id as string, stage]),
    )

    const missing = requestedStageIds
      .filter((id) => !existingByTemplate.has(id))
      .map((id) => {
        const definition = libraryStageById.get(id)
        return {
          project_id: input.projectId,
          template_stage_id: definition.id,
          name: definition.name,
          description: definition.description,
          status: "not_started",
          sort_order: definition.sort_order,
        }
      })
    if (missing.length) {
      const { error } = await admin.from("project_stages").insert(missing)
      if (error && !isUniqueViolation(error)) throw error
      const reload = await admin.from("project_stages").select("id, template_stage_id, status").eq("project_id", input.projectId)
      if (reload.error) throw reload.error
      projectStages = reload.data ?? []
    }

    const selected = new Set(requestedStageIds)
    for (const stage of projectStages) {
      if (!stage.template_stage_id) continue
      const shouldEnable = selected.has(stage.template_stage_id)
      const nextStatus = shouldEnable
        ? stage.status === "disabled" ? await deriveProjectStageStatus(stage.id) : stage.status
        : "disabled"
      if (nextStatus !== stage.status) {
        const { error } = await admin.from("project_stages").update({ status: nextStatus }).eq("id", stage.id).eq("project_id", input.projectId)
        if (error) throw error
      }
    }

    await audit({
      actorId,
      action: "project_stages.configuration_updated",
      entityType: "project",
      entityId: input.projectId,
      projectId: input.projectId,
      metadata: { selectedTemplateStageIds: requestedStageIds },
    })
    revalidateProjectStageViews(input.projectId)
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not update the project stage configuration.")
  }
}
