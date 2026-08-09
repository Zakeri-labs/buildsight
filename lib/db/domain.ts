import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { projectImageDisplayUrl } from "@/lib/projects/project-image"
import { getReviewSubmissionFeed } from "@/lib/review-submissions/server"
import { getSiteVisitTaskFeed } from "@/lib/site-visits/server"
import { getReportCcNotificationFeed } from "@/lib/report-cc/server"
import { getViewerOwnedProjectIds, isProjectUuid } from "@/lib/auth/project-access"
import type { DashboardDateRange } from "@/lib/dashboard/date-range"
import { normalizeDocumentType } from "@/lib/documents/document-types"
import { currentCalendarDateKey } from "@/lib/calendar/date"
import {
  calculateVisitCompliance,
  isVisitComplianceEligible,
  type VisitComplianceState,
  type VisitComplianceSupervisionType,
} from "@/lib/site-visits/compliance"

import { DEMO_STAGE_MANAGEMENT_DATA } from "@/lib/db/stages"
import { getFallbackStageChecklist } from "@/lib/stages/execution"

export type DomainProject = {
  id: string
  name: string
  code: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  status: string
  supervisingOrganizationId: string | null
  assignedSupervisorId: string | null
  projectType: string | null
  supervisionType: string | null
  supervisionTypeOther: string | null
  plotNo: string | null
  supervisionStartDate: string | null
  priority: string | null
  includedStructureVisits: number | null
  includedFinishingVisits: number | null
  structureSupervisionFee: number | null
  finishingSupervisionFee: number | null
  receivedAmount: number | null
  outstandingAmount: number | null
  nextPaymentAmount: number | null
  nextPaymentDueDate: string | null
  invoiceReferencePaymentNote: string | null
  initialRemarks: string | null
  region: string | null
  description: string | null
  image: string | null
  ourRole: string | null
  contractor: string | null
  consultant: string | null
  client: string | null
  startDate: string | null
  targetHandover: string | null
  contractValue: string | null
  progressPlanned: number
  progressActual: number
  progressDelay: number
}

export type NcrRow = {
  id: string
  projectId: string
  code: string
  title: string
  discipline: string
  location: string | null
  severity: "critical" | "major" | "minor"
  status: "open" | "in-review" | "closed"
  raisedBy: string | null
  raisedOn: string | null
  assignedTo: string | null
  assignedInitials: string | null
  dueDate: string | null
  description: string | null
  rootCause: string | null
  correctiveAction: string | null
  projectName: string
}

export type InspectionRow = {
  id: string
  projectId: string
  code: string
  title: string
  discipline: string
  location: string | null
  requestedBy: string | null
  assignedTo: string | null
  assignedInitials: string | null
  scheduled: string | null
  dueDate: string | null
  overdue: boolean
  priority: "high" | "medium" | "low"
  status: "pending" | "approved" | "rejected" | "in-progress"
  projectName: string
}

export type RfiRow = {
  id: string
  projectId: string
  code: string
  subject: string
  discipline: string
  status: "open" | "answered" | "closed"
  priority: string
  submittedBy: string | null
  submittedOn: string | null
  dueDate: string | null
  question: string | null
  response: string | null
  projectName: string
}

export type VoRow = {
  id: string
  projectId: string
  code: string
  title: string
  status: "draft" | "submitted" | "approved" | "rejected"
  amount: number
  currency: string
  submittedBy: string | null
  submittedOn: string | null
  description: string | null
  projectName: string
}

export type ActivityRow = {
  id: string
  type: "ncr" | "inspection" | "rfi" | "vo" | "document"
  verb: string
  reference: string | null
  projectName: string
  createdAt: string
}

export type RecentSupervisorReportRow = {
  id: string
  projectId: string
  stageId: string
  reportTitle: string
  projectName: string
  supervisorName: string
  submittedAt: string
  href: string
}

export type TaskRow = {
  id: string
  action: string
  type: "NCR" | "Inspection" | "RFI" | "VO" | "Review" | "Site Visit" | "CC"
  reference: string | null
  reportTitle?: string
  dueLabel: string | null
  dueTone: "danger" | "warning" | "muted"
  projectName: string
  href?: string
  stageName?: string
  parentTermName?: string
  subtermName?: string | null
  submittedBy?: string
  submittedAt?: string
  reviewStatus?: "submitted" | "under_review"
  requestedBy?: string
  preferredVisit?: string
  siteVisitStatus?: "pending"
  ccContext?: "report" | "translation"
  ccAddedBy?: string
}

