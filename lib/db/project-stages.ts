import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  EMPTY_TERM_RESPONSE_CONTENT,
  sanitizeReportHtml,
  type ProjectStageTermStatus,
  type ResponseStatus,
  type TermResponseContent,
} from "@/lib/stages/execution"

import { roleLabel } from "@/lib/db/types"

export type ProjectStagePerson = {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  role?: string | null
}

export type ProjectStageOrganization = {
  id: string
  name: string
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

export type ProjectTermResponse = {
  id: string
  reportNumber: string
  visitNumber: number
  reportType: string
  subject: string | null
  reportTitle: string
  content: TermResponseContent
  status: ResponseStatus
  createdBy: ProjectStagePerson
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  completedAt: string | null
  attachments: ProjectStageAttachment[]
  approvals: ProjectStageApproval[]
}

export type ProjectStageTranslationSummary = {
  id: string
  status: "pending" | "completed" | "failed"
  generatedAt: string | null
  originalPdfPath: string | null
  arabicPdfPath: string | null
  bilingualPdfPath: string | null
}

export type ProjectStageTermExecution = {
  id: string
  projectStageId: string
  reportName: string
  required: boolean
  responsibleOrganization: ProjectStageOrganization | null
  responsibleUser: ProjectStagePerson | null
  dueDateRule: string
  dueDate: string | null
  approvalRequired: boolean
  templateReference: string | null
  status: ProjectStageTermStatus
  sortOrder: number
  response: ProjectTermResponse | null
  translation: ProjectStageTranslationSummary | null
}

export type ProjectStageExecution = {
  id: string
  name: string
  description: string | null
  status: "not_started" | "in_progress" | "completed" | "disabled"
  sortOrder: number
  terms: ProjectStageTermExecution[]
}

export type ProjectStageExecutionData = {
  project: { id: string; name: string; code: string | null }
  stages: ProjectStageExecution[]
  canReview: boolean
  currentUserId: string
}

function parseContent(value: unknown): TermResponseContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_TERM_RESPONSE_CONTENT
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
            notes: typeof item.notes === "string" ? item.notes : undefined,
          }))
      : [],
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

  const [{ data: projectMembership }, { data: orgMembership }] = await Promise.all([
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

  const canAccess = Boolean(projectMembership || orgMembership)
  if (!canAccess) return null
  const canReview =
    projectMembership?.access_role === "project_admin" ||
    projectMembership?.access_role === "project_manager" ||
    projectMembership?.access_role === "reviewer" ||
    projectMembership?.access_role === "approver" ||
    orgMembership?.role === "org_admin" ||
    orgMembership?.role === "org_manager"

  return { project, canReview }
}

export async function loadProjectStageExecution(projectId: string, userId: string): Promise<ProjectStageExecutionData | null> {
  const access = await projectAccess(projectId, userId)
  if (!access) return null
  const admin = createAdminClient()

  const { data: stages, error: stagesError } = await admin
    .from("project_stages")
    .select("id, name, description, status, sort_order")
    .eq("project_id", projectId)
    .neq("status", "disabled")
    .order("sort_order", { ascending: true })
  if (stagesError) throw stagesError

  const stageIds = (stages ?? []).map((stage: any) => stage.id as string)
  const { data: terms, error: termsError } = stageIds.length
    ? await admin
        .from("project_stage_terms")
        .select("id, project_stage_id, report_name, is_required, responsible_organization_id, responsible_user_id, due_date_rule, due_date, approval_required, template_reference, status, sort_order")
        .in("project_stage_id", stageIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null }
  if (termsError) throw termsError

  const termIds = (terms ?? []).map((term: any) => term.id as string)
  const { data: responses, error: responseError } = termIds.length
    ? await admin
        .from("term_responses")
        .select("id, project_stage_term_id, report_number, visit_number, report_type, subject, report_title, response_content, status, created_by, created_at, updated_at, submitted_at, completed_at")
        .in("project_stage_term_id", termIds)
    : { data: [], error: null }
  if (responseError) throw responseError

  const responseIds = (responses ?? []).map((response: any) => response.id as string)
  const [{ data: attachments }, { data: approvals }, { data: translations }] = await Promise.all([
    responseIds.length
      ? admin
          .from("response_attachments")
          .select("id, response_id, storage_path, original_filename, mime_type, size_bytes, attachment_kind, sort_order, created_at")
          .in("response_id", responseIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    responseIds.length
      ? admin
          .from("approvals")
          .select("id, response_id, reviewer_id, decision, comments, decided_at")
          .in("response_id", responseIds)
          .order("decided_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    responseIds.length
      ? admin
          .from("translation_documents")
          .select("id, response_id, translation_status, generated_at, original_pdf_url, arabic_pdf_url, bilingual_pdf_url")
          .in("response_id", responseIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const profileIds = Array.from(new Set([
    ...(terms ?? []).map((term: any) => term.responsible_user_id).filter(Boolean),
    ...(responses ?? []).map((response: any) => response.created_by).filter(Boolean),
    ...(approvals ?? []).map((approval: any) => approval.reviewer_id).filter(Boolean),
  ])) as string[]
  const organizationIds = Array.from(new Set((terms ?? []).map((term: any) => term.responsible_organization_id).filter(Boolean))) as string[]

  const [{ data: profiles }, { data: organizations }, { data: memberships }] = await Promise.all([
    profileIds.length
      ? admin.from("profiles").select("id, full_name, email, avatar_url").in("id", profileIds)
      : Promise.resolve({ data: [] as any[] }),
    organizationIds.length
      ? admin.from("organizations").select("id, name").in("id", organizationIds)
      : Promise.resolve({ data: [] as any[] }),
    profileIds.length
      ? admin.from("organization_memberships").select("user_id, role").in("user_id", profileIds).eq("status", "active")
      : Promise.resolve({ data: [] as any[] }),
  ])

  const rolesByUser = new Map<string, string>((memberships ?? []).map((m: any) => [m.user_id, m.role]))

  const people = new Map<string, ProjectStagePerson>((profiles ?? []).map((profile: any) => {
    const rawRole = rolesByUser.get(profile.id)
    return [
      profile.id,
      {
        id: profile.id,
        name: profile.full_name?.trim() || profile.email || "Project member",
        email: profile.email,
        avatarUrl: profile.avatar_url,
        role: rawRole ? roleLabel(rawRole) : "Organization Admin",
      },
    ]
  }))
  const orgs = new Map<string, ProjectStageOrganization>((organizations ?? []).map((organization: any) => [
    organization.id,
    { id: organization.id, name: organization.name },
  ]))

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
    const reviewer = people.get(approval.reviewer_id) ?? {
      id: approval.reviewer_id,
      name: "Reviewer",
      email: null,
      avatarUrl: null,
    }
    const items = approvalByResponse.get(approval.response_id) ?? []
    items.push({
      id: approval.id,
      decision: approval.decision,
      comments: approval.comments,
      decidedAt: approval.decided_at,
      reviewer,
    })
    approvalByResponse.set(approval.response_id, items)
  }

  const translationByResponse = new Map<string, ProjectStageTranslationSummary>()
  for (const translation of translations ?? []) {
    const status = translation.translation_status === "completed" || translation.translation_status === "failed"
      ? translation.translation_status
      : "pending"
    translationByResponse.set(translation.response_id, {
      id: translation.id,
      status,
      generatedAt: translation.generated_at,
      originalPdfPath: translation.original_pdf_url,
      arabicPdfPath: translation.arabic_pdf_url,
      bilingualPdfPath: translation.bilingual_pdf_url,
    })
  }

  const responseByTerm = new Map<string, ProjectTermResponse>()
  for (const response of responses ?? []) {
    const createdBy = people.get(response.created_by) ?? {
      id: response.created_by,
      name: "Project member",
      email: null,
      avatarUrl: null,
    }
    responseByTerm.set(response.project_stage_term_id, {
      id: response.id,
      reportNumber: response.report_number,
      visitNumber: response.visit_number,
      reportType: response.report_type,
      subject: response.subject,
      reportTitle: response.report_title,
      content: parseContent(response.response_content),
      status: response.status,
      createdBy,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
      submittedAt: response.submitted_at,
      completedAt: response.completed_at,
      attachments: attachmentByResponse.get(response.id) ?? [],
      approvals: approvalByResponse.get(response.id) ?? [],
    })
  }

  const termsByStage = new Map<string, ProjectStageTermExecution[]>()
  for (const term of terms ?? []) {
    const list = termsByStage.get(term.project_stage_id) ?? []
    const response = responseByTerm.get(term.id) ?? null
    list.push({
      id: term.id,
      projectStageId: term.project_stage_id,
      reportName: term.report_name,
      required: term.is_required,
      responsibleOrganization: term.responsible_organization_id ? orgs.get(term.responsible_organization_id) ?? null : null,
      responsibleUser: term.responsible_user_id ? people.get(term.responsible_user_id) ?? null : null,
      dueDateRule: term.due_date_rule,
      dueDate: term.due_date,
      approvalRequired: term.approval_required,
      templateReference: term.template_reference,
      status: term.status,
      sortOrder: term.sort_order,
      response,
      translation: response ? translationByResponse.get(response.id) ?? null : null,
    })
    termsByStage.set(term.project_stage_id, list)
  }

  return {
    project: { id: access.project.id, name: access.project.name, code: access.project.code },
    stages: (stages ?? []).map((stage: any) => ({
      id: stage.id,
      name: stage.name,
      description: stage.description,
      status: stage.status,
      sortOrder: stage.sort_order,
      terms: termsByStage.get(stage.id) ?? [],
    })),
    canReview: access.canReview,
    currentUserId: userId,
  }
}

export async function loadProjectStageTerm(projectId: string, termId: string, userId: string) {
  const data = await loadProjectStageExecution(projectId, userId)
  if (!data) return null
  for (const stage of data.stages) {
    const term = stage.terms.find((item) => item.id === termId)
    if (term) return { ...data, stage, term }
  }
  return null
}
