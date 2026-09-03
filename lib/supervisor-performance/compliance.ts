import { normalizeProjectStatus } from "@/lib/projects/project-status"
import type {
  OrganizationPerformanceSummary,
  ProjectComplianceMetrics,
  RawParticipantRecord,
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

export function isSupervisorParticipant(participant: RawParticipantRecord): boolean {
  const status = (participant.status ?? "").trim().toLowerCase()
  if (status && status !== "active") return false

  const userId = participant.key_contact_user_id ?? participant.keyContactUserId ?? null
  if (!userId) return false

  const pType = (participant.participant_type ?? participant.participantType ?? "").trim().toLowerCase()
  const pRole = (participant.project_role ?? participant.projectRole ?? "").trim().toLowerCase()
  const pLabel = (participant.participant_role_label ?? participant.participantRoleLabel ?? "").trim().toLowerCase()

  if (pType === "supervisor" || pType === "consultancy" || pType === "consultant") return true
  if (pRole === "supervisor" || pRole === "consultant") return true
  if (
    [
      "supervisor",
      "project manager",
      "site engineer",
      "qa/qc engineer",
      "hse officer",
      "consultant",
    ].includes(pLabel)
  ) {
    return true
  }
  return false
}

export function calculateProjectMetrics(
  project: RawProjectRecord,
  reportsForProject: RawReportRecord[],
  monthStr: string,
  supervisorIds: string[],
): ProjectComplianceMetrics {
  const rawSupervisionType = project.supervision_type ?? project.supervisionType ?? null
  const normalizedType = normalizeComplianceSupervisionType(rawSupervisionType)
  const isComplianceEligible = normalizedType !== null
  const required = normalizedType ? REQUIRED_VISITS_BY_SUPERVISION_TYPE[normalizedType] : 0

  const assignedSupervisorId = project.assigned_supervisor_id ?? project.assignedSupervisorId ?? null

  const validMonthReports = reportsForProject.filter((report) => {
    if (!isValidCompletedReport(report)) return false
    return isReportInMonth(report, monthStr)
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
    supervisorIds,
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
  participants?: RawParticipantRecord[]
  reports: RawReportRecord[]
  supervisorProfiles?: Map<
    string,
    { id: string; name: string; email: string | null; avatarUrl: string | null }
  >
}): SupervisorPerformanceData {
  const { month, projects, participants = [], reports, supervisorProfiles } = input

  // Filter Active Projects using canonical active status logic
  const activeProjects = projects.filter(
    (p) => normalizeProjectStatus(p.status) === "active",
  )

  // Map participants by project_id for fast supervisor resolution
  const activeSupervisorParticipantsByProject = new Map<string, string[]>()
  for (const part of participants) {
    const projId = part.project_id ?? part.projectId
    const userId = part.key_contact_user_id ?? part.keyContactUserId
    if (!projId || !userId) continue

    if (isSupervisorParticipant(part)) {
      const list = activeSupervisorParticipantsByProject.get(projId) ?? []
      if (!list.includes(userId)) list.push(userId)
      activeSupervisorParticipantsByProject.set(projId, list)
    }
  }

  // Filter valid completed reports in target month across all projects
  const validMonthReports = reports.filter(
    (report) => isValidCompletedReport(report) && isReportInMonth(report, month),
  )

  // Group reports by project_id for project-level compliance calculation
  const reportsByProjectId = new Map<string, RawReportRecord[]>()
  for (const report of validMonthReports) {
    const projId = report.project_id ?? report.projectId
    if (!projId) continue
    const list = reportsByProjectId.get(projId) ?? []
    list.push(report)
    reportsByProjectId.set(projId, list)
  }

  // Count actual completed visit activity by creator (created_by)
  const reportsByCreator = new Map<string, number>()
  for (const report of validMonthReports) {
    const creatorId = report.created_by ?? report.createdBy ?? null
    if (creatorId) {
      reportsByCreator.set(creatorId, (reportsByCreator.get(creatorId) ?? 0) + 1)
    }
  }

  // Calculate per-project metrics with unique supervisorIds set
  const allProjectRows: ProjectComplianceMetrics[] = activeProjects.map((project) => {
    const projReports = reportsByProjectId.get(project.id) ?? []

    const supervisorSet = new Set<string>()
    const primarySup = project.assigned_supervisor_id ?? project.assignedSupervisorId ?? null
    if (primarySup) supervisorSet.add(primarySup)

    const additionalSups = activeSupervisorParticipantsByProject.get(project.id) ?? []
    for (const supId of additionalSups) {
      if (supId) supervisorSet.add(supId)
    }

    const supervisorIds = Array.from(supervisorSet)
    return calculateProjectMetrics(project, projReports, month, supervisorIds)
  })

  // Group project rows by supervisor ID (supporting multi-supervisor workload attribution)
  const projectsBySupervisor = new Map<string, ProjectComplianceMetrics[]>()
  const unassignedProjects: ProjectComplianceMetrics[] = []

  for (const row of allProjectRows) {
    if (row.supervisorIds.length > 0) {
      for (const supId of row.supervisorIds) {
        const list = projectsBySupervisor.get(supId) ?? []
        list.push(row)
        projectsBySupervisor.set(supId, list)
      }
    } else {
      unassignedProjects.push(row)
    }
  }

  // Collect all unique person IDs: all supervisors on active projects + all report creators
  const allPersonIds = new Set<string>()
  for (const row of allProjectRows) {
    for (const supId of row.supervisorIds) {
      allPersonIds.add(supId)
    }
  }
  for (const creatorId of reportsByCreator.keys()) {
    allPersonIds.add(creatorId)
  }

  // Build SupervisorPerformanceMetrics for each person
  const supervisors: SupervisorPerformanceMetrics[] = Array.from(allPersonIds).map(
    (supervisorId) => {
      const profile = supervisorProfiles?.get(supervisorId)
      const supervisorName = profile?.name ?? "Supervisor"
      const supervisorEmail = profile?.email ?? null
      const supervisorAvatarUrl = profile?.avatarUrl ?? null

      const projRows = projectsBySupervisor.get(supervisorId) ?? []
      const activeProjectsCount = projRows.length
      const complianceProjectsCount = projRows.filter((p) => p.isComplianceEligible).length

      // Actual Completed Visits Activity: Attributed directly to created_by
      const completedVisits = reportsByCreator.get(supervisorId) ?? 0

      return {
        supervisorId,
        supervisorName,
        supervisorEmail,
        supervisorAvatarUrl,
        activeProjectsCount,
        complianceProjectsCount,
        completedVisits,
        projects: projRows,
      }
    },
  )

  // Sort supervisors alphabetically by name
  supervisors.sort((a, b) => a.supervisorName.localeCompare(b.supervisorName))

  // Organization-level summary aggregation (Projects counted ONCE)
  const complianceEligibleRows = allProjectRows.filter((p) => p.isComplianceEligible)

  const totalActiveProjects = allProjectRows.length
  const activeSupervisorsCount = supervisors.filter(
    (s) => s.activeProjectsCount > 0 || s.completedVisits > 0,
  ).length
  const complianceEligibleProjectsCount = complianceEligibleRows.length

  const orgRequiredVisits = complianceEligibleRows.reduce((acc, p) => acc + p.required, 0)
  const orgCompletedVisits = validMonthReports.length
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