/** All projects for the supervising org, ordered for display. */
export async function getOrgProjects(orgId: string, userId?: string): Promise<DomainProject[]> {
  try {
    if (!isProjectUuid(orgId) || (userId !== undefined && !isProjectUuid(userId))) return []
    const admin = createAdminClient()
  const projectColumns =
    "id, name, code, location, latitude, longitude, status, assigned_supervisor_id, project_type, supervision_type, supervision_type_other, plot_no, supervision_start_date, priority, included_structure_visits, included_finishing_visits, structure_supervision_fee, finishing_supervision_fee, received_amount, outstanding_amount, next_payment_amount, next_payment_due_date, invoice_reference_payment_note, initial_remarks, region, description, image, our_role, contractor, consultant, client, start_date, target_handover, contract_value, progress_planned, progress_actual, progress_delay, supervising_organization_id, sort_order"

  let data: any[] | null = null
  if (!userId) {
    const result = await admin
      .from("projects")
      .select(projectColumns)
      .eq("supervising_organization_id", orgId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
    if (result.error) throw result.error
    data = result.data
  } else {
    const { data: requestedOrgMembership, error: requestedOrgMembershipError } = await admin
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
    if (requestedOrgMembershipError) throw requestedOrgMembershipError

    if (requestedOrgMembership?.role === "viewer") {
      // Viewer scope is intentionally narrower than generic organization access:
      // only immutable Owner links for this exact authenticated Viewer are allowed.
      const projectIds = await getViewerOwnedProjectIds(userId, orgId)
      if (!projectIds.length) data = []
      else {
        const result = await admin
          .from("projects")
          .select(projectColumns)
          .eq("supervising_organization_id", orgId)
          .in("id", projectIds)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true })
        if (result.error) throw result.error
        data = result.data
      }
    } else if (requestedOrgMembership?.role === "org_member") {
      // Members use the canonical explicit Project Supervisor assignment only.
      // Keeping this server-side prevents unrelated organization projects from
      // reaching Member lists, aggregate counts, shell project options, or
      // direct project detail lookups.
      const result = await admin
        .from("projects")
        .select(projectColumns)
        .eq("supervising_organization_id", orgId)
        .eq("assigned_supervisor_id", userId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
      if (result.error) throw result.error
      data = result.data
    } else {
      const [orgMembershipResult, projectMembershipResult, participantResult] = await Promise.all([
        admin.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("status", "active"),
        admin.from("project_user_memberships").select("project_id").eq("user_id", userId).eq("status", "active"),
        admin.from("project_participants").select("project_id").eq("key_contact_user_id", userId).eq("status", "active"),
      ])
      if (orgMembershipResult.error) throw orgMembershipResult.error
      if (projectMembershipResult.error) throw projectMembershipResult.error
      if (participantResult.error) throw participantResult.error

      const organizationIds = Array.from(new Set([orgId, ...(orgMembershipResult.data ?? []).map((row: any) => row.organization_id as string)]))
      const [projectOrgResult, supervisedResult] = await Promise.all([
        organizationIds.length
          ? admin.from("project_organization_memberships").select("project_id").in("organization_id", organizationIds).eq("status", "active")
          : Promise.resolve({ data: [] as any[], error: null }),
        organizationIds.length
          ? admin.from("projects").select("id").in("supervising_organization_id", organizationIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ])
      if (projectOrgResult.error) throw projectOrgResult.error
      if (supervisedResult.error) throw supervisedResult.error

      const projectIds = Array.from(new Set([
        ...(projectMembershipResult.data ?? []).map((row: any) => row.project_id as string),
        ...(participantResult.data ?? []).map((row: any) => row.project_id as string),
        ...(projectOrgResult.data ?? []).map((row: any) => row.project_id as string),
        ...(supervisedResult.data ?? []).map((row: any) => row.id as string),
      ]))
      if (!projectIds.length) data = []
      else {
        const result = await admin
          .from("projects")
          .select(projectColumns)
          .in("id", projectIds)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true })
        if (result.error) throw result.error
        data = result.data
      }
    }
  }

  const projectRows = data ?? []
  const projectIds = projectRows.map((project: any) => project.id)
  const [{ data: imageRows }, { data: activeStageRows }] = projectIds.length
    ? await Promise.all([
        admin.from("project_images").select("project_id, storage_path").in("project_id", projectIds).eq("order_index", 0),
        admin.from("project_stages").select("id, project_id, name").in("project_id", projectIds).neq("status", "disabled"),
      ])
    : [
        { data: [] as Array<{ project_id: string; storage_path: string }> },
        { data: [] as Array<{ id: string; project_id: string; name: string }> },
      ]
  const activeStageIds = (activeStageRows ?? []).map((stage: any) => stage.id as string)
  const [{ data: progressTermRows }, { data: responseRows }] = activeStageIds.length
    ? await Promise.all([
        admin
          .from("project_stage_terms")
          .select("id, project_stage_id, parent_term_id, is_required, status, is_active")
          .in("project_stage_id", activeStageIds)
          .eq("is_active", true),
        admin
          .from("term_responses")
          .select("id, project_id, project_stage_id, response_content")
          .in("project_id", projectIds),
      ])
    : [{ data: [] }, { data: [] }]
  const imageByProject = new Map(
    (imageRows ?? []).map((image: any) => [image.project_id as string, image.storage_path as string]),
  )
  const termsByStage = new Map<string, any[]>()
  for (const term of progressTermRows ?? []) {
    const rows = termsByStage.get((term as any).project_stage_id) ?? []
    rows.push(term)
    termsByStage.set((term as any).project_stage_id, rows)
  }
  const responsesByStage = new Map<string, any[]>()
  for (const resp of responseRows ?? []) {
    if (!resp.project_stage_id) continue
    const rows = responsesByStage.get(resp.project_stage_id) ?? []
    rows.push(resp)
    responsesByStage.set(resp.project_stage_id, rows)
  }

  const calculatedProgress = new Map<string, number>()
  for (const projectId of projectIds) {
    const pDbStages = (activeStageRows ?? []).filter((stage: any) => stage.project_id === projectId)
    const dbStagesByName = new Map<string, any>()
    for (const st of pDbStages) {
      const cleanName = st.name.replace(/^\d+[\.\s\-]+/, "").trim().toLowerCase()
      dbStagesByName.set(cleanName, st)
    }

    const templateStages = DEMO_STAGE_MANAGEMENT_DATA?.stages ?? []
    let projectTotalCheckboxes = 0
    let projectCheckedCheckboxes = 0

    for (const tmplStage of templateStages) {
      const cleanName = tmplStage.name.replace(/^\d+[\.\s\-]+/, "").trim().toLowerCase()
      const dbStage = dbStagesByName.get(cleanName)

      let reportChecklistTotal = 0
      let stageChecked = 0

      // Check DB responses if dbStage exists
      if (dbStage) {
        const stageResponses = responsesByStage.get(dbStage.id) ?? []
        for (const resp of stageResponses) {
          const checklist = resp.response_content?.checklist ?? []
          const checklistArr = typeof checklist === "string" ? (() => { try { return JSON.parse(checklist) } catch { return [] } })() : checklist
          if (Array.isArray(checklistArr)) {
            for (const item of checklistArr) {
              reportChecklistTotal++
              if (item?.checked === true || item?.result === "pass") {
                stageChecked++
              }
            }
          }
        }
      }

      // Check template stage reports if no DB responses found for this stage
      if (reportChecklistTotal === 0 && tmplStage.reports && Array.isArray(tmplStage.reports)) {
        for (const report of tmplStage.reports) {
          const checklist = report.content?.checklist ?? []
          for (const item of checklist) {
            reportChecklistTotal++
            if (item.checked || item.result === "pass") {
              stageChecked++
            }
          }
        }
      }

      let stageTermsCount = 0
      if (dbStage) {
        const stageTerms = termsByStage.get(dbStage.id) ?? []
        const childrenByParent = new Map<string, any[]>()
        for (const term of stageTerms) {
          if (!term.parent_term_id) continue
          const children = childrenByParent.get(term.parent_term_id) ?? []
          children.push(term)
          childrenByParent.set(term.parent_term_id, children)
        }
        for (const term of stageTerms.filter((row: any) => !row.parent_term_id)) {
          const children = childrenByParent.get(term.id) ?? []
          stageTermsCount += children.length ? children.length : 1
        }
      }

      if (stageTermsCount === 0 && tmplStage.terms) {
        for (const term of tmplStage.terms) {
          if (term.subterms && term.subterms.length > 0) {
            stageTermsCount += term.subterms.filter((s: any) => s.active !== false).length
          } else if (term.active !== false) {
            stageTermsCount += 1
          }
        }
      }

      const fallbackCount = getFallbackStageChecklist(tmplStage.name).length
      const stageTotal = Math.max(reportChecklistTotal, stageTermsCount, fallbackCount)

      projectTotalCheckboxes += stageTotal
      projectCheckedCheckboxes += stageChecked
    }

    const calculatedPct = projectTotalCheckboxes > 0 ? Math.round((projectCheckedCheckboxes / projectTotalCheckboxes) * 100) : 0
    calculatedProgress.set(projectId, calculatedPct)
  }
  const legacyImageCounts = new Map<string, number>()
  for (const project of projectRows as any[]) {
    const legacyImage = project.image?.trim()
    if (legacyImage) legacyImageCounts.set(legacyImage, (legacyImageCounts.get(legacyImage) ?? 0) + 1)
  }

  return projectRows.map((p: any) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    location: p.location,
    latitude: p.latitude,
    longitude: p.longitude,
    status: p.status,
    supervisingOrganizationId:
      typeof p.supervising_organization_id === "string" ? p.supervising_organization_id : null,
    assignedSupervisorId: typeof p.assigned_supervisor_id === "string" ? p.assigned_supervisor_id : null,
    projectType: p.project_type,
    supervisionType: p.supervision_type,
    supervisionTypeOther: p.supervision_type_other,
    plotNo: p.plot_no,
    supervisionStartDate: p.supervision_start_date,
    priority: p.priority,
    includedStructureVisits: p.included_structure_visits,
    includedFinishingVisits: p.included_finishing_visits,
    structureSupervisionFee: p.structure_supervision_fee == null ? null : Number(p.structure_supervision_fee),
    finishingSupervisionFee: p.finishing_supervision_fee == null ? null : Number(p.finishing_supervision_fee),
    receivedAmount: p.received_amount == null ? null : Number(p.received_amount),
    outstandingAmount: p.outstanding_amount == null ? null : Number(p.outstanding_amount),
    nextPaymentAmount: p.next_payment_amount == null ? null : Number(p.next_payment_amount),
    nextPaymentDueDate: p.next_payment_due_date,
    invoiceReferencePaymentNote: p.invoice_reference_payment_note,
    initialRemarks: p.initial_remarks,
    region: p.region,
    description: p.description,
    image:
      imageByProject.get(p.id) ??
      (p.image?.trim() && legacyImageCounts.get(p.image.trim()) === 1 ? p.image : null),
    ourRole: p.our_role,
    contractor: p.contractor,
    consultant: p.consultant,
    client: p.client,
    startDate: p.start_date,
    targetHandover: p.target_handover,
    contractValue: p.contract_value,
    progressPlanned: p.progress_planned ?? 0,
    progressActual: calculatedProgress.get(p.id) ?? 0,
    progressDelay: p.progress_delay ?? 0,
  }))
  } catch (error) {
    console.error("getOrgProjects error:", error)
    return []
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const ALL_PROJECT_SCOPE_VALUES = new Set(["all", "null", "undefined"])

function asUuid(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return UUID_PATTERN.test(normalized) ? normalized : null
}

function validUuidList(values: unknown[]): string[] {
  return Array.from(new Set(values.map(asUuid).filter((value): value is string => Boolean(value))))
}

function normalizeProjectScope(value: string | null): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  if (!normalized || ALL_PROJECT_SCOPE_VALUES.has(normalized.toLowerCase())) return null
  return normalized
}

