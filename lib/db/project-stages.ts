import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  EMPTY_TERM_RESPONSE_CONTENT,
  sanitizeReportHtml,
  type ProjectStageTermStatus,
  type ResponseStatus,
  type SubtermResponseType,
  type TermResponseContent,
  isSubtermResponseType,
} from "@/lib/stages/execution"
import { roleLabel } from "@/lib/db/types"

export type ProjectStagePerson = {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  role?: string | null
}

export type ProjectStageOrganization = { id: string; name: string }

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
  parentTermId: string | null
  reportName: string
  required: boolean
  responsibleOrganization: ProjectStageOrganization | null
  responsibleUser: ProjectStagePerson | null
  dueDateRule: string
  dueDate: string | null
  approvalRequired: boolean
  templateReference: string | null
  responseType: SubtermResponseType
  instructions: string | null
  status: ProjectStageTermStatus
  sortOrder: number
  isActive: boolean
  hasLinkedData: boolean
  response: ProjectTermResponse | null
  translation: ProjectStageTranslationSummary | null
  subterms: ProjectStageTermExecution[]
}

export type ProjectStageExecution = {
  id: string
  templateStageId: string | null
  name: string
  description: string | null
  status: "not_started" | "in_progress" | "completed" | "disabled"
  sortOrder: number
  terms: ProjectStageTermExecution[]
}

export type ProjectStageSelectionOption = {
  templateStageId: string
  projectStageId: string | null
  name: string
  description: string | null
  sortOrder: number
  active: boolean
  hasData: boolean
}

export type ProjectStageExecutionData = {
  project: { id: string; name: string; code: string | null }
  stages: ProjectStageExecution[]
  availableStages: ProjectStageSelectionOption[]
  canReview: boolean
  canManage: boolean
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

  if (!projectMembership && !orgMembership) return null
  const canManage =
    projectMembership?.access_role === "project_admin" ||
    orgMembership?.role === "org_admin"
  const canReview =
    canManage ||
    projectMembership?.access_role === "project_manager" ||
    projectMembership?.access_role === "reviewer" ||
    projectMembership?.access_role === "approver" ||
    orgMembership?.role === "org_manager"
  return { project, canReview, canManage }
}

function derivedParentStatus(children: ProjectStageTermExecution[]): ProjectStageTermStatus {
  const active = children.filter((child) => child.isActive)
  const required = active.filter((child) => child.required)
  const counted = required.length ? required : active
  if (counted.some((child) => child.status === "rejected")) return "rejected"
  if (counted.some((child) => child.status === "submitted" || child.status === "under_review")) return "under_review"
  if (counted.length && counted.every((child) => child.status === "approved" || child.status === "completed")) return "completed"
  if (counted.some((child) => child.status !== "not_started")) return "in_progress"
  return "not_started"
}

