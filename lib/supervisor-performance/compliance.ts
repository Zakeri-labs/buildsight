import { normalizeProjectStatus } from "@/lib/projects/project-status"
import type {
  OrganizationPerformanceSummary,
  ProjectComplianceMetrics,
  RawProjectRecord,
  RawReportRecord,
  SupervisionComplianceType,
  SupervisorPerformanceData,
  SupervisorPerformanceMetrics,
} from "./types"

export const REQUIRED_VISITS_BY_SUPERVISION_TYPE: Record<SupervisionComplianceType, number> = {
  monthly_2: 2,
  monthly_3: 3,
  monthly_4: 4,
}

export function normalizeComplianceSupervisionType(
  value: string | null | undefined,
): SupervisionComplianceType | null {
  if (typeof value !== "string") return null
  const token = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
  if (token === "monthly2") return "monthly_2"
  if (token === "monthly3") return "monthly_3"
  if (token === "monthly4") return "monthly_4"
  return null
}

export function getEffectiveVisitDate(report: RawReportRecord): string | null {
  const visitDate = report.visit_date ?? report.visitDate
  if (visitDate && typeof visitDate === "string" && visitDate.trim().length >= 10) {
    return visitDate.trim().slice(0, 10)
  }
  const createdAt = report.created_at ?? report.createdAt
  if (createdAt && typeof createdAt === "string" && createdAt.trim().length >= 10) {
    return createdAt.trim().slice(0, 10)
  }
  return null
}

export function isValidCompletedReport(report: RawReportRecord): boolean {
  const submittedAt = report.submitted_at ?? report.submittedAt
  if (!submittedAt) return false

  const status = (report.status ?? "").trim().toLowerCase()
  if (!status || status === "draft" || status === "in_progress") return false

  return ["submitted", "under_review", "approved", "rejected", "completed"].includes(status)
}

export function isReportInMonth(report: RawReportRecord, monthStr: string): boolean {
  const effectiveDate = getEffectiveVisitDate(report)
  if (!effectiveDate) return false
  return effectiveDate.startsWith(monthStr)
}

export function calculateProjectMetrics(
  project: RawProjectRecord,
  reportsForProject: RawReportRecord[],
  monthStr: string,
): ProjectComplianceMetrics {
  const rawSupervisionType = project.supervision_type ?? project.supervisionType ?? null
  const normalizedType = normalizeComplianceSupervisionType(rawSupervisionType)
  const isComplianceEligible = normalizedType !== null
  const required = normalizedType ? REQUIRED_VISITS_BY_SUPERVISION_TYPE[normalizedType] : 0

  const assignedSupervisorId = project.assigned_supervisor_id ?? project.assignedSupervisorId ?? null

  const validMonthReports = reportsForProject.filter((report) => {
    if (!isValidCompletedReport(report)) return false
    if (!isReportInMonth(report, monthStr)) return false
    // V1 Business Rule: report must be created by the project's assigned supervisor
    const createdBy = report.created_by ?? report.createdBy ?? null
    return Boolean(assignedSupervisorId && createdBy === assignedSupervisorId)
  })

  const completed = validMonthReports.length
  const creditedCompleted = isComplianceEligible ? Math.min(completed, required) : 0
  const missed = isComplianceEligible ? Math.max(required - completed, 0) : 0
  const extra = isComplianceEligible ? Math.max(completed - required, 0) : 0
  const compliancePercentage =
    isComplianceEligible && required > 0
      ? Math.round((creditedCompleted / required) * 1000) / 10
      : null

  return {
    projectId: project.id,
    projectName: project.name?.trim() || "Untitled Project",
    projectCode: project.code?.trim() || "N/A",
    assignedSupervisorId,
    supervisionType: rawSupervisionType,
    normalizedSupervisionType: normalizedType,
    isComplianceEligible,
    required,
    completed,
    creditedCompleted,
    missed,
    extra,
    compliancePercentage,
  }
}

