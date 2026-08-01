import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { projectImageDisplayUrl } from "@/lib/projects/project-image"
import { getReviewSubmissionFeed } from "@/lib/review-submissions/server"

export type DomainProject = {
  id: string
  name: string
  code: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  status: string
  projectType: string | null
  supervisionType: string | null
  supervisionTypeOther: string | null
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

export type TaskRow = {
  id: string
  action: string
  type: "NCR" | "Inspection" | "RFI" | "VO" | "Review"
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
}

/** All projects for the supervising org, ordered for display. */
export async function getOrgProjects(orgId: string): Promise<DomainProject[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("projects")
    .select(
      "id, name, code, location, latitude, longitude, status, project_type, supervision_type, supervision_type_other, region, description, image, our_role, contractor, consultant, client, start_date, target_handover, contract_value, progress_planned, progress_actual, progress_delay",
    )
    .eq("supervising_organization_id", orgId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })

  const projectRows = data ?? []
  const projectIds = projectRows.map((project: any) => project.id)
  const [{ data: imageRows }, { data: activeStageRows }] = projectIds.length
    ? await Promise.all([
        admin.from("project_images").select("project_id, storage_path").in("project_id", projectIds).eq("order_index", 0),
        admin.from("project_stages").select("id, project_id").in("project_id", projectIds).neq("status", "disabled"),
      ])
    : [
        { data: [] as Array<{ project_id: string; storage_path: string }> },
        { data: [] as Array<{ id: string; project_id: string }> },
      ]
  const activeStageIds = (activeStageRows ?? []).map((stage: any) => stage.id as string)
  const { data: progressTermRows } = activeStageIds.length
    ? await admin
        .from("project_stage_terms")
        .select("id, project_stage_id, parent_term_id, is_required, status")
        .in("project_stage_id", activeStageIds)
        .eq("is_active", true)
    : { data: [] as Array<{ id: string; project_stage_id: string; parent_term_id: string | null; is_required: boolean; status: string }> }
  const imageByProject = new Map(
    (imageRows ?? []).map((image: any) => [image.project_id as string, image.storage_path as string]),
  )
  const termsByStage = new Map<string, any[]>()
  for (const term of progressTermRows ?? []) {
    const rows = termsByStage.get((term as any).project_stage_id) ?? []
    rows.push(term)
    termsByStage.set((term as any).project_stage_id, rows)
  }
  const calculatedProgress = new Map<string, number>()
  for (const projectId of projectIds) {
    const stageIds = (activeStageRows ?? []).filter((stage: any) => stage.project_id === projectId).map((stage: any) => stage.id as string)
    const countedProjectTerms: any[] = []
    for (const stageId of stageIds) {
      const stageTerms = termsByStage.get(stageId) ?? []
      const childrenByParent = new Map<string, any[]>()
      for (const term of stageTerms) {
        if (!term.parent_term_id) continue
        const children = childrenByParent.get(term.parent_term_id) ?? []
        children.push(term)
        childrenByParent.set(term.parent_term_id, children)
      }
      const actionableStageTerms: any[] = []
      for (const term of stageTerms.filter((row) => !row.parent_term_id)) {
        const children = childrenByParent.get(term.id) ?? []
        actionableStageTerms.push(...(children.length ? children : [term]))
      }
      const requiredStageTerms = actionableStageTerms.filter((term) => term.is_required)
      countedProjectTerms.push(...(requiredStageTerms.length ? requiredStageTerms : actionableStageTerms))
    }
    if (countedProjectTerms.length) {
      const completed = countedProjectTerms.filter((term) => term.status === "approved" || term.status === "completed").length
      calculatedProgress.set(projectId, Math.round((completed / countedProjectTerms.length) * 100))
    }
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
    projectType: p.project_type,
    supervisionType: p.supervision_type,
    supervisionTypeOther: p.supervision_type_other,
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
    progressActual: calculatedProgress.get(p.id) ?? p.progress_actual ?? 0,
    progressDelay: p.progress_delay ?? 0,
  }))
}

// Resolve the set of project ids in scope. A selected project is never
// allowed to fall back to organisation-wide data when it is missing or stale.
async function resolveScopedProjects(orgId: string, projectId: string | null) {
  const projects = await getOrgProjects(orgId)
  const scoped = projectId ? projects.filter((p) => p.id === projectId) : projects
  const ids = scoped.map((p) => p.id)
  return { projects, scoped, ids }
}

function nameMap(projects: DomainProject[]) {
  return new Map(projects.map((p) => [p.id, p.name]))
}

async function fetchScopedRows(table: string, columns: string, ids: string[]) {
  if (ids.length === 0) return [] as any[]
  const admin = createAdminClient()
  const { data } = await admin.from(table).select(columns).in("project_id", ids)
  return data ?? []
}

