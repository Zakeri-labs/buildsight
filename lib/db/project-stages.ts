import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  EMPTY_STAGE_REPORT_CONTENT,
  sanitizeReportHtml,
  type ResponseStatus,
  type StageReportResponseType,
  type StageReportContent,
  isStageReportResponseType,
} from "@/lib/stages/execution"
import { roleLabel } from "@/lib/db/types"

export type ProjectStagePerson = {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  role?: string | null
}

export type ProjectStageApproval = {
  id: string
  decision: "approved" | "rejected"
  comments: string | null
  decidedAt: string
  reviewer: ProjectStagePerson
}

export type ProjectStageAttachment = {
  id: string
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  attachmentKind: "evidence_image" | "document" | "inline_image"
  sortOrder: number
  createdAt: string
}

export type ProjectStageTranslationSummary = {
  id: string
  status: "pending" | "completed" | "failed"
  generatedAt: string | null
  originalPdfPath: string | null
  arabicPdfPath: string | null
  bilingualPdfPath: string | null
  translatedContent?: unknown
}

export type ProjectStageReport = {
  id: string
  reportNumber: string
  visitNumber: number
  reportType: string
  subject: string | null
  reportTitle: string
  content: StageReportContent
  status: ResponseStatus
  createdBy: ProjectStagePerson
  responsibleUser: ProjectStagePerson | null
  approvalRequired: boolean
  responseType: StageReportResponseType
  templateReference: string | null
  instructions: string | null
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  completedAt: string | null
  attachments: ProjectStageAttachment[]
  approvals: ProjectStageApproval[]
  translation: ProjectStageTranslationSummary | null
}

export type ProjectStageExecution = {
  id: string
  templateStageId: string | null
  name: string
  description: string | null
  status: "not_started" | "in_progress" | "completed" | "disabled"
  sortOrder: number
  reports: ProjectStageReport[]
  reportSummary: {
    total: number
    draft: number
    inProgress: number
    pendingReview: number
    approved: number
    rejected: number
  }
}

export type ProjectStageSelectionOption = {
  templateStageId: string
  projectStageId: string | null
  name: string
  description: string | null
  sortOrder: number
  active: boolean
  hasData: boolean
  hasPendingReview: boolean
}

export type ProjectStageExecutionData = {
  project: { id: string; name: string; code: string | null }
  stages: ProjectStageExecution[]
  availableStages: ProjectStageSelectionOption[]
  canReview: boolean
  canManage: boolean
  currentUserId: string
}

function parseContent(value: unknown): StageReportContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_STAGE_REPORT_CONTENT
  const row = value as Record<string, unknown>
  return {
    feedback: sanitizeReportHtml(row.feedback),
    observation: sanitizeReportHtml(row.observation),
    findings: sanitizeReportHtml(row.findings),
    recommendations: sanitizeReportHtml(row.recommendations),
    correctiveActions: sanitizeReportHtml(row.correctiveActions),
    checklist: Array.isArray(row.checklist)
      ? row.checklist
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
          .map((item) => ({
            id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
            label: typeof item.label === "string" ? item.label : "Checklist item",
            checked: item.checked === true,
            result: item.result === "pass" || item.result === "fail" || item.result === "na" ? item.result : item.checked === true ? "pass" : "",
            notes: typeof item.notes === "string" ? item.notes : undefined,
          }))
      : [],
    answer: typeof row.answer === "string" ? row.answer.slice(0, 10000) : "",
    selection: typeof row.selection === "string" ? row.selection.slice(0, 50) : "",
    measurementValue: typeof row.measurementValue === "string" ? row.measurementValue.slice(0, 100) : "",
    measurementUnit: typeof row.measurementUnit === "string" ? row.measurementUnit.slice(0, 100) : "",
    dateValue: typeof row.dateValue === "string" ? row.dateValue.slice(0, 30) : "",
  }
}

