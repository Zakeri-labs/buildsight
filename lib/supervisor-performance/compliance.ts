import { addCalendarDays } from "@/lib/calendar/date"
import { applicationDateStartUtc } from "@/lib/dashboard/date-range"
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

export function getReportActivityTimestamp(report: RawReportRecord): string | null {
  const submittedAt = report.submitted_at ?? report.submittedAt
  if (submittedAt && typeof submittedAt === "string" && submittedAt.trim().length > 0) {
    return submittedAt.trim()
  }
  const createdAt = report.created_at ?? report.createdAt
  if (createdAt && typeof createdAt === "string" && createdAt.trim().length > 0) {
    return createdAt.trim()
  }
  return null
}

export function isReportInActivityRange(
  report: RawReportRecord,
  startUtc: string,
  endExclusiveUtc: string,
): boolean {
  const ts = getReportActivityTimestamp(report)
  if (!ts) return false
  return ts >= startUtc && ts < endExclusiveUtc
}

export function isValidCompletedReport(report: RawReportRecord): boolean {
  const status = (report.status ?? "").trim().toLowerCase()
  if (!status || status === "draft" || status === "in_progress" || status === "deleted" || status === "cancelled") {
    return false
  }

  return ["submitted", "under_review", "approved", "rejected", "completed"].includes(status)
}

export function formatMonthLabel(monthStr: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthStr)) return monthStr
  const [yearStr, monthNumStr] = monthStr.split("-")
  const year = parseInt(yearStr, 10)
  const monthIndex = parseInt(monthNumStr, 10) - 1
  const date = new Date(year, monthIndex, 1)
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export function formatCustomRangeLabel(startDateKey: string, endDateKey: string): string {
  const [sYear, sMonth, sDay] = startDateKey.split("-").map(Number)
  const [eYear, eMonth, eDay] = endDateKey.split("-").map(Number)
  const sDate = new Date(Date.UTC(sYear, sMonth - 1, sDay))
  const eDate = new Date(Date.UTC(eYear, eMonth - 1, eDay))

  const sMonthName = sDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
  const eMonthName = eDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })

  return `${sMonthName} ${sDay}, ${sYear} – ${eMonthName} ${eDay}, ${eYear}`
}

export function getAdjacentMonth(monthStr: string, delta: number): string {
  if (!/^\d{4}-\d{2}$/.test(monthStr)) return monthStr
  const [yearStr, monthNumStr] = monthStr.split("-")
  let year = parseInt(yearStr, 10)
  let monthNum = parseInt(monthNumStr, 10) + delta

  if (monthNum < 1) {
    monthNum = 12
    year -= 1
  } else if (monthNum > 12) {
    monthNum = 1
    year += 1
  }
  return `${year}-${String(monthNum).padStart(2, "0")}`
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function getAdjacentDateRange(
  startDate: string,
  endDate: string,
  direction: -1 | 1,
): { startDate: string; endDate: string } {
  const [sYear, sMonth, sDay] = startDate.split("-").map(Number)
  const [eYear, eMonth, eDay] = endDate.split("-").map(Number)
  const sDate = new Date(Date.UTC(sYear, sMonth - 1, sDay))
  const eDate = new Date(Date.UTC(eYear, eMonth - 1, eDay))
  const diffDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1)

  if (direction === -1) {
    const newEnd = addDaysToDateKey(startDate, -1)
    const newStart = addDaysToDateKey(newEnd, -(diffDays - 1))
    return { startDate: newStart, endDate: newEnd }
  } else {
    const newStart = addDaysToDateKey(endDate, 1)
    const newEnd = addDaysToDateKey(newStart, diffDays - 1)
    return { startDate: newStart, endDate: newEnd }
  }
}