export async function loadProjectStageExecution(projectId: string, userId: string): Promise<ProjectStageExecutionData | null> {
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
  const { data: allTerms, error: termsError } = stageIds.length
    ? await admin
        .from("project_stage_terms")
        .select("id, project_stage_id, parent_term_id, report_name, is_required, responsible_organization_id, responsible_user_id, due_date_rule, due_date, approval_required, template_reference, response_type, instructions, status, sort_order, is_active")
        .in("project_stage_id", stageIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null }
  if (termsError) throw termsError

  const termRows = allTerms ?? []
  const termIds = termRows.map((term: any) => term.id as string)
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
      ? admin.from("response_attachments").select("id, response_id, storage_path, original_filename, mime_type, size_bytes, attachment_kind, sort_order, created_at").in("response_id", responseIds).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    responseIds.length
      ? admin.from("approvals").select("id, response_id, reviewer_id, decision, comments, decided_at").in("response_id", responseIds).order("decided_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    responseIds.length
      ? admin.from("translation_documents").select("id, response_id, translation_status, generated_at, original_pdf_url, arabic_pdf_url, bilingual_pdf_url").in("response_id", responseIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const profileIds = Array.from(new Set([
    ...termRows.map((term: any) => term.responsible_user_id).filter(Boolean),
    ...(responses ?? []).map((response: any) => response.created_by).filter(Boolean),
    ...(approvals ?? []).map((approval: any) => approval.reviewer_id).filter(Boolean),
  ])) as string[]
  const organizationIds = Array.from(new Set(termRows.map((term: any) => term.responsible_organization_id).filter(Boolean))) as string[]

  const [{ data: profiles }, { data: organizations }, { data: memberships }] = await Promise.all([
    profileIds.length ? admin.from("profiles").select("id, full_name, email, avatar_url").in("id", profileIds) : Promise.resolve({ data: [] as any[] }),
    organizationIds.length ? admin.from("organizations").select("id, name").in("id", organizationIds) : Promise.resolve({ data: [] as any[] }),
    profileIds.length ? admin.from("organization_memberships").select("user_id, role").in("user_id", profileIds).eq("status", "active") : Promise.resolve({ data: [] as any[] }),
  ])

  const rolesByUser = new Map<string, string>((memberships ?? []).map((membership: any) => [membership.user_id, membership.role]))
  const people = new Map<string, ProjectStagePerson>((profiles ?? []).map((profile: any) => {
    const rawRole = rolesByUser.get(profile.id)
    return [profile.id, {
      id: profile.id,
      name: profile.full_name?.trim() || profile.email || "Project member",
      email: profile.email,
      avatarUrl: profile.avatar_url,
      role: rawRole ? roleLabel(rawRole) : "Admin",
    }]
  }))
  const orgs = new Map<string, ProjectStageOrganization>((organizations ?? []).map((organization: any) => [organization.id, { id: organization.id, name: organization.name }]))

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

  const responseByTerm = new Map<string, ProjectTermResponse>()
  for (const response of responses ?? []) {
    const createdBy = people.get(response.created_by) ?? { id: response.created_by, name: "Project member", email: null, avatarUrl: null }
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

  const termMap = new Map<string, ProjectStageTermExecution>()
  for (const term of termRows) {
    const response = responseByTerm.get(term.id) ?? null
    termMap.set(term.id, {
      id: term.id,
      projectStageId: term.project_stage_id,
      parentTermId: term.parent_term_id,
      reportName: term.report_name,
      required: term.is_required,
      responsibleOrganization: term.responsible_organization_id ? orgs.get(term.responsible_organization_id) ?? null : null,
      responsibleUser: term.responsible_user_id ? people.get(term.responsible_user_id) ?? null : null,
      dueDateRule: term.due_date_rule,
      dueDate: term.due_date,
      approvalRequired: term.approval_required ?? true,
      templateReference: term.template_reference,
      responseType: isSubtermResponseType(term.response_type) ? term.response_type : "combined",
      instructions: typeof term.instructions === "string" && term.instructions.trim() ? term.instructions : null,
      status: term.status,
      sortOrder: term.sort_order,
      isActive: term.is_active !== false,
      hasLinkedData: Boolean(response),
      response,
      translation: response ? translationByResponse.get(response.id) ?? null : null,
      subterms: [],
    })
  }

  for (const term of termMap.values()) {
    if (!term.parentTermId) continue
    const parent = termMap.get(term.parentTermId)
    if (parent) parent.subterms.push(term)
  }
  for (const term of termMap.values()) {
    term.subterms.sort((a, b) => a.sortOrder - b.sortOrder || a.reportName.localeCompare(b.reportName))
    if (term.subterms.some((child) => child.isActive)) term.status = derivedParentStatus(term.subterms)
  }

  const activeStages = stageRows.filter((stage: any) => stage.status !== "disabled")
  const stages: ProjectStageExecution[] = activeStages.map((stage: any) => ({
    id: stage.id,
    templateStageId: stage.template_stage_id,
    name: stage.name,
    description: stage.description,
    status: stage.status,
    sortOrder: stage.sort_order,
    terms: Array.from(termMap.values())
      .filter((term) => term.projectStageId === stage.id && !term.parentTermId && term.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.reportName.localeCompare(b.reportName)),
  }))

  const projectStageByTemplate = new Map(stageRows.filter((stage: any) => stage.template_stage_id).map((stage: any) => [stage.template_stage_id as string, stage]))
  const termCountByStage = new Map<string, number>()
  for (const term of termRows) termCountByStage.set(term.project_stage_id, (termCountByStage.get(term.project_stage_id) ?? 0) + 1)
  const responseTermIds = new Set((responses ?? []).map((response: any) => response.project_stage_term_id as string))
  const responseCountByStage = new Map<string, number>()
  for (const term of termRows) {
    if (responseTermIds.has(term.id)) responseCountByStage.set(term.project_stage_id, (responseCountByStage.get(term.project_stage_id) ?? 0) + 1)
  }

  const availableStages: ProjectStageSelectionOption[] = (libraryStages ?? [])
    .filter((stage: any) => stage.is_active !== false || projectStageByTemplate.has(stage.id))
    .map((stage: any) => {
      const projectStage = projectStageByTemplate.get(stage.id) as any
      return {
        templateStageId: stage.id,
        projectStageId: projectStage?.id ?? null,
        name: stage.name,
        description: stage.description,
        sortOrder: stage.sort_order,
        active: Boolean(projectStage && projectStage.status !== "disabled"),
        hasData: Boolean(projectStage && ((termCountByStage.get(projectStage.id) ?? 0) > 0 || (responseCountByStage.get(projectStage.id) ?? 0) > 0 || projectStage.status === "in_progress" || projectStage.status === "completed")),
      }
    })

  return {
    project: { id: access.project.id, name: access.project.name, code: access.project.code },
    stages,
    availableStages,
    canReview: access.canReview,
    canManage: access.canManage,
    currentUserId: userId,
  }
}

export async function loadProjectStageTerm(projectId: string, termId: string, userId: string) {
  const data = await loadProjectStageExecution(projectId, userId)
  if (!data) return null
  for (const stage of data.stages) {
    for (const term of stage.terms) {
      if (term.id === termId) return { ...data, stage, term, parentTerm: null }
      const subterm = term.subterms.find((item) => item.id === termId && (item.isActive || data.canManage))
      if (subterm) return { ...data, stage, term: subterm, parentTerm: term }
    }
  }
  return null
}