async function projectAccess(projectId: string, userId: string) {
  const admin = createAdminClient()
  const { data: project, error } = await admin
    .from("projects")
    .select("id, name, code, supervising_organization_id")
    .eq("id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!project) return null

  const [projectMembershipResult, orgMembershipResult] = await Promise.all([
    admin
      .from("project_user_memberships")
      .select("access_role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    admin
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", project.supervising_organization_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
  ])
  if (projectMembershipResult.error) throw projectMembershipResult.error
  if (orgMembershipResult.error) throw orgMembershipResult.error
  const projectMembership = projectMembershipResult.data
  const orgMembership = orgMembershipResult.data

  if (!projectMembership && !orgMembership) return null
  const canManage = projectMembership?.access_role === "project_admin" || orgMembership?.role === "org_admin"
  const canReview =
    canManage ||
    projectMembership?.access_role === "project_manager" ||
    projectMembership?.access_role === "reviewer" ||
    projectMembership?.access_role === "approver" ||
    orgMembership?.role === "org_manager"
  return { project, canReview, canManage }
}

function reportSummary(reports: ProjectStageReport[]) {
  return {
    total: reports.length,
    draft: reports.filter((item) => item.status === "draft").length,
    inProgress: reports.filter((item) => item.status === "in_progress").length,
    pendingReview: reports.filter((item) => item.status === "submitted" || item.status === "under_review").length,
    approved: reports.filter((item) => item.status === "approved" || item.status === "completed").length,
    rejected: reports.filter((item) => item.status === "rejected").length,
  }
}

export async function loadProjectStageExecution(
  projectId: string,
  userId: string,
  includeInactiveForReview = false,
): Promise<ProjectStageExecutionData | null> {
  const access = await projectAccess(projectId, userId)
  if (!access) return null
  const admin = createAdminClient()

  const [{ data: allStages, error: stagesError }, { data: libraryStages, error: libraryError }] = await Promise.all([
    admin
      .from("project_stages")
      .select("id, template_stage_id, name, description, status, sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    admin
      .from("stages")
      .select("id, name, description, sort_order, is_active")
      .eq("organization_id", access.project.supervising_organization_id)
      .order("sort_order", { ascending: true }),
  ])
  if (stagesError) throw stagesError
  if (libraryError) throw libraryError

  const stageRows = allStages ?? []
  const stageIds = stageRows.map((stage: any) => stage.id as string)
  const { data: responseRows, error: responseError } = stageIds.length
    ? await admin
        .from("term_responses")
        .select("id, project_stage_id, report_number, visit_number, report_type, subject, report_title, response_content, status, created_by, responsible_user_id, approval_required, response_type, template_reference, instructions, created_at, updated_at, submitted_at, completed_at")
        .in("project_stage_id", stageIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null }
  if (responseError) throw responseError

  const responseIds = (responseRows ?? []).map((response: any) => response.id as string)
  const [{ data: attachments, error: attachmentError }, { data: approvals, error: approvalError }, { data: translations, error: translationError }] = await Promise.all([
    responseIds.length
      ? admin.from("response_attachments").select("id, response_id, storage_path, original_filename, mime_type, size_bytes, attachment_kind, sort_order, created_at").in("response_id", responseIds).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as any[], error: null }),
    responseIds.length
      ? admin.from("approvals").select("id, response_id, reviewer_id, decision, comments, decided_at").in("response_id", responseIds).order("decided_at", { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null }),
    responseIds.length
      ? admin.from("translation_documents").select("id, response_id, translation_status, generated_at, original_pdf_url, arabic_pdf_url, bilingual_pdf_url").in("response_id", responseIds)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (attachmentError) throw attachmentError
  if (approvalError) throw approvalError
  if (translationError) throw translationError

  const profileIds = Array.from(new Set([
    ...(responseRows ?? []).flatMap((response: any) => [response.created_by, response.responsible_user_id]).filter(Boolean),
    ...(approvals ?? []).map((approval: any) => approval.reviewer_id).filter(Boolean),
  ])) as string[]

  const [{ data: profiles, error: profileError }, { data: memberships, error: membershipError }] = await Promise.all([
    profileIds.length
      ? admin.from("profiles").select("id, full_name, email, avatar_url").in("id", profileIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    profileIds.length
      ? admin.from("organization_memberships").select("user_id, role").in("user_id", profileIds).eq("status", "active")
      : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (profileError) throw profileError
  if (membershipError) throw membershipError

  const rolesByUser = new Map<string, string>((memberships ?? []).map((membership: any) => [membership.user_id, membership.role]))
  const people = new Map<string, ProjectStagePerson>((profiles ?? []).map((profile: any) => {
    const rawRole = rolesByUser.get(profile.id)
    return [profile.id, {
      id: profile.id,
      name: profile.full_name?.trim() || profile.email || "Project member",
      email: profile.email,
      avatarUrl: profile.avatar_url,
      role: rawRole ? roleLabel(rawRole) : "Project Member",
    }]
  }))

  const attachmentByResponse = new Map<string, ProjectStageAttachment[]>()
  for (const attachment of attachments ?? []) {
    const items = attachmentByResponse.get(attachment.response_id) ?? []
    items.push({
      id: attachment.id,
      storagePath: attachment.storage_path,
      originalFilename: attachment.original_filename,
      mimeType: attachment.mime_type,
      sizeBytes: Number(attachment.size_bytes),
      attachmentKind: attachment.attachment_kind,
      sortOrder: attachment.sort_order,
      createdAt: attachment.created_at,
    })
    attachmentByResponse.set(attachment.response_id, items)
  }

  const approvalByResponse = new Map<string, ProjectStageApproval[]>()
  for (const approval of approvals ?? []) {
    const reviewer = people.get(approval.reviewer_id) ?? { id: approval.reviewer_id, name: "Reviewer", email: null, avatarUrl: null }
    const items = approvalByResponse.get(approval.response_id) ?? []
    items.push({ id: approval.id, decision: approval.decision, comments: approval.comments, decidedAt: approval.decided_at, reviewer })
    approvalByResponse.set(approval.response_id, items)
  }

  const translationByResponse = new Map<string, ProjectStageTranslationSummary>()
  for (const translation of translations ?? []) {
    const status = translation.translation_status === "completed" || translation.translation_status === "failed" ? translation.translation_status : "pending"
    translationByResponse.set(translation.response_id, {
      id: translation.id,
      status,
      generatedAt: translation.generated_at,
      originalPdfPath: translation.original_pdf_url,
      arabicPdfPath: translation.arabic_pdf_url,
      bilingualPdfPath: translation.bilingual_pdf_url,
    })
  }

  const reportsByStage = new Map<string, ProjectStageReport[]>()
  for (const response of responseRows ?? []) {
    const createdBy = people.get(response.created_by) ?? { id: response.created_by, name: "Project member", email: null, avatarUrl: null }
    const responsibleUser = response.responsible_user_id ? people.get(response.responsible_user_id) ?? null : createdBy
    const mapped: ProjectStageReport = {
      id: response.id,
      reportNumber: response.report_number,
      visitNumber: response.visit_number,
      reportType: response.report_type,
      subject: response.subject,
      reportTitle: response.report_title,
      content: parseContent(response.response_content),
      status: response.status,
      createdBy,
      responsibleUser,
      approvalRequired: response.approval_required !== false,
      responseType: isStageReportResponseType(response.response_type) ? response.response_type : "combined",
      templateReference: response.template_reference,
      instructions: response.instructions,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
      submittedAt: response.submitted_at,
      completedAt: response.completed_at,
      attachments: attachmentByResponse.get(response.id) ?? [],
      approvals: approvalByResponse.get(response.id) ?? [],
      translation: translationByResponse.get(response.id) ?? null,
    }
    const items = reportsByStage.get(response.project_stage_id) ?? []
    items.push(mapped)
    reportsByStage.set(response.project_stage_id, items)
  }
  for (const items of reportsByStage.values()) items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  const includeInactive = includeInactiveForReview && access.canReview
  const visibleStages = includeInactive ? stageRows : stageRows.filter((stage: any) => stage.status !== "disabled")
  const stages: ProjectStageExecution[] = visibleStages.map((stage: any) => {
    const reports = reportsByStage.get(stage.id) ?? []
    return {
      id: stage.id,
      templateStageId: stage.template_stage_id,
      name: stage.name,
      description: stage.description,
      status: stage.status,
      sortOrder: stage.sort_order,
      reports,
      reportSummary: reportSummary(reports),
    }
  })

  const projectStageByTemplate = new Map<string, any>(
    stageRows.filter((stage: any) => stage.template_stage_id).map((stage: any) => [stage.template_stage_id as string, stage]),
  )
  const availableStages: ProjectStageSelectionOption[] = (libraryStages ?? [])
    .filter((stage: any) => stage.is_active !== false || projectStageByTemplate.has(stage.id))
    .map((stage: any) => {
      const projectStage = projectStageByTemplate.get(stage.id)
      const reports = projectStage ? reportsByStage.get(projectStage.id) ?? [] : []
      return {
        templateStageId: stage.id,
        projectStageId: projectStage?.id ?? null,
        name: stage.name,
        description: stage.description,
        sortOrder: stage.sort_order,
        active: Boolean(projectStage && projectStage.status !== "disabled"),
        hasData: reports.length > 0 || Boolean(projectStage && ["in_progress", "completed"].includes(projectStage.status)),
        hasPendingReview: reports.some((report) => report.status === "submitted" || report.status === "under_review"),
      }
    })

  return {
    project: { id: access.project.id, name: access.project.name, code: access.project.code },
    stages,
    availableStages: access.canManage ? availableStages : [],
    canReview: access.canReview,
    canManage: access.canManage,
    currentUserId: userId,
  }
}

export async function loadProjectStage(projectId: string, stageId: string, userId: string) {
  const data = await loadProjectStageExecution(projectId, userId, true)
  if (!data) return null
  const stage = data.stages.find((item) => item.id === stageId)
  if (!stage) return null
  return { ...data, stage }
}

export async function loadNextProjectVisitNumber(projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("term_responses")
    .select("visit_number")
    .eq("project_id", projectId)
    .order("visit_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data?.visit_number ?? 0) + 1
}

export async function loadProjectStageReport(projectId: string, stageId: string, reportId: string, userId: string) {
  const execution = await loadProjectStage(projectId, stageId, userId)
  if (!execution) return null
  const response = execution.stage.reports.find((item) => item.id === reportId)
  if (!response) return null
  return { ...execution, response }
}