export function isReportInDateRange(
  report: RawReportRecord,
  startDate: string,
  endDate: string,
): boolean {
  const effectiveDate = getEffectiveVisitDate(report)
  if (!effectiveDate) return false
  return effectiveDate >= startDate && effectiveDate <= endDate
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
  supervisorIds: string[],
): ProjectComplianceMetrics {
  const rawSupervisionType = project.supervision_type ?? project.supervisionType ?? null
  const normalizedType = normalizeComplianceSupervisionType(rawSupervisionType)
  const normalizedStatus = normalizeProjectStatus(project.status)
  const isActive = normalizedStatus === "active"
  const isComplianceEligible = isActive && normalizedType !== null
  const required = isComplianceEligible && normalizedType ? REQUIRED_VISITS_BY_SUPERVISION_TYPE[normalizedType] : 0

  const assignedSupervisorId = project.assigned_supervisor_id ?? project.assignedSupervisorId ?? null

  const totalSubmittedReports = reportsForProject.length

  let completedReports = 0
  let extraReports = 0
  let creditedCompleted = 0
  let missed = 0

  if (isComplianceEligible && required > 0) {
    completedReports = Math.min(totalSubmittedReports, required)
    extraReports = Math.max(totalSubmittedReports - required, 0)
    creditedCompleted = completedReports
    missed = Math.max(required - totalSubmittedReports, 0)
  } else {
    completedReports = totalSubmittedReports
    extraReports = 0
    creditedCompleted = 0
    missed = 0
  }

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
    completed: completedReports,
    creditedCompleted,
    missed,
    extra: extraReports,
    totalSubmittedReports,
    completedReports,
    extraReports,
    compliancePercentage,
  }
}