export function calculateSupervisorPerformance(input: {
  month: string
  projects: RawProjectRecord[]
  reports: RawReportRecord[]
  supervisorProfiles?: Map<
    string,
    { id: string; name: string; email: string | null; avatarUrl: string | null }
  >
}): SupervisorPerformanceData {
  const { month, projects, reports, supervisorProfiles } = input

  // Filter Active Projects using canonical active status logic
  const activeProjects = projects.filter(
    (p) => normalizeProjectStatus(p.status) === "active",
  )

  // Group reports by project_id for fast lookup
  const reportsByProjectId = new Map<string, RawReportRecord[]>()
  for (const report of reports) {
    const projId = report.project_id ?? report.projectId
    if (!projId) continue
    const list = reportsByProjectId.get(projId) ?? []
    list.push(report)
    reportsByProjectId.set(projId, list)
  }

  // Calculate per-project metrics
  const allProjectRows: ProjectComplianceMetrics[] = activeProjects.map((project) => {
    const projReports = reportsByProjectId.get(project.id) ?? []
    return calculateProjectMetrics(project, projReports, month)
  })

  // Group project rows by assigned supervisor
  const projectsBySupervisor = new Map<string, ProjectComplianceMetrics[]>()
  const unassignedProjects: ProjectComplianceMetrics[] = []

  for (const row of allProjectRows) {
    if (row.assignedSupervisorId) {
      const list = projectsBySupervisor.get(row.assignedSupervisorId) ?? []
      list.push(row)
      projectsBySupervisor.set(row.assignedSupervisorId, list)
    } else {
      unassignedProjects.push(row)
    }
  }

  // Also include any supervisor who has an active project assigned
  const supervisors: SupervisorPerformanceMetrics[] = Array.from(
    projectsBySupervisor.entries(),
  ).map(([supervisorId, projRows]) => {
    const profile = supervisorProfiles?.get(supervisorId)
    const supervisorName = profile?.name ?? "Assigned Supervisor"
    const supervisorEmail = profile?.email ?? null
    const supervisorAvatarUrl = profile?.avatarUrl ?? null

    const activeProjectsCount = projRows.length
    const complianceProjects = projRows.filter((p) => p.isComplianceEligible)
    const complianceProjectsCount = complianceProjects.length

    const requiredVisits = complianceProjects.reduce((acc, p) => acc + p.required, 0)
    const completedVisits = complianceProjects.reduce((acc, p) => acc + p.completed, 0)
    const creditedCompletedVisits = complianceProjects.reduce(
      (acc, p) => acc + p.creditedCompleted,
      0,
    )
    const missedVisits = complianceProjects.reduce((acc, p) => acc + p.missed, 0)
    const extraVisits = complianceProjects.reduce((acc, p) => acc + p.extra, 0)
    const visitCompliancePercentage =
      requiredVisits > 0
        ? Math.round((creditedCompletedVisits / requiredVisits) * 1000) / 10
        : null

    return {
      supervisorId,
      supervisorName,
      supervisorEmail,
      supervisorAvatarUrl,
      activeProjectsCount,
      complianceProjectsCount,
      requiredVisits,
      completedVisits,
      creditedCompletedVisits,
      missedVisits,
      extraVisits,
      visitCompliancePercentage,
      projects: projRows,
    }
  })

  // Sort supervisors alphabetically by name
  supervisors.sort((a, b) => a.supervisorName.localeCompare(b.supervisorName))

  // Organization-level summary aggregation (Sum of per-project credited metrics)
  const complianceEligibleRows = allProjectRows.filter((p) => p.isComplianceEligible)

  const totalActiveProjects = allProjectRows.length
  const activeSupervisorsCount = supervisors.filter((s) => s.activeProjectsCount > 0).length
  const complianceEligibleProjectsCount = complianceEligibleRows.length

  const orgRequiredVisits = complianceEligibleRows.reduce((acc, p) => acc + p.required, 0)
  const orgCompletedVisits = complianceEligibleRows.reduce((acc, p) => acc + p.completed, 0)
  const orgCreditedCompletedVisits = complianceEligibleRows.reduce(
    (acc, p) => acc + p.creditedCompleted,
    0,
  )
  const orgMissedVisits = complianceEligibleRows.reduce((acc, p) => acc + p.missed, 0)
  const orgExtraVisits = complianceEligibleRows.reduce((acc, p) => acc + p.extra, 0)
  const orgVisitCompliancePercentage =
    orgRequiredVisits > 0
      ? Math.round((orgCreditedCompletedVisits / orgRequiredVisits) * 1000) / 10
      : null

  const unassignedActiveProjectsCount = unassignedProjects.length
  const unassignedComplianceProjectsCount = unassignedProjects.filter(
    (p) => p.isComplianceEligible,
  ).length

  const organizationSummary: OrganizationPerformanceSummary = {
    totalActiveProjects,
    activeSupervisorsCount,
    complianceEligibleProjectsCount,
    requiredVisits: orgRequiredVisits,
    completedVisits: orgCompletedVisits,
    creditedCompletedVisits: orgCreditedCompletedVisits,
    missedVisits: orgMissedVisits,
    extraVisits: orgExtraVisits,
    visitCompliancePercentage: orgVisitCompliancePercentage,
    unassignedActiveProjectsCount,
    unassignedComplianceProjectsCount,
  }

  return {
    month,
    organizationSummary,
    supervisors,
    unassignedProjects,
    allProjectRows,
  }
}