// Resolve the set of project ids in scope. A selected project is never
// allowed to fall back to organisation-wide data when it is missing or stale.
async function resolveScopedProjects(orgId: string, projectId: string | null, userId?: string) {
  const projects = await getOrgProjects(orgId, userId)
  const requestedScope = normalizeProjectScope(projectId)
  const selectedProject = requestedScope
    ? projects.find((project) => project.id === requestedScope || project.code === requestedScope) ?? null
    : null
  const scoped = requestedScope ? (selectedProject ? [selectedProject] : []) : projects
  const ids = validUuidList(scoped.map((project) => project.id))

  return {
    projects,
    scoped,
    ids,
    requestedSpecificProject: Boolean(requestedScope),
    selectedProjectId: asUuid(selectedProject?.id),
  }
}

function nameMap(projects: DomainProject[]) {
  return new Map(projects.map((p) => [p.id, p.name]))
}

async function fetchScopedRows(table: string, columns: string, ids: string[]) {
  const projectIds = validUuidList(ids)
  if (projectIds.length === 0) return [] as any[]
  const admin = createAdminClient()
  const { data, error } = await admin.from(table).select(columns).in("project_id", projectIds)
  if (error) throw error
  return data ?? []
}

async function fetchScopedRowsByActivityRange(
  table: string,
  columns: string,
  ids: string[],
  timestampColumn: string,
  range?: Pick<DashboardDateRange, "startUtc" | "endExclusiveUtc">,
) {
  const projectIds = validUuidList(ids)
  if (projectIds.length === 0) return [] as any[]

  const admin = createAdminClient()
  let query = admin.from(table).select(columns).in("project_id", projectIds)
  if (range?.startUtc) query = query.gte(timestampColumn, range.startUtc)
  if (range?.endExclusiveUtc) query = query.lt(timestampColumn, range.endExclusiveUtc)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function isCompletedSiteVisitStatus(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "completed"
}

async function fetchScopedCompletedSiteVisitsByActivityRange(
  ids: string[],
  range?: Pick<DashboardDateRange, "startUtc" | "endExclusiveUtc">,
) {
  const projectIds = validUuidList(ids)
  if (projectIds.length === 0) return [] as any[]

  const admin = createAdminClient()
  let query = admin
    .from("site_visit_requests")
    .select("id, project_id, report_visit_number, status, completed_at")
    .in("project_id", projectIds)
    .not("completed_at", "is", null)

  if (range?.startUtc) query = query.gte("completed_at", range.startUtc)
  if (range?.endExclusiveUtc) query = query.lt("completed_at", range.endExclusiveUtc)

  const { data, error } = await query
  if (error) throw error

  // Completion is canonical only when BOTH the persisted completion timestamp exists
  // and the Site Visit status normalizes to `completed`. Filtering the status after the
  // scoped/date-limited query avoids silently losing legitimate historical rows whose
  // status casing differs, while still excluding scheduled/pending/cancelled requests.
  return (data ?? []).filter((visit: any) => isCompletedSiteVisitStatus(visit.status))
}

async function fetchScopedCompletedSiteVisitsForCompliance(ids: string[]) {
  const projectIds = validUuidList(ids)
  if (projectIds.length === 0) return [] as any[]

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("site_visit_requests")
    .select("id, project_id, status, completed_at")
    .in("project_id", projectIds)
    .not("completed_at", "is", null)

  if (error) throw error

  // Compliance deliberately has no Dashboard activity-range filter. It needs the latest
  // completed Visit for each Project across the full authorized Project history.
  return (data ?? []).filter((visit: any) => isCompletedSiteVisitStatus(visit.status))
}

export type DashboardVisitComplianceProject = {
  projectId: string
  projectName: string
  projectCode: string | null
  supervisionType: VisitComplianceSupervisionType
  supervisorId: string | null
  supervisorName: string
  state: Exclude<VisitComplianceState, "on_track">
  intervalDays: number
  lastCompletedVisitDate: string | null
  nextRequiredVisitDate: string
  daysRemaining: number | null
  daysOverdue: number | null
}

export type DashboardVisitCompliance = {
  overdueCount: number
  dueTodayCount: number
  dueSoonCount: number
  projects: DashboardVisitComplianceProject[]
}

export type DashboardData = {
  kpis: {
    totalProjects: number
    openNcrs: number
    openInspections: number
    wirCount: number
  }
  ncrDonut: { label: string; value: number; color: string }[]
  inspectionDonut: { label: string; value: number; color: string }[]
  completedVisitsBySupervisor: {
    supervisorId: string
    name: string
    completedVisitCount: number
    projectCount: number
    visits: {
      id: string
      projectId: string
      projectName: string
      projectCode: string | null
      visitNumber: number | null
      stageName: string | null
      completedAt: string
    }[]
  }[]
  visitCompliance: DashboardVisitCompliance
  recentSupervisorReports: RecentSupervisorReportRow[]
  projects: {
    id: string
    name: string
    image: string | null
    ownerClient: string | null
    supervisor: string | null
    role: string
    inspections: number
    rfis: number
    vos: number
    progress: number
    canEdit: boolean
    edit: {
      code: string | null
      address: string | null
      areaDistrict: string | null
      projectType: string | null
      supervisionType: string | null
      supervisionTypeOther: string | null
      status: string
      plotNo: string | null
      supervisionStartDate: string | null
      priority: string | null
      includedStructureVisits: number | null
      includedFinishingVisits: number | null
      structureSupervisionFee: number | null
      finishingSupervisionFee: number | null
      receivedAmount: number | null
      outstandingAmount: number | null
      nextPaymentAmount: number | null
      nextPaymentDueDate: string | null
      invoiceReferencePaymentNote: string | null
      initialRemarks: string | null
      description: string | null
      latitude: number | null
      longitude: number | null
      assignedSupervisorId: string | null
    } | null
  }[]
  tasks: TaskRow[]
  scopeName: string | null
}

function createEmptyDashboard(): DashboardData {
  return {
    kpis: { totalProjects: 0, openNcrs: 0, openInspections: 0, wirCount: 0 },
    ncrDonut: [],
    inspectionDonut: [],
    completedVisitsBySupervisor: [],
    visitCompliance: { overdueCount: 0, dueTodayCount: 0, dueSoonCount: 0, projects: [] },
    recentSupervisorReports: [],
    projects: [],
    tasks: [],
    scopeName: null,
  }
}

export async function getDashboardData(
  orgId: string,
  projectId: string | null,
  userId: string,
  activityDateRange?: Pick<DashboardDateRange, "startUtc" | "endExclusiveUtc">,
  includeVisitCompliance = false,
): Promise<DashboardData> {
  try {
    const validOrgId = asUuid(orgId)
    const validUserId = asUuid(userId)
    if (!validOrgId || !validUserId) {
      console.error("getDashboardData skipped invalid dashboard identity scope", {
        organizationIdType: typeof orgId,
        userIdType: typeof userId,
      })
      return createEmptyDashboard()
    }

    const {
      projects,
      scoped,
      ids,
      requestedSpecificProject,
      selectedProjectId,
    } = await resolveScopedProjects(validOrgId, projectId, validUserId)
    const names = nameMap(projects)
    const canLoadProjectFeeds = !requestedSpecificProject || Boolean(selectedProjectId)
    const scopedSupervisingOrgIds = validUuidList(
      scoped.map((project) => project.supervisingOrganizationId),
    )
    const complianceProjectIds = includeVisitCompliance
      ? validUuidList(
          scoped
            .filter(
              (project) => isVisitComplianceEligible(project.status, project.supervisionType),
            )
            .map((project) => project.id),
        )
      : []
    const admin = createAdminClient()
    const emptyReviewFeed = { canReview: false, items: [] }
    const emptySiteVisitFeed = { canManage: false, items: [] }
    const emptyReportCcFeed = { canNotify: false, items: [] }

    const [
      ncrs,
      inspections,
      completedSiteVisits,
      complianceCompletedSiteVisits,
      rfis,
      documents,
      vos,
      tasks,
      reviewFeed,
      siteVisitFeed,
      reportCcFeed,
      termResponses,
      projectOwners,
      dashboardOrgAdminMemberships,
      dashboardProjectAdminMemberships,
    ] = await Promise.all([
      fetchScopedRows("ncrs", "project_id, status", ids),
      fetchScopedRows("inspections", "project_id, status", ids),
      fetchScopedCompletedSiteVisitsByActivityRange(ids, activityDateRange),
      includeVisitCompliance
        ? fetchScopedCompletedSiteVisitsForCompliance(complianceProjectIds)
        : Promise.resolve([] as any[]),
      fetchScopedRows("rfis", "project_id, status", ids),
      fetchScopedRows("documents", "id, project_id, document_type", ids),
      fetchScopedRows("variation_orders", "project_id", ids),
      fetchScopedRows("tasks", "id, project_id, action, type, reference, due_label, due_tone, sort_order", ids),
      canLoadProjectFeeds
        ? getReviewSubmissionFeed({ userId: validUserId, organizationId: validOrgId, projectId: selectedProjectId })
        : Promise.resolve(emptyReviewFeed),
      canLoadProjectFeeds
        ? getSiteVisitTaskFeed({ userId: validUserId, projectId: selectedProjectId })
        : Promise.resolve(emptySiteVisitFeed),
      canLoadProjectFeeds
        ? getReportCcNotificationFeed({ userId: validUserId, projectId: selectedProjectId })
        : Promise.resolve(emptyReportCcFeed),
      fetchScopedRows(
        "term_responses",
        "id, project_id, project_stage_id, project_stage_term_id, site_visit_request_id, visit_number, report_title, status, submitted_at, updated_at, created_at",
        ids,
      ),
      ids.length
        ? admin
            .from("project_owners")
            .select("id, project_id, owner_order, name")
            .in("project_id", ids)
            .order("owner_order", { ascending: true })
            .order("id", { ascending: true })
            .then(({ data, error }) => {
              if (error) throw error
              return data ?? []
            })
        : Promise.resolve([] as any[]),
      scopedSupervisingOrgIds.length
        ? admin
            .from("organization_memberships")
            .select("organization_id")
            .eq("user_id", validUserId)
            .eq("role", "org_admin")
            .eq("status", "active")
            .in("organization_id", scopedSupervisingOrgIds)
            .then(({ data, error }) => {
              if (error) throw error
              return data ?? []
            })
        : Promise.resolve([] as any[]),
      ids.length
        ? admin
            .from("project_user_memberships")
            .select("project_id")
            .eq("user_id", validUserId)
            .eq("access_role", "project_admin")
            .eq("status", "active")
            .in("project_id", ids)
            .then(({ data, error }) => {
              if (error) throw error
              return data ?? []
            })
        : Promise.resolve([] as any[]),
    ])

    const editableOrganizationIds = new Set(
      (dashboardOrgAdminMemberships ?? [])
        .map((membership: any) => asUuid(membership.organization_id))
        .filter((value): value is string => Boolean(value)),
    )
    const editableProjectIds = new Set(
      (dashboardProjectAdminMemberships ?? [])
        .map((membership: any) => asUuid(membership.project_id))
        .filter((value): value is string => Boolean(value)),
    )

    const countBy = (rows: any[], field: string) => {
      const m = new Map<string, number>()
      for (const r of rows) m.set(r[field], (m.get(r[field]) ?? 0) + 1)
      return m
    }
    const ncrByStatus = countBy(ncrs, "status")
    const inspByStatus = countBy(inspections, "status")
    const wirCount = new Set(
      (documents ?? [])
        .filter((document: any) => normalizeDocumentType(document.document_type) === "wir_ir")
        .map((document: any) => document.id),
    ).size

    const ncrDonut = [
      { label: "Open", value: ncrByStatus.get("open") ?? 0, color: "var(--destructive)" },
      { label: "In Review", value: ncrByStatus.get("in-review") ?? 0, color: "var(--warning)" },
      { label: "Closed", value: ncrByStatus.get("closed") ?? 0, color: "var(--success)" },
    ]

    const inspectionDonut = [
      { label: "Pending", value: inspByStatus.get("pending") ?? 0, color: "var(--amber-500)" },
      { label: "In Progress", value: inspByStatus.get("in-progress") ?? 0, color: "var(--info)" },
      { label: "Approved", value: inspByStatus.get("approved") ?? 0, color: "var(--success)" },
    ]

    // Aggregate completed Site Visits through the visit-specific assignee relationship.
    // The request row is the canonical Site Visit record; completion is determined by
    // status = completed and completed_at, while assignee rows determine attribution.
    const projectSupervisorById = new Map<string, string>(
      scoped
        .filter((project) => Boolean(project.assignedSupervisorId))
        .map(
          (project) =>
            [project.id, project.assignedSupervisorId as string] as [string, string],
        ),
    )
    const completedVisitIds = validUuidList(
      (completedSiteVisits as any[]).map((visit) => visit.id),
    )
    const { data: completedVisitAssignees, error: completedVisitAssigneesError } = completedVisitIds.length
      ? await admin
          .from("site_visit_request_assignees")
          .select("request_id, user_id")
          .in("request_id", completedVisitIds)
      : { data: [] as any[], error: null }
    if (completedVisitAssigneesError) throw completedVisitAssigneesError

    const assignedSupervisorIds = validUuidList(
      (completedVisitAssignees ?? []).map((row: any) => row.user_id),
    )
    const reportSupervisorIds = validUuidList(Array.from(projectSupervisorById.values()))
    const supervisorIds = validUuidList([...assignedSupervisorIds, ...reportSupervisorIds])
    const { data: supervisorProfiles, error: supervisorProfilesError } = supervisorIds.length
      ? await admin.from("profiles").select("id, full_name, email").in("id", supervisorIds)
      : { data: [] as any[], error: null }
    if (supervisorProfilesError) throw supervisorProfilesError

    const supervisorNameById = new Map<string, string>(
      (supervisorProfiles ?? []).map(
        (profile: any) =>
          [
            profile.id,
            profile.full_name?.trim() || profile.email?.trim() || profile.id,
          ] as [string, string],
      ),
    )
    const completedVisitById = new Map<string, string>(
      (completedSiteVisits as any[])
        .map((visit) => {
          const visitId = asUuid(visit.id)
          const visitProjectId = asUuid(visit.project_id)
          return visitId && visitProjectId ? ([visitId, visitProjectId] as [string, string]) : null
        })
        .filter((entry): entry is [string, string] => Boolean(entry)),
    )

    // Stage context is shown only when the Site Visit is explicitly linked to
    // its Stage-based Report. Never infer it from Project, date, or Visit No.
    const linkedReportByVisitId = new Map<
      string,
      { projectStageId: string; visitNumber: number | null }
    >()
    for (const response of termResponses ?? []) {
      const visitId = asUuid((response as any).site_visit_request_id)
      const projectStageId = asUuid((response as any).project_stage_id)
      if (!visitId || !projectStageId || !completedVisitById.has(visitId)) continue
      linkedReportByVisitId.set(visitId, {
        projectStageId,
        visitNumber: Number.isInteger((response as any).visit_number) ? (response as any).visit_number : null,
      })
    }

    const linkedStageIds = validUuidList(
      Array.from(linkedReportByVisitId.values()).map((report) => report.projectStageId),
    )
    const { data: linkedStages, error: linkedStagesError } = linkedStageIds.length
      ? await admin.from("project_stages").select("id, name").in("id", linkedStageIds)
      : { data: [] as any[], error: null }
    if (linkedStagesError) throw linkedStagesError
    const stageNameById = new Map<string, string>(
      (linkedStages ?? []).map((stage: any) => [stage.id as string, stage.name as string]),
    )
    const scopedProjectById = new Map(scoped.map((project) => [project.id, project]))
    const completedVisitDetailById = new Map<
      string,
      {
        id: string
        projectId: string
        projectName: string
        projectCode: string | null
        visitNumber: number | null
        stageName: string | null
        completedAt: string
      }
    >()

    for (const visit of completedSiteVisits as any[]) {
      const visitId = asUuid(visit.id)
      const visitProjectId = asUuid(visit.project_id)
      const completedAt = typeof visit.completed_at === "string" ? visit.completed_at : null
      if (!visitId || !visitProjectId || !completedAt) continue

      const project = scopedProjectById.get(visitProjectId)
      const linkedReport = linkedReportByVisitId.get(visitId)
      const reservedVisitNumber = Number.isInteger(visit.report_visit_number) ? visit.report_visit_number : null
      completedVisitDetailById.set(visitId, {
        id: visitId,
        projectId: visitProjectId,
        projectName: project?.name ?? "Project",
        projectCode: project?.code ?? null,
        visitNumber: linkedReport?.visitNumber ?? reservedVisitNumber,
        stageName: linkedReport ? stageNameById.get(linkedReport.projectStageId) ?? null : null,
        completedAt,
      })
    }

    const completedVisitAggregation = new Map<
      string,
      { supervisorId: string; name: string; visitIds: Set<string>; projectIds: Set<string> }
    >()

    for (const assignment of completedVisitAssignees ?? []) {
      const visitId = asUuid((assignment as any).request_id)
      const supervisorId = asUuid((assignment as any).user_id)
      if (!visitId || !supervisorId) continue
      const visitProjectId = completedVisitById.get(visitId)
      if (!visitProjectId) continue

      const existing = completedVisitAggregation.get(supervisorId) ?? {
        supervisorId,
        name: supervisorNameById.get(supervisorId) ?? supervisorId,
        visitIds: new Set<string>(),
        projectIds: new Set<string>(),
      }
      existing.visitIds.add(visitId)
      existing.projectIds.add(visitProjectId)
      completedVisitAggregation.set(supervisorId, existing)
    }

    const completedVisitsBySupervisor = Array.from(completedVisitAggregation.values())
      .map((item) => {
        const visits = Array.from(item.visitIds)
          .map((visitId) => completedVisitDetailById.get(visitId))
          .filter((visit): visit is {
            id: string
            projectId: string
            projectName: string
            projectCode: string | null
            visitNumber: number | null
            stageName: string | null
            completedAt: string
          } => Boolean(visit))
          .sort((a, b) => {
            const timeDifference = new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
            return timeDifference || b.id.localeCompare(a.id)
          })

        return {
          supervisorId: item.supervisorId,
          name: item.name,
          completedVisitCount: item.visitIds.size,
          projectCount: item.projectIds.size,
          visits,
        }
      })
      .sort((a, b) =>
        b.completedVisitCount - a.completedVisitCount ||
        a.name.localeCompare(b.name) ||
        a.supervisorId.localeCompare(b.supervisorId),
      )
      .slice(0, 4)

    // Visit Compliance is independent of the Dashboard activity range. Its recurring
    // baseline is the latest completed Site Visit for the Project, then the persisted
    // Project supervision/start date. The reusable calculation helper is the single
    // source of truth for interval, eligibility, due date, and compliance state.
    const latestCompletedVisitAtByProject = new Map<string, string>()
    for (const visit of complianceCompletedSiteVisits as any[]) {
      const visitProjectId = asUuid(visit.project_id)
      const completedAt = typeof visit.completed_at === "string" ? visit.completed_at : null
      if (!visitProjectId || !completedAt) continue

      const existing = latestCompletedVisitAtByProject.get(visitProjectId)
      if (!existing || new Date(completedAt).getTime() > new Date(existing).getTime()) {
        latestCompletedVisitAtByProject.set(visitProjectId, completedAt)
      }
    }

    const complianceToday = currentCalendarDateKey()
    const allComplianceProjects = includeVisitCompliance
      ? scoped.flatMap((project) => {
          const calculation = calculateVisitCompliance(
            {
              status: project.status,
              supervisionType: project.supervisionType,
              latestCompletedVisitAt: latestCompletedVisitAtByProject.get(project.id) ?? null,
              supervisionStartDate: project.supervisionStartDate,
              startDate: project.startDate,
              // Migration 060 persists the legacy fallback into supervision_start_date.
              // Never substitute a moving request-time today value here.
              legacyFallbackDate: null,
            },
            complianceToday,
          )
          if (!calculation) return []

          return [{
            projectId: project.id,
            projectName: project.name,
            projectCode: project.code,
            supervisorId: project.assignedSupervisorId,
            supervisorName: project.assignedSupervisorId
              ? supervisorNameById.get(project.assignedSupervisorId) ?? "Assigned Supervisor"
              : "Unassigned",
            ...calculation,
          }]
        })
      : []

    const attentionProjects = allComplianceProjects
      .filter((project) => project.state !== "on_track")
      .sort((a, b) => {
        const urgencyRank = { overdue: 0, due_today: 1, due_soon: 2 } as const
        const aRank = urgencyRank[a.state as Exclude<VisitComplianceState, "on_track">]
        const bRank = urgencyRank[b.state as Exclude<VisitComplianceState, "on_track">]
        const urgencyDifference = aRank - bRank
        if (urgencyDifference) return urgencyDifference
        if (a.state === "overdue" && b.state === "overdue") {
          const overdueDifference = (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0)
          if (overdueDifference) return overdueDifference
        }
        if (a.state === "due_soon" && b.state === "due_soon") {
          const remainingDifference = (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0)
          if (remainingDifference) return remainingDifference
        }
        return (
          a.projectName.localeCompare(b.projectName) ||
          (a.projectCode ?? "").localeCompare(b.projectCode ?? "") ||
          a.projectId.localeCompare(b.projectId)
        )
      })

    const visitCompliance: DashboardVisitCompliance = {
      overdueCount: allComplianceProjects.filter((project) => project.state === "overdue").length,
      dueTodayCount: allComplianceProjects.filter((project) => project.state === "due_today").length,
      dueSoonCount: allComplianceProjects.filter((project) => project.state === "due_soon").length,
      projects: attentionProjects.map((project) => ({
        projectId: project.projectId,
        projectName: project.projectName,
        projectCode: project.projectCode,
        supervisionType: project.supervisionType,
        supervisorId: project.supervisorId,
        supervisorName: project.supervisorName,
        state: project.state as Exclude<VisitComplianceState, "on_track">,
        intervalDays: project.intervalDays,
        lastCompletedVisitDate: project.lastCompletedVisitDate,
        nextRequiredVisitDate: project.nextRequiredVisitDate,
        daysRemaining: project.daysRemaining,
        daysOverdue: project.daysOverdue,
      })),
    }

    // Recent Supervisor Reports uses the active Stage-based Report records only.
    // Reports are attributed through the canonical Project Supervisor assignment,
    // so a Supervisor reassignment is reflected here without a parallel mapping.
    const submittedStageReportStatuses = new Set([
      "submitted",
      "under_review",
      "approved",
      "rejected",
      "completed",
    ])
    const recentSupervisorReports: RecentSupervisorReportRow[] = (termResponses ?? [])
      .filter((response: any) => {
        const validProjectId = asUuid(response.project_id)
        const validStageId = asUuid(response.project_stage_id)
        const validReportId = asUuid(response.id)
        return (
          Boolean(validProjectId && validStageId && validReportId) &&
          !response.project_stage_term_id &&
          Boolean(response.submitted_at) &&
          submittedStageReportStatuses.has(String(response.status ?? ""))
        )
      })
      .map((response: any) => {
        const projectId = response.project_id as string
        const stageId = response.project_stage_id as string
        const supervisorId = projectSupervisorById.get(projectId)
        return {
          id: response.id as string,
          projectId,
          stageId,
          reportTitle: response.report_title?.trim() || "Inspection Report",
          projectName: names.get(projectId) ?? "Unknown project",
          supervisorName: supervisorId
            ? supervisorNameById.get(supervisorId) ?? "Assigned Supervisor"
            : "Unassigned Supervisor",
          submittedAt: response.submitted_at as string,
          href: `/projects/${projectId}/stages/${stageId}/reports/${response.id}`,
        }
      })
      .sort((a, b) => {
        const bySubmission = +new Date(b.submittedAt) - +new Date(a.submittedAt)
        return bySubmission || a.id.localeCompare(b.id)
      })
      .slice(0, 4)

    const firstOwnerByProject = new Map<string, string>()
    for (const owner of projectOwners ?? []) {
      const ownerProjectId = asUuid((owner as any).project_id)
      const ownerName = typeof (owner as any).name === "string" ? (owner as any).name.trim() : ""
      if (!ownerProjectId || !ownerName || firstOwnerByProject.has(ownerProjectId)) continue
      firstOwnerByProject.set(ownerProjectId, ownerName)
    }

    const projectRows = scoped.map((p) => {
      const pStageReportsCount = (termResponses ?? []).filter((r: any) => r.project_id === p.id).length
      let demoReportsCount = 0
      if (DEMO_STAGE_MANAGEMENT_DATA?.stages) {
        for (const st of DEMO_STAGE_MANAGEMENT_DATA.stages) {
          demoReportsCount += (st.reports ?? []).length
        }
      }
      const pInsps = Math.max(
        inspections.filter((r) => r.project_id === p.id).length,
        pStageReportsCount,
        demoReportsCount
      )
      const pRfis = rfis.filter((r) => r.project_id === p.id).length
      const pVos = vos.filter((r) => r.project_id === p.id).length
      const supervisor = p.assignedSupervisorId
        ? supervisorNameById.get(p.assignedSupervisorId) ?? null
        : null
      const canEdit =
        editableProjectIds.has(p.id) ||
        Boolean(p.supervisingOrganizationId && editableOrganizationIds.has(p.supervisingOrganizationId))

      return {
        id: p.id,
        name: p.name,
        image: p.image,
        ownerClient: firstOwnerByProject.get(p.id) ?? null,
        supervisor,
        role: p.ourRole ?? "Supervising Consultant",
        inspections: pInsps,
        rfis: pRfis,
        vos: pVos,
        progress: p.progressActual,
        canEdit,
        edit: canEdit
          ? {
              code: p.code,
              address: p.location,
              areaDistrict: p.region,
              projectType: p.projectType,
              supervisionType: p.supervisionType,
              supervisionTypeOther: p.supervisionTypeOther,
              status: p.status,
              plotNo: p.plotNo,
              supervisionStartDate: p.supervisionStartDate,
              priority: p.priority,
              includedStructureVisits: p.includedStructureVisits,
              includedFinishingVisits: p.includedFinishingVisits,
              structureSupervisionFee: p.structureSupervisionFee,
              finishingSupervisionFee: p.finishingSupervisionFee,
              receivedAmount: p.receivedAmount,
              outstandingAmount: p.outstandingAmount,
              nextPaymentAmount: p.nextPaymentAmount,
              nextPaymentDueDate: p.nextPaymentDueDate,
              invoiceReferencePaymentNote: p.invoiceReferencePaymentNote,
              initialRemarks: p.initialRemarks,
              description: p.description,
              latitude: p.latitude,
              longitude: p.longitude,
              assignedSupervisorId: p.assignedSupervisorId,
            }
          : null,
      }
    })

    const reviewTasks: TaskRow[] = reviewFeed.items.map((item) => ({
      id: `review:${item.id}`,
      action: "Review Submission",
      type: "Review",
      reference: item.reportNumber,
      reportTitle: item.reportTitle,
      dueLabel: item.status === "under_review" ? "Under Review" : "Submitted",
      dueTone: item.status === "under_review" ? "warning" : "danger",
      projectName: item.projectName,
      href: item.href,
      stageName: item.stageName,
      parentTermName: item.parentTermName,
      subtermName: item.subtermName,
      submittedBy: item.submittedBy,
      submittedAt: item.submittedAt,
      reviewStatus: item.status,
    }))

    const siteVisitTasks: TaskRow[] = siteVisitFeed.items.map((item) => ({
      id: `site-visit:${item.id}`,
      action: "New Site Visit Request",
      type: "Site Visit",
      reference: null,
      dueLabel: "Pending",
      dueTone: "warning",
      projectName: item.projectName,
      href: item.href,
      requestedBy: item.requestedBy,
      preferredVisit: item.preferredVisit,
      siteVisitStatus: item.status,
      submittedAt: item.createdAt,
    }))

    const reportCcTasks: TaskRow[] = reportCcFeed.items.map((item) => ({
      id: `report-cc:${item.id}`,
      action: "Report CC Notification",
      type: "CC Notification",
      reference: item.reportNumber,
      reportTitle: item.reportTitle,
      dueLabel: "CC Copy",
      dueTone: "muted",
      projectName: item.projectName,
      href: item.href,
      stageName: item.stageName,
      parentTermName: item.termName,
      submittedAt: item.createdAt,
      ccContext: item.context,
      ccAddedBy: item.addedByName,
    }))

    const taskRows: TaskRow[] = [
      ...reportCcTasks,
      ...siteVisitTasks,
      ...reviewTasks,
      ...tasks
        .slice()
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((t: any) => ({
          id: t.id,
          action: t.action,
          type: t.type,
          reference: t.reference,
          dueLabel: t.due_label,
          dueTone: t.due_tone,
          projectName: names.get(t.project_id) ?? "Unknown",
        })),
    ]

    return {
      kpis: {
        totalProjects: scoped.length,
        openNcrs: ncrByStatus.get("open") ?? 0,
        openInspections:
          (inspByStatus.get("pending") ?? 0) + (inspByStatus.get("in-progress") ?? 0),
        wirCount,
      },
      ncrDonut,
      inspectionDonut,
      completedVisitsBySupervisor,
      visitCompliance,
      recentSupervisorReports,
      projects: projectRows,
      tasks: taskRows,
      scopeName: selectedProjectId && scoped.length === 1 ? scoped[0].name : null,
    }
  } catch (error) {
    console.error("getDashboardData error:", error)
    return createEmptyDashboard()
  }
}

export async function getNcrs(orgId: string, projectId: string | null, userId?: string): Promise<NcrRow[]> {
  const { projects, ids } = await resolveScopedProjects(orgId, projectId, userId)
  const names = nameMap(projects)
  const rows = await fetchScopedRows(
    "ncrs",
    "id, project_id, code, title, discipline, location, severity, status, raised_by, raised_on, assigned_to, assigned_initials, due_date, description, root_cause, corrective_action",
    ids,
  )
  return rows.map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    code: r.code,
    title: r.title,
    discipline: r.discipline,
    location: r.location,
    severity: r.severity,
    status: r.status,
    raisedBy: r.raised_by,
    raisedOn: r.raised_on,
    assignedTo: r.assigned_to,
    assignedInitials: r.assigned_initials,
    dueDate: r.due_date,
    description: r.description,
    rootCause: r.root_cause,
    correctiveAction: r.corrective_action,
    projectName: names.get(r.project_id) ?? "Unknown",
  }))
}

