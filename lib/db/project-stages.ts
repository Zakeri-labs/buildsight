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
  getFallbackStageChecklist,
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
  projectStageTermId: string | null
  responsibleUser: ProjectStagePerson | null
  approvalRequired: boolean
  responseType: SubtermResponseType
  templateReference: string | null
  instructions: string | null
  createdBy: ProjectStagePerson
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  completedAt: string | null
  attachments: ProjectStageAttachment[]
  approvals: ProjectStageApproval[]
  translation: ProjectStageTranslationSummary | null
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

export type ProjectStageTermExecution = {
  id: string
  projectStageId: string
  templateTermId: string | null
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
  responses: ProjectTermResponse[]
  reportSummary: { total: number; draft: number; inProgress: number; pendingReview: number; approved: number; rejected: number }
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
  reports: ProjectTermResponse[]
  reportSummary: { total: number; draft: number; inProgress: number; pendingReview: number; approved: number; rejected: number }
  terms: ProjectStageTermExecution[]
}

export type ProjectTermSelectionOption = {
  templateTermId: string
  projectTermId: string | null
  parentTemplateTermId: string | null
  name: string
  required: boolean
  responseType: SubtermResponseType
  sortOrder: number
  active: boolean
  hasData: boolean
  hasPendingReview: boolean
  subterms: ProjectTermSelectionOption[]
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
  terms: ProjectTermSelectionOption[]
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
            result: item.result === "pass" || item.result === "fail" || item.result === "na" || item.result === "in_progress" ? item.result : item.checked === true ? "pass" : "",
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

export async function loadProjectStageExecution(
  projectId: string,
  userId: string,
  includeInactiveForReview = false,
): Promise<ProjectStageExecutionData | null> {
  const access = await projectAccess(projectId, userId)
  if (!access) return null
  const admin = createAdminClient()

  const [
    { data: allStages, error: stagesError },
    { data: libraryStages, error: libraryError },
    { data: libraryTerms, error: libraryTermsError },
  ] = await Promise.all([
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
    admin
      .from("stage_terms")
      .select("id, stage_id, parent_term_id, report_name, is_required, response_type, status, sort_order, stages!inner(organization_id)")
      .eq("stages.organization_id", access.project.supervising_organization_id)
      .order("sort_order", { ascending: true }),
  ])
  if (stagesError) throw stagesError
  if (libraryError) throw libraryError
  if (libraryTermsError) throw libraryTermsError

  const stageRows = allStages ?? []
  const stageIds = stageRows.map((stage: any) => stage.id as string)
  const { data: allTerms, error: termsError } = stageIds.length
    ? await admin
        .from("project_stage_terms")
        .select("id, project_stage_id, template_term_id, parent_term_id, report_name, is_required, responsible_organization_id, responsible_user_id, due_date_rule, due_date, approval_required, template_reference, response_type, instructions, status, sort_order, is_active")
        .in("project_stage_id", stageIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null }
  if (termsError) throw termsError

  const termRows = allTerms ?? []
  const { data: responses, error: responseError } = stageIds.length
    ? await admin
        .from("term_responses")
        .select("id, project_stage_id, project_stage_term_id, report_number, visit_number, report_type, subject, report_title, response_content, status, responsible_user_id, approval_required, response_type, template_reference, instructions, created_by, created_at, updated_at, submitted_at, completed_at")
        .in("project_stage_id", stageIds)
        .order("created_at", { ascending: false })
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
    ...(responses ?? []).map((response: any) => response.responsible_user_id).filter(Boolean),
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

  const responsesByTerm = new Map<string, ProjectTermResponse[]>()
  const responsesByStage = new Map<string, ProjectTermResponse[]>()
  for (const response of responses ?? []) {
    const createdBy = people.get(response.created_by) ?? { id: response.created_by, name: "Project member", email: null, avatarUrl: null }
    const responsibleUser = response.responsible_user_id ? people.get(response.responsible_user_id) ?? null : null
    const mapped: ProjectTermResponse = {
      id: response.id,
      reportNumber: response.report_number,
      visitNumber: response.visit_number,
      reportType: response.report_type,
      subject: response.subject,
      reportTitle: response.report_title,
      content: parseContent(response.response_content),
      status: response.status,
      projectStageTermId: response.project_stage_term_id,
      responsibleUser,
      approvalRequired: response.approval_required ?? true,
      responseType: isSubtermResponseType(response.response_type) ? response.response_type : "combined",
      templateReference: response.template_reference,
      instructions: typeof response.instructions === "string" && response.instructions.trim() ? response.instructions : null,
      createdBy,
      createdAt: response.created_at,
      updatedAt: response.updated_at,
      submittedAt: response.submitted_at,
      completedAt: response.completed_at,
      attachments: attachmentByResponse.get(response.id) ?? [],
      approvals: approvalByResponse.get(response.id) ?? [],
      translation: translationByResponse.get(response.id) ?? null,
    }
    if (response.project_stage_term_id) {
      const items = responsesByTerm.get(response.project_stage_term_id) ?? []
      items.push(mapped)
      responsesByTerm.set(response.project_stage_term_id, items)
    } else {
      const items = responsesByStage.get(response.project_stage_id) ?? []
      items.push(mapped)
      responsesByStage.set(response.project_stage_id, items)
    }
  }
  for (const items of [...responsesByTerm.values(), ...responsesByStage.values()]) {
    items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  }

  const termMap = new Map<string, ProjectStageTermExecution>()
  for (const term of termRows) {
    const termResponses = responsesByTerm.get(term.id) ?? []
    const response = termResponses[0] ?? null
    termMap.set(term.id, {
      id: term.id,
      projectStageId: term.project_stage_id,
      templateTermId: term.template_term_id,
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
      hasLinkedData: termResponses.length > 0,
      response,
      responses: termResponses,
      reportSummary: {
        total: termResponses.length,
        draft: termResponses.filter((item) => item.status === "draft").length,
        inProgress: termResponses.filter((item) => item.status === "in_progress").length,
        pendingReview: termResponses.filter((item) => item.status === "submitted" || item.status === "under_review").length,
        approved: termResponses.filter((item) => item.status === "approved" || item.status === "completed").length,
        rejected: termResponses.filter((item) => item.status === "rejected").length,
      },
      translation: response?.translation ?? null,
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

  let stages: ProjectStageExecution[] = []

  if (stageRows.length === 0) {
    const libTermsByStage = new Map<string, ProjectStageTermExecution[]>()
    for (const termDef of libraryTerms ?? []) {
      if (termDef.parent_term_id) continue
      const items = libTermsByStage.get(termDef.stage_id) ?? []
      items.push({
        id: termDef.id,
        projectStageId: termDef.stage_id,
        templateTermId: termDef.id,
        parentTermId: null,
        reportName: termDef.report_name,
        required: termDef.is_required,
        responsibleOrganization: null,
        responsibleUser: null,
        dueDateRule: "stage_start",
        dueDate: null,
        approvalRequired: true,
        templateReference: null,
        responseType: isSubtermResponseType(termDef.response_type) ? termDef.response_type : "combined",
        instructions: null,
        status: "not_started",
        sortOrder: termDef.sort_order,
        isActive: true,
        hasLinkedData: false,
        response: null,
        responses: [],
        reportSummary: { total: 0, draft: 0, inProgress: 0, pendingReview: 0, approved: 0, rejected: 0 },
        translation: null,
        subterms: [],
      })
      libTermsByStage.set(termDef.stage_id, items)
    }

    stages = (libraryStages ?? [])
      .filter((stage: any) => stage.is_active !== false)
      .map((stage: any) => ({
        id: stage.id,
        templateStageId: stage.id,
        name: stage.name,
        description: stage.description,
        status: "not_started",
        sortOrder: stage.sort_order,
        reports: [],
        reportSummary: { total: 0, draft: 0, inProgress: 0, pendingReview: 0, approved: 0, rejected: 0 },
        terms: (libTermsByStage.get(stage.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.reportName.localeCompare(b.reportName)),
      }))
  } else {
    const includeInactive = includeInactiveForReview && access.canReview
    const visibleStages = includeInactive ? stageRows : stageRows.filter((stage: any) => stage.status !== "disabled")
    const existingTemplateIds = new Set(stageRows.map((stage: any) => stage.template_stage_id || stage.id))
    const existingIds = new Set(stageRows.map((stage: any) => stage.id))

    const libTermsByStage = new Map<string, ProjectStageTermExecution[]>()
    for (const termDef of libraryTerms ?? []) {
      if (termDef.parent_term_id) continue
      const items = libTermsByStage.get(termDef.stage_id) ?? []
      items.push({
        id: termDef.id,
        projectStageId: termDef.stage_id,
        templateTermId: termDef.id,
        parentTermId: null,
        reportName: termDef.report_name,
        required: termDef.is_required,
        responsibleOrganization: null,
        responsibleUser: null,
        dueDateRule: "stage_start",
        dueDate: null,
        approvalRequired: true,
        templateReference: null,
        responseType: isSubtermResponseType(termDef.response_type) ? termDef.response_type : "combined",
        instructions: null,
        status: "not_started",
        sortOrder: termDef.sort_order,
        isActive: true,
        hasLinkedData: false,
        response: null,
        responses: [],
        reportSummary: { total: 0, draft: 0, inProgress: 0, pendingReview: 0, approved: 0, rejected: 0 },
        translation: null,
        subterms: [],
      })
      libTermsByStage.set(termDef.stage_id, items)
    }

    const mappedStages: ProjectStageExecution[] = visibleStages.map((stage: any) => {
      const stageReports = responsesByStage.get(stage.id) ?? []
      return {
        id: stage.id,
        templateStageId: stage.template_stage_id,
        name: stage.name,
        description: stage.description,
        status: stage.status,
        sortOrder: stage.sort_order,
        reports: stageReports,
        reportSummary: {
          total: stageReports.length,
          draft: stageReports.filter((item) => item.status === "draft").length,
          inProgress: stageReports.filter((item) => item.status === "in_progress").length,
          pendingReview: stageReports.filter((item) => item.status === "submitted" || item.status === "under_review").length,
          approved: stageReports.filter((item) => item.status === "approved" || item.status === "completed").length,
          rejected: stageReports.filter((item) => item.status === "rejected").length,
        },
        terms: (() => {
          const directTerms = Array.from(termMap.values())
            .filter((term) => term.projectStageId === stage.id && !term.parentTermId && (includeInactive || term.isActive))
            .map((term) => (includeInactive ? term : { ...term, subterms: term.subterms.filter((subterm) => subterm.isActive) }))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.reportName.localeCompare(b.reportName))
          if (directTerms.length > 0) return directTerms

          const libTerms = (libTermsByStage.get(stage.template_stage_id || stage.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.reportName.localeCompare(b.reportName))
          if (libTerms.length > 0) return libTerms

          return getFallbackStageChecklist(stage.name).map((item, idx) => ({
            id: item.id,
            projectStageId: stage.id,
            templateTermId: item.id,
            parentTermId: null,
            reportName: item.reportName,
            required: true,
            responsibleOrganization: null,
            responsibleUser: null,
            dueDateRule: "stage_start",
            dueDate: null,
            approvalRequired: true,
            templateReference: null,
            responseType: "combined" as const,
            instructions: null,
            status: "not_started" as const,
            sortOrder: idx + 1,
            isActive: true,
            hasLinkedData: false,
            response: null,
            responses: [],
            reportSummary: { total: 0, draft: 0, inProgress: 0, pendingReview: 0, approved: 0, rejected: 0 },
            translation: null,
            subterms: [],
          }))
        })(),
      }
    })

    for (const stageDef of libraryStages ?? []) {
      if (stageDef.is_active === false) continue
      if (existingTemplateIds.has(stageDef.id) || existingIds.has(stageDef.id)) continue

      mappedStages.push({
        id: stageDef.id,
        templateStageId: stageDef.id,
        name: stageDef.name,
        description: stageDef.description,
        status: "not_started",
        sortOrder: stageDef.sort_order,
        reports: [],
        reportSummary: { total: 0, draft: 0, inProgress: 0, pendingReview: 0, approved: 0, rejected: 0 },
        terms: (libTermsByStage.get(stageDef.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.reportName.localeCompare(b.reportName)),
      })
    }

    mappedStages.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    stages = mappedStages
  }

  const projectStageByTemplate = new Map<string, any>(
    stageRows
      .filter((stage: any) => stage.template_stage_id)
      .map((stage: any) => [stage.template_stage_id as string, stage]),
  )
  const projectTermByTemplate = new Map<string, any>(
    termRows
      .filter((term: any) => term.template_term_id)
      .map((term: any) => [term.template_term_id as string, term]),
  )
  const responseTermIds = new Set<string>((responses ?? []).map((response: any) => response.project_stage_term_id as string))
  const pendingResponseTermIds = new Set<string>((responses ?? [])
    .filter((response: any) => response.status === "submitted" || response.status === "under_review")
    .map((response: any) => response.project_stage_term_id as string))
  const libraryTermDefinitionById = new Map<string, any>(
    (libraryTerms ?? []).map((definition: any) => [definition.id as string, definition]),
  )

  const libraryTermMap = new Map<string, ProjectTermSelectionOption>()
  for (const definition of libraryTerms ?? []) {
    const projectTerm = projectTermByTemplate.get(definition.id)
    libraryTermMap.set(definition.id, {
      templateTermId: definition.id,
      projectTermId: projectTerm?.id ?? null,
      parentTemplateTermId: definition.parent_term_id,
      name: definition.report_name,
      required: definition.is_required,
      responseType: isSubtermResponseType(definition.response_type) ? definition.response_type : "combined",
      sortOrder: definition.sort_order,
      active: Boolean(projectTerm && projectTerm.is_active !== false),
      hasData: Boolean(projectTerm && responseTermIds.has(projectTerm.id)),
      hasPendingReview: Boolean(projectTerm && pendingResponseTermIds.has(projectTerm.id)),
      subterms: [],
    })
  }

  for (const term of libraryTermMap.values()) {
    if (!term.parentTemplateTermId) continue
    const parent = libraryTermMap.get(term.parentTemplateTermId)
    const definition = libraryTermDefinitionById.get(term.templateTermId)
    if (parent && (definition?.status !== "disabled" || Boolean(term.projectTermId))) {
      parent.subterms.push(term)
    }
  }
  for (const term of libraryTermMap.values()) {
    term.subterms.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }

  const libraryTermsByStage = new Map<string, ProjectTermSelectionOption[]>()
  for (const definition of libraryTerms ?? []) {
    if (definition.parent_term_id) continue
    const mapped = libraryTermMap.get(definition.id)
    if (!mapped || (definition.status === "disabled" && !mapped.projectTermId)) continue
    const rows = libraryTermsByStage.get(definition.stage_id) ?? []
    rows.push(mapped)
    libraryTermsByStage.set(definition.stage_id, rows)
  }
  for (const rows of libraryTermsByStage.values()) {
    rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }

  const libraryStageTemplateIds = new Set<string>((libraryStages ?? []).map((s: any) => s.id as string))
  const customProjectStages = stageRows.filter((ps: any) => !ps.template_stage_id || !libraryStageTemplateIds.has(ps.template_stage_id))

  const customStageOptions: ProjectStageSelectionOption[] = customProjectStages.map((ps: any) => ({
    templateStageId: ps.id,
    projectStageId: ps.id,
    name: ps.name,
    description: ps.description,
    sortOrder: ps.sort_order,
    active: ps.status !== "disabled",
    hasData: ["in_progress", "completed"].includes(ps.status),
    hasPendingReview: false,
    terms: [],
  }))

  const availableStages: ProjectStageSelectionOption[] = [
    ...(libraryStages ?? [])
      .filter((stage: any) => stage.is_active !== false || projectStageByTemplate.has(stage.id))
      .map((stage: any) => {
        const projectStage = projectStageByTemplate.get(stage.id)
        const terms = libraryTermsByStage.get(stage.id) ?? []
        const legacyProjectTerms = projectStage
          ? termRows.filter((term: any) => term.project_stage_id === projectStage.id && !term.template_term_id)
          : []
        const allItems = terms.flatMap((term) => [term, ...term.subterms])
        const legacyHasData = legacyProjectTerms.some((term: any) => responseTermIds.has(term.id))
        const legacyHasPendingReview = legacyProjectTerms.some((term: any) => pendingResponseTermIds.has(term.id))
        return {
          templateStageId: stage.id,
          projectStageId: projectStage?.id ?? null,
          name: stage.name,
          description: stage.description,
          sortOrder: stage.sort_order,
          active: Boolean(projectStage ? projectStage.status !== "disabled" : true),
          hasData:
            allItems.some((item) => item.hasData) ||
            legacyHasData ||
            Boolean(projectStage && ["in_progress", "completed"].includes(projectStage.status)),
          hasPendingReview: allItems.some((item) => item.hasPendingReview) || legacyHasPendingReview,
          terms,
        }
      }),
    ...customStageOptions,
  ]

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

export async function loadProjectStageTerm(projectId: string, termId: string, userId: string) {
  const data = await loadProjectStageExecution(projectId, userId, true)
  if (!data) return null
  for (const stage of data.stages) {
    for (const term of stage.terms) {
      if (term.id === termId) return { ...data, stage, term, parentTerm: null }
      const subterm = term.subterms.find((item) => item.id === termId && (item.isActive || data.canReview))
      if (subterm) return { ...data, stage, term: subterm, parentTerm: term }
    }
  }
  return null
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

export async function loadDirectProjectStageReport(projectId: string, stageId: string, reportId: string, userId: string) {
  const execution = await loadProjectStage(projectId, stageId, userId)
  if (!execution) return null
  const response = execution.stage.reports.find((item) => item.id === reportId)
  if (!response) return null
  return { ...execution, response }
}

export async function loadProjectStageReport(projectId: string, termId: string, reportId: string, userId: string) {
  const execution = await loadProjectStageTerm(projectId, termId, userId)
  if (!execution) return null
  const response = execution.term.responses.find((item) => item.id === reportId)
  if (!response) return null
  return { ...execution, response }
}