export type DashboardData = {
  kpis: {
    totalProjects: number
    openNcrs: number
    openInspections: number
    openRfis: number
  }
  ncrDonut: { label: string; value: number; color: string }[]
  inspectionDonut: { label: string; value: number; color: string }[]
  activity: ActivityRow[]
  projects: {
    id: string
    name: string
    image: string | null
    role: string
    ncrs: number
    inspections: number
    rfis: number
    vos: number
    progress: number
  }[]
  tasks: TaskRow[]
  scopeName: string | null
}

export async function getDashboardData(orgId: string, projectId: string | null, userId: string): Promise<DashboardData> {
  const { projects, scoped, ids } = await resolveScopedProjects(orgId, projectId)
  const names = nameMap(projects)

  const [ncrs, inspections, rfis, vos, activity, tasks, reviewFeed] = await Promise.all([
    fetchScopedRows("ncrs", "project_id, status", ids),
    fetchScopedRows("inspections", "project_id, status", ids),
    fetchScopedRows("rfis", "project_id, status", ids),
    fetchScopedRows("variation_orders", "project_id", ids),
    fetchScopedRows("activity_log", "id, project_id, type, verb, reference, created_at", ids),
    fetchScopedRows("tasks", "id, project_id, action, type, reference, due_label, due_tone, sort_order", ids),
    getReviewSubmissionFeed({ userId, organizationId: orgId, projectId }),
  ])

  const countBy = (rows: any[], field: string) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r[field], (m.get(r[field]) ?? 0) + 1)
    return m
  }
  const ncrByStatus = countBy(ncrs, "status")
  const inspByStatus = countBy(inspections, "status")
  const rfiByStatus = countBy(rfis, "status")

  const ncrDonut = [
    { label: "Open", value: ncrByStatus.get("open") ?? 0, color: "var(--chart-3)" },
    { label: "In Review", value: ncrByStatus.get("in-review") ?? 0, color: "var(--chart-4)" },
    { label: "Closed", value: ncrByStatus.get("closed") ?? 0, color: "var(--chart-2)" },
  ]
  const inspectionDonut = [
    { label: "Pending", value: inspByStatus.get("pending") ?? 0, color: "var(--chart-1)" },
    { label: "In Progress", value: inspByStatus.get("in-progress") ?? 0, color: "var(--chart-2)" },
    { label: "Approved", value: inspByStatus.get("approved") ?? 0, color: "var(--warning)" },
    { label: "Rejected", value: inspByStatus.get("rejected") ?? 0, color: "var(--chart-5)" },
  ]

  const perProject = (rows: any[]) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.project_id, (m.get(r.project_id) ?? 0) + 1)
    return m
  }
  const ncrPer = perProject(ncrs)
  const inspPer = perProject(inspections)
  const rfiPer = perProject(rfis)
  const voPer = perProject(vos)

  const projectRows = scoped.map((p) => ({
    id: p.id,
    name: p.name,
    image: projectImageDisplayUrl(p.image, p.id),
    role: p.ourRole ?? "Consultant",
    ncrs: ncrPer.get(p.id) ?? 0,
    inspections: inspPer.get(p.id) ?? 0,
    rfis: rfiPer.get(p.id) ?? 0,
    vos: voPer.get(p.id) ?? 0,
    progress: p.progressActual,
  }))

  const activityRows: ActivityRow[] = activity
    .map((a: any) => ({
      id: a.id,
      type: a.type,
      verb: a.verb,
      reference: a.reference,
      projectName: names.get(a.project_id) ?? "Unknown",
      createdAt: a.created_at,
    }))
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

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

  const taskRows: TaskRow[] = [
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
      openRfis: rfiByStatus.get("open") ?? 0,
    },
    ncrDonut,
    inspectionDonut,
    activity: activityRows,
    projects: projectRows,
    tasks: taskRows,
    scopeName: projectId && scoped.length === 1 ? scoped[0].name : null,
  }
}

export async function getNcrs(orgId: string, projectId: string | null): Promise<NcrRow[]> {
  const { projects, ids } = await resolveScopedProjects(orgId, projectId)
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

export async function getInspections(orgId: string, projectId: string | null): Promise<InspectionRow[]> {
  const { projects, ids } = await resolveScopedProjects(orgId, projectId)
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

export async function getRfis(orgId: string, projectId: string | null): Promise<RfiRow[]> {
  const { projects, ids } = await resolveScopedProjects(orgId, projectId)
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

export async function getVos(orgId: string, projectId: string | null): Promise<VoRow[]> {
  const { projects, ids } = await resolveScopedProjects(orgId, projectId)
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