export function calculateSupervisorPerformance(input: {
  month?: string
  startDate?: string
  endDate?: string
  projects: RawProjectRecord[]
  participants?: RawParticipantRecord[]
  reports: RawReportRecord[]
  supervisorProfiles?: Map<
    string,
    { id: string; name: string; email: string | null; avatarUrl: string | null }
  >
}): SupervisorPerformanceData {
  const {
    month: inputMonth,
    startDate: inputStartDate,
    endDate: inputEndDate,
    projects,
    participants = [],
    reports,
    supervisorProfiles,
  } = input

  // Determine period parameters
  let startDate: string
  let endDate: string
  let periodMode: "month" | "custom"
  let displayMonth: string
  let periodLabel: string

  if (
    inputStartDate &&
    inputEndDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(inputStartDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(inputEndDate)
  ) {
    startDate = inputStartDate <= inputEndDate ? inputStartDate : inputEndDate
    endDate = inputStartDate <= inputEndDate ? inputEndDate : inputStartDate
    periodMode = "custom"
    periodLabel = formatCustomRangeLabel(startDate, endDate)
    displayMonth = periodLabel
  } else {
    const rawMonth = inputMonth?.trim() || ""
    const normalizedMonth = /^\d{4}-\d{2}$/.test(rawMonth)
      ? rawMonth
      : new Date().toISOString().slice(0, 7)
    const [yearStr, monthStr] = normalizedMonth.split("-")
    const lastDay = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate()
    startDate = `${normalizedMonth}-01`
    endDate = `${normalizedMonth}-${String(lastDay).padStart(2, "0")}`
    periodMode = "month"
    periodLabel = formatMonthLabel(normalizedMonth)
    displayMonth = normalizedMonth
  }

  const startUtc = applicationDateStartUtc(startDate)
  const endExclusiveUtc = applicationDateStartUtc(addCalendarDays(endDate, 1))

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

  // Filter valid completed reports in target period matching /reports definition
  const validReports = reports.filter(
    (report) =>
      isValidCompletedReport(report) &&
      isReportInActivityRange(report, startUtc, endExclusiveUtc),
  )

  // Group reports by project_id
  const reportsByProjectId = new Map<string, RawReportRecord[]>()
  for (const report of validReports) {
    const projId = report.project_id ?? report.projectId
    if (!projId) continue
    const list = reportsByProjectId.get(projId) ?? []
    list.push(report)
    reportsByProjectId.set(projId, list)
  }

  // Tag every individual report as extra (true) or completed (false)
  const reportIsExtraMap = new Map<string, boolean>()
  for (const project of projects) {
    const projReports = reportsByProjectId.get(project.id) ?? []
    if (projReports.length === 0) continue

    projReports.sort((a, b) => {
      const tsA = getReportActivityTimestamp(a) ?? ""
      const tsB = getReportActivityTimestamp(b) ?? ""
      return tsA.localeCompare(tsB) || (a.id || "").localeCompare(b.id || "")
    })

    const normStatus = normalizeProjectStatus(project.status)
    const isActive = normStatus === "active"
    const rawSupervisionType = project.supervision_type ?? project.supervisionType ?? null
    const normalizedType = normalizeComplianceSupervisionType(rawSupervisionType)
    const isComplianceEligible = isActive && normalizedType !== null
    const quota = isComplianceEligible && normalizedType ? REQUIRED_VISITS_BY_SUPERVISION_TYPE[normalizedType] : 0

    for (let i = 0; i < projReports.length; i++) {
      const rep = projReports[i]
      if (isComplianceEligible && quota > 0) {
        if (i < quota) {
          reportIsExtraMap.set(rep.id, false)
        } else {
          reportIsExtraMap.set(rep.id, true)
        }
      } else {
        reportIsExtraMap.set(rep.id, false)
      }
    }
  }

  // Safety fallback for any report whose project is not in projects list
  for (const rep of validReports) {
    if (!reportIsExtraMap.has(rep.id)) {
      reportIsExtraMap.set(rep.id, false)
    }
  }

  // Group valid reports by creator (created_by)
  const reportsByCreator = new Map<string, RawReportRecord[]>()
  for (const report of validReports) {
    const creatorId = report.created_by ?? report.createdBy ?? null
    if (creatorId) {
      const list = reportsByCreator.get(creatorId) ?? []
      list.push(report)
      reportsByCreator.set(creatorId, list)
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
    return calculateProjectMetrics(project, projReports, supervisorIds)
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
      const compProjects = projRows.filter((p) => p.isComplianceEligible)
      const complianceProjectsCount = compProjects.length

      // Author reports breakdown
      const authorReports = reportsByCreator.get(supervisorId) ?? []
      const totalSubmittedReports = authorReports.length
      const completedReports = authorReports.filter((r) => reportIsExtraMap.get(r.id) === false).length
      const extraReports = authorReports.filter((r) => reportIsExtraMap.get(r.id) === true).length

      // Contractual compliance metrics for assigned projects
      const requiredVisits = compProjects.reduce((acc, p) => acc + p.required, 0)
      const creditedCompletedVisits = compProjects.reduce(
        (acc, p) => acc + p.creditedCompleted,
        0,
      )
      const missedVisits = compProjects.reduce((acc, p) => acc + p.missed, 0)
      const extraVisits = compProjects.reduce((acc, p) => acc + p.extra, 0)

      return {
        supervisorId,
        supervisorName,
        supervisorEmail,
        supervisorAvatarUrl,
        activeProjectsCount,
        complianceProjectsCount,
        completedVisits: totalSubmittedReports,
        requiredVisits,
        creditedCompletedVisits,
        missedVisits,
        extraVisits,
        totalSubmittedReports,
        completedReports,
        extraReports,
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
    (s) => s.activeProjectsCount > 0 || s.totalSubmittedReports > 0,
  ).length
  const complianceEligibleProjectsCount = complianceEligibleRows.length

  const orgRequiredVisits = complianceEligibleRows.reduce((acc, p) => acc + p.required, 0)
  const orgCreditedCompletedVisits = complianceEligibleRows.reduce(
    (acc, p) => acc + p.creditedCompleted,
    0,
  )
  const orgMissedVisits = complianceEligibleRows.reduce((acc, p) => acc + p.missed, 0)
  const orgVisitCompliancePercentage =
    orgRequiredVisits > 0
      ? Math.round((orgCreditedCompletedVisits / orgRequiredVisits) * 1000) / 10
      : null

  const orgTotalSubmittedReports = validReports.length
  let orgCompletedReports = 0
  let orgExtraReports = 0
  for (const r of validReports) {
    if (reportIsExtraMap.get(r.id) === true) {
      orgExtraReports += 1
    } else {
      orgCompletedReports += 1
    }
  }

  const unassignedActiveProjectsCount = unassignedProjects.length
  const unassignedComplianceProjectsCount = unassignedProjects.filter(
    (p) => p.isComplianceEligible,
  ).length

  const organizationSummary: OrganizationPerformanceSummary = {
    totalActiveProjects,
    activeSupervisorsCount,
    complianceEligibleProjectsCount,
    requiredVisits: orgRequiredVisits,
    completedVisits: orgTotalSubmittedReports,
    creditedCompletedVisits: orgCreditedCompletedVisits,
    missedVisits: orgMissedVisits,
    extraVisits: orgExtraReports,
    totalSubmittedReports: orgTotalSubmittedReports,
    completedReports: orgCompletedReports,
    extraReports: orgExtraReports,
    visitCompliancePercentage: orgVisitCompliancePercentage,
    unassignedActiveProjectsCount,
    unassignedComplianceProjectsCount,
  }

  return {
    month: displayMonth,
    period: {
      mode: periodMode,
      month: periodMode === "month" ? displayMonth : undefined,
      startDate,
      endDate,
      label: periodLabel,
    },
    organizationSummary,
    supervisors,
    unassignedProjects,
    allProjectRows,
  }
}