export async function getInspections(orgId: string, projectId: string | null, userId?: string): Promise<InspectionRow[]> {
  const { projects, ids } = await resolveScopedProjects(orgId, projectId, userId)
  const names = nameMap(projects)
  const rows = await fetchScopedRows(
    "inspections",
    "id, project_id, code, title, discipline, location, requested_by, assigned_to, assigned_initials, scheduled, due_date, overdue, priority, status",
    ids,
  )
  return rows.map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    code: r.code,
    title: r.title,
    discipline: r.discipline,
    location: r.location,
    requestedBy: r.requested_by,
    assignedTo: r.assigned_to,
    assignedInitials: r.assigned_initials,
    scheduled: r.scheduled,
    dueDate: r.due_date,
    overdue: r.overdue,
    priority: r.priority,
    status: r.status,
    projectName: names.get(r.project_id) ?? "Unknown",
  }))
}

export async function getRfis(orgId: string, projectId: string | null, userId?: string): Promise<RfiRow[]> {
  const { projects, ids } = await resolveScopedProjects(orgId, projectId, userId)
  const names = nameMap(projects)
  const rows = await fetchScopedRows(
    "rfis",
    "id, project_id, code, subject, discipline, status, priority, submitted_by, submitted_on, due_date, question, response",
    ids,
  )
  return rows.map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    code: r.code,
    subject: r.subject,
    discipline: r.discipline,
    status: r.status,
    priority: r.priority,
    submittedBy: r.submitted_by,
    submittedOn: r.submitted_on,
    dueDate: r.due_date,
    question: r.question,
    response: r.response,
    projectName: names.get(r.project_id) ?? "Unknown",
  }))
}

export async function getVos(orgId: string, projectId: string | null, userId?: string): Promise<VoRow[]> {
  const { projects, ids } = await resolveScopedProjects(orgId, projectId, userId)
  const names = nameMap(projects)
  const rows = await fetchScopedRows(
    "variation_orders",
    "id, project_id, code, title, status, amount, currency, submitted_by, submitted_on, description",
    ids,
  )
  return rows.map((r: any) => ({
    id: r.id,
    projectId: r.project_id,
    code: r.code,
    title: r.title,
    status: r.status,
    amount: Number(r.amount ?? 0),
    currency: r.currency,
    submittedBy: r.submitted_by,
    submittedOn: r.submitted_on,
    description: r.description,
    projectName: names.get(r.project_id) ?? "Unknown",
  }))
}
