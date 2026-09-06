import {
  addCalendarDays as addCalendarDaysToKey,
  currentCalendarDateKey,
  isCalendarDateKey,
  calendarDateFromKey,
  APPLICATION_TIME_ZONE,
} from "@/lib/calendar/date"
import { normalizeProjectStatus } from "@/lib/projects/project-status"
import {
  getEffectiveVisitDate,
  isSupervisorParticipant,
  isValidCompletedReport,
  normalizeComplianceSupervisionType,
} from "./compliance"
import type {
  ComplianceCalendarWeek,
  CompliancePeriod,
  CompliancePeriodStatus,
  ComplianceReportItem,
  ProjectComplianceTimelineRow,
  ProjectWeeklyCell,
  RawParticipantRecord,
  RawProjectRecord,
  RawReportRecord,
  SupervisionComplianceType,
  SupervisorVisitComplianceDashboardData,
} from "./types"

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * Adds or subtracts days from a Date object or a YYYY-MM-DD date string key without mutating the input.
 */
export function addCalendarDays(date: Date, days: number): Date
export function addCalendarDays(dateKey: string, days: number): string
export function addCalendarDays(dateOrKey: Date | string, days: number): Date | string {
  if (dateOrKey instanceof Date) {
    const result = new Date(dateOrKey)
    result.setDate(result.getDate() + days)
    return result
  }
  return addCalendarDaysToKey(dateOrKey, days)
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Returns the Sunday for any given YYYY-MM-DD date key in UTC.
 */
export function getSundayForDateKey(dateKey: string): string {
  if (!isCalendarDateKey(dateKey)) throw new Error(`Invalid calendar date key: ${dateKey}`)
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const dayOfWeek = date.getUTCDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  return addCalendarDays(dateKey, -dayOfWeek)
}

/**
 * Returns the Saturday for any given YYYY-MM-DD date key in UTC.
 */
export function getSaturdayForDateKey(dateKey: string): string {
  const sunday = getSundayForDateKey(dateKey)
  return addCalendarDays(sunday, 6)
}

/**
 * Formats a short week label e.g. "Aug 30 - Sep 5" or "Sep 1 - Sep 7"
 */
export function formatWeekLabel(startDateKey: string, endDateKey: string): string {
  const [startYear, startMonth, startDay] = startDateKey.split("-").map(Number)
  const [endYear, endMonth, endDay] = endDateKey.split("-").map(Number)

  const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay))
  const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay))

  const startMonthName = startDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
  const endMonthName = endDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })

  if (startMonthName === endMonthName) {
    return `${startMonthName} ${startDay}–${endDay}`
  }
  return `${startMonthName} ${startDay} – ${endMonthName} ${endDay}`
}

/**
 * Generates Sunday -> Saturday calendar weeks covering rangeStart to rangeEnd.
 */
export function generateCalendarWeeks(options: {
  rangeStart: string
  rangeEnd: string
  referenceDate?: string
}): ComplianceCalendarWeek[] {
  const { rangeStart, rangeEnd, referenceDate = currentCalendarDateKey() } = options
  if (!isCalendarDateKey(rangeStart) || !isCalendarDateKey(rangeEnd)) {
    throw new Error("Invalid date range for generating calendar weeks")
  }

  const firstSunday = getSundayForDateKey(rangeStart)
  const lastSaturday = getSaturdayForDateKey(rangeEnd)
  const currentSunday = getSundayForDateKey(referenceDate)

  const weeks: ComplianceCalendarWeek[] = []
  let cursor = firstSunday
  let index = 0

  while (cursor <= lastSaturday) {
    const weekStart = cursor
    const weekEnd = addCalendarDays(cursor, 6)
    const weekKey = `${weekStart}_${weekEnd}`
    const isCurrentWeek = weekStart === currentSunday
    const isPastWeek = weekEnd < referenceDate && !isCurrentWeek
    const isFutureWeek = weekStart > referenceDate && !isCurrentWeek

    weeks.push({
      weekIndex: index,
      weekKey,
      startDate: weekStart,
      endDate: weekEnd,
      label: formatWeekLabel(weekStart, weekEnd),
      isCurrentWeek,
      isPastWeek,
      isFutureWeek,
    })

    cursor = addCalendarDays(cursor, 7)
    index += 1
  }

  return weeks
}

/**
 * Generates a rolling window of calendar weeks around referenceDate (default: 3 past weeks, current, 4 future weeks).
 */
export function generateWeeklyWindow(options?: {
  referenceDate?: string
  pastWeeks?: number
  futureWeeks?: number
}): ComplianceCalendarWeek[] {
  const referenceDate = options?.referenceDate ?? currentCalendarDateKey()
  const pastWeeks = Math.max(0, options?.pastWeeks ?? 3)
  const futureWeeks = Math.max(0, options?.futureWeeks ?? 4)

  const currentSunday = getSundayForDateKey(referenceDate)
  const windowStart = addCalendarDays(currentSunday, -(pastWeeks * 7))
  const windowEnd = addCalendarDays(currentSunday, futureWeeks * 7 + 6)

  return generateCalendarWeeks({
    rangeStart: windowStart,
    rangeEnd: windowEnd,
    referenceDate,
  })
}

export type PeriodTemplate = {
  periodIndex: number
  startDate: string
  endDate: string
  requiredVisits: number
}

/**
 * Generates requirement period boundaries for a given month and supervision type.
 */
export function generateRequirementPeriodTemplates(
  monthKey: string, // YYYY-MM
  supervisionType: SupervisionComplianceType,
): PeriodTemplate[] {
  const [yearStr, monthStr] = monthKey.split("-")
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const lastDay = getDaysInMonth(year, month)

  if (supervisionType === "monthly_2") {
    return [
      {
        periodIndex: 1,
        startDate: `${monthKey}-01`,
        endDate: `${monthKey}-15`,
        requiredVisits: 1,
      },
      {
        periodIndex: 2,
        startDate: `${monthKey}-16`,
        endDate: `${monthKey}-${pad(lastDay)}`,
        requiredVisits: 1,
      },
    ]
  }

  if (supervisionType === "monthly_3") {
    return [
      {
        periodIndex: 1,
        startDate: `${monthKey}-01`,
        endDate: `${monthKey}-10`,
        requiredVisits: 1,
      },
      {
        periodIndex: 2,
        startDate: `${monthKey}-11`,
        endDate: `${monthKey}-20`,
        requiredVisits: 1,
      },
      {
        periodIndex: 3,
        startDate: `${monthKey}-21`,
        endDate: `${monthKey}-${pad(lastDay)}`,
        requiredVisits: 1,
      },
    ]
  }

  if (supervisionType === "monthly_4") {
    return [
      {
        periodIndex: 1,
        startDate: `${monthKey}-01`,
        endDate: `${monthKey}-07`,
        requiredVisits: 1,
      },
      {
        periodIndex: 2,
        startDate: `${monthKey}-08`,
        endDate: `${monthKey}-14`,
        requiredVisits: 1,
      },
      {
        periodIndex: 3,
        startDate: `${monthKey}-15`,
        endDate: `${monthKey}-21`,
        requiredVisits: 1,
      },
      {
        periodIndex: 4,
        startDate: `${monthKey}-22`,
        endDate: `${monthKey}-${pad(lastDay)}`,
        requiredVisits: 1,
      },
    ]
  }

  return []
}

/**
 * Normalizes project effective start date string (YYYY-MM-DD).
 */
export function getProjectEffectiveStartDate(project: RawProjectRecord): string | null {
  const rawDate =
    project.supervision_start_date ??
    project.supervisionStartDate ??
    project.start_date ??
    project.startDate ??
    null

  if (!rawDate || typeof rawDate !== "string") return null
  const trimmed = rawDate.trim()
  if (isCalendarDateKey(trimmed)) return trimmed
  if (trimmed.length >= 10 && isCalendarDateKey(trimmed.slice(0, 10))) {
    return trimmed.slice(0, 10)
  }
  return null
}

export type PeriodEvaluationInput = {
  projectId: string
  monthKey: string
  template: PeriodTemplate
  projectReports: RawReportRecord[]
  projectStartDate: string | null
  projectStatus: string | null
  today: string
  supervisorProfiles?: Map<
    string,
    { id: string; name: string; email: string | null; avatarUrl: string | null }
  >
}

/**
 * Pure evaluation of a single requirement period against project start/end rules and valid inspection reports.
 */
export function evaluateCompliancePeriod(input: PeriodEvaluationInput): CompliancePeriod {
  const {
    projectId,
    monthKey,
    template,
    projectReports,
    projectStartDate,
    projectStatus,
    today,
    supervisorProfiles,
  } = input

  const { periodIndex, startDate, endDate, requiredVisits: defaultRequired } = template
  const periodId = `${projectId}_${monthKey}_p${periodIndex}`

  // Filter valid completed reports whose effective visit date falls inside this period
  const matchingReports: ComplianceReportItem[] = []
  for (const r of projectReports) {
    if (!isValidCompletedReport(r)) continue
    const effectiveDate = getEffectiveVisitDate(r)
    if (!effectiveDate) continue

    if (effectiveDate >= startDate && effectiveDate <= endDate) {
      const creatorId = r.created_by ?? r.createdBy ?? null
      const creatorProfile = creatorId ? supervisorProfiles?.get(creatorId) : null
      const creatorName = creatorProfile?.name ?? null

      const rawVisitNo = r.visit_number ?? r.visitNumber
      const parsedVisitNo =
        typeof rawVisitNo === "number"
          ? rawVisitNo
          : typeof rawVisitNo === "string"
            ? parseInt(rawVisitNo, 10)
            : null
      const visitNumber =
        Number.isInteger(parsedVisitNo) && (parsedVisitNo as number) > 0
          ? (parsedVisitNo as number)
          : null

      const reportNumber = (r.report_number ?? r.reportNumber ?? "").trim() || null
      const reportTitle = (r.report_title ?? r.reportTitle ?? "").trim() || null

      matchingReports.push({
        id: r.id,
        projectId,
        reportNumber,
        visitNumber,
        visitDate: effectiveDate,
        status: (r.status ?? "completed").trim(),
        createdBy: creatorId,
        creatorName,
        reportTitle,
      })
    }
  }

  // Sort matching reports chronologically by visitDate ASC
  matchingReports.sort((a, b) => a.visitDate.localeCompare(b.visitDate) || a.id.localeCompare(b.id))
  const actualVisits = matchingReports.length

  // Rule 1: Project Start Date Evaluation
  // Case A: Project starts AFTER period.endDate -> NOT_APPLICABLE
  // Case B: Project starts INSIDE period (starts > period.startDate AND <= period.endDate) -> NOT_APPLICABLE for missing/compliance requirement
  // Case C: Project starts ON or BEFORE period.startDate -> normal requirement applies
  let isNotApplicableByStart = false
  if (projectStartDate) {
    if (projectStartDate > endDate) {
      isNotApplicableByStart = true
    } else if (projectStartDate > startDate && projectStartDate <= endDate) {
      isNotApplicableByStart = true
    }
  }

  // Rule 2: Project Completion / Ended Evaluation
  // If project is completed/inactive/stopped/final_visit:
  // - Future periods (endDate >= today) do not generate required visits or missing status.
  // - Historical periods (endDate < today) remain evaluated normally.
  const normalizedStatus = normalizeProjectStatus(projectStatus)
  const isEnded = ["completed", "inactive", "stopped", "final_visit"].includes(normalizedStatus)
  const isFutureOrActivePeriod = endDate >= today
  const isNotApplicableByCompletion = isEnded && isFutureOrActivePeriod

  if (isNotApplicableByStart || isNotApplicableByCompletion) {
    return {
      id: periodId,
      projectId,
      monthKey,
      periodIndex,
      startDate,
      endDate,
      requiredVisits: 0,
      actualVisits,
      status: "not_applicable",
      reports: matchingReports,
    }
  }

  const requiredVisits = defaultRequired

  let status: CompliancePeriodStatus
  if (actualVisits > requiredVisits) {
    status = "extra"
  } else if (actualVisits === requiredVisits) {
    status = "done"
  } else {
    // actualVisits < requiredVisits
    if (endDate < today) {
      status = "missing"
    } else {
      status = "upcoming"
    }
  }

  return {
    id: periodId,
    projectId,
    monthKey,
    periodIndex,
    startDate,
    endDate,
    requiredVisits,
    actualVisits,
    status,
    reports: matchingReports,
  }
}

/**
 * Returns all YYYY-MM months touched by a date range [rangeStart, rangeEnd].
 */
export function getMonthsBetween(rangeStart: string, rangeEnd: string): string[] {
  const months = new Set<string>()
  const startMonth = rangeStart.slice(0, 7)
  const endMonth = rangeEnd.slice(0, 7)

  let [year, month] = startMonth.split("-").map(Number)
  const [endYear, endMonthNum] = endMonth.split("-").map(Number)

  while (year < endYear || (year === endYear && month <= endMonthNum)) {
    months.add(`${year}-${pad(month)}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  return Array.from(months)
}

/**
 * Maps periods and reports for a single project into the weekly timeline cells.
 */
export function buildProjectTimelineRow(input: {
  project: RawProjectRecord
  supervisorProfiles?: Map<
    string,
    { id: string; name: string; email: string | null; avatarUrl: string | null }
  >
  participants: RawParticipantRecord[]
  reports: RawReportRecord[]
  weeks: ComplianceCalendarWeek[]
  today: string
}): ProjectComplianceTimelineRow {
  const { project, supervisorProfiles, participants, reports, weeks, today } = input

  const rawSupervisionType = project.supervision_type ?? project.supervisionType ?? null
  const normalizedSupervisionType = normalizeComplianceSupervisionType(rawSupervisionType)
  const isComplianceEligible = normalizedSupervisionType !== null

  const projectStartDate = getProjectEffectiveStartDate(project)
  const normalizedStatus = normalizeProjectStatus(project.status)

  // Resolve assigned supervisors (Primary + Additional active) without double counting
  const supervisorSet = new Set<string>()
  const primarySup = project.assigned_supervisor_id ?? project.assignedSupervisorId ?? null
  if (primarySup) supervisorSet.add(primarySup)

  for (const part of participants) {
    const projId = part.project_id ?? part.projectId
    const userId = part.key_contact_user_id ?? part.keyContactUserId
    if (projId === project.id && userId && isSupervisorParticipant(part)) {
      supervisorSet.add(userId)
    }
  }

  const supervisorIds = Array.from(supervisorSet)
  const supervisors = supervisorIds.map((supId) => {
    const prof = supervisorProfiles?.get(supId)
    return {
      id: supId,
      name: prof?.name ?? "Supervisor",
      email: prof?.email ?? null,
      avatarUrl: prof?.avatarUrl ?? null,
      isPrimary: supId === primarySup,
    }
  })

  // Filter valid reports for this project
  const projectReports = reports.filter((r) => {
    const projId = r.project_id ?? r.projectId
    return projId === project.id
  })

  // Determine all months spanned by the weekly timeline
  const firstWeekStart = weeks.length > 0 ? weeks[0].startDate : today
  const lastWeekEnd = weeks.length > 0 ? weeks[weeks.length - 1].endDate : today
  const touchedMonths = getMonthsBetween(firstWeekStart, lastWeekEnd)

  // Generate and evaluate all requirement periods across touched months
  const periods: CompliancePeriod[] = []
  if (normalizedSupervisionType) {
    for (const monthKey of touchedMonths) {
      const templates = generateRequirementPeriodTemplates(monthKey, normalizedSupervisionType)
      for (const template of templates) {
        const evaluatedPeriod = evaluateCompliancePeriod({
          projectId: project.id,
          monthKey,
          template,
          projectReports,
          projectStartDate,
          projectStatus: project.status ?? null,
          today,
          supervisorProfiles,
        })
        periods.push(evaluatedPeriod)
      }
    }
  }

  // Pre-index valid reports with effective date into a list of ComplianceReportItem
  const allProjectReportItems: ComplianceReportItem[] = []
  for (const r of projectReports) {
    if (!isValidCompletedReport(r)) continue
    const effectiveDate = getEffectiveVisitDate(r)
    if (!effectiveDate) continue

    const creatorId = r.created_by ?? r.createdBy ?? null
    const creatorProfile = creatorId ? supervisorProfiles?.get(creatorId) : null

    const rawVisitNo = r.visit_number ?? r.visitNumber
    const parsedVisitNo =
      typeof rawVisitNo === "number"
        ? rawVisitNo
        : typeof rawVisitNo === "string"
          ? parseInt(rawVisitNo, 10)
          : null
    const visitNumber =
      Number.isInteger(parsedVisitNo) && (parsedVisitNo as number) > 0
        ? (parsedVisitNo as number)
        : null

    const stageId = (r.project_stage_id ?? r.projectStageId ?? "").trim() || null
    const href = stageId
      ? `/projects/${project.id}/stages/${stageId}/reports/${r.id}`
      : `/projects/${project.id}`

    allProjectReportItems.push({
      id: r.id,
      projectId: project.id,
      stageId,
      href,
      reportNumber: (r.report_number ?? r.reportNumber ?? "").trim() || null,
      visitNumber,
      visitDate: effectiveDate,
      status: (r.status ?? "completed").trim(),
      createdBy: creatorId,
      creatorName: creatorProfile?.name ?? null,
      reportTitle: (r.report_title ?? r.reportTitle ?? "").trim() || null,
    })
  }

  // Build weekly cells
  const weeklyCells: Record<string, ProjectWeeklyCell> = {}
  for (const week of weeks) {
    // 1. Find overlapping requirement periods where: period.startDate <= week.endDate AND period.endDate >= week.startDate
    const overlapping = periods.filter(
      (p) => p.startDate <= week.endDate && p.endDate >= week.startDate,
    )

    // 2. Find actual valid reports during this Sunday -> Saturday week
    const weekReports = allProjectReportItems.filter(
      (rep) => rep.visitDate >= week.startDate && rep.visitDate <= week.endDate,
    )

    // Determine aggregate primary status and weekly compliance requirements
    const isApplicableWeek =
      isComplianceEligible &&
      overlapping.length > 0 &&
      overlapping.some((p) => p.status !== "not_applicable")

    let requiredVisits = 0
    let cellStatus: CompliancePeriodStatus = "not_applicable"
    const completedVisits = weekReports.length

    if (isApplicableWeek) {
      requiredVisits = 1

      if (completedVisits > requiredVisits) {
        cellStatus = "extra"
      } else if (completedVisits === requiredVisits) {
        cellStatus = "done"
      } else if (week.endDate < today) {
        cellStatus = "missing"
      } else {
        cellStatus = "upcoming"
      }
    }

    weeklyCells[week.weekKey] = {
      weekKey: week.weekKey,
      startDate: week.startDate,
      endDate: week.endDate,
      requiredVisits,
      completedVisits,
      status: cellStatus,
      overlappingPeriods: overlapping,
      actualReports: weekReports,
      totalActualVisits: completedVisits,
      primaryStatus: cellStatus,
    }
  }

  return {
    projectId: project.id,
    projectName: project.name?.trim() || "Untitled Project",
    projectCode: project.code?.trim() || "N/A",
    status: project.status ?? null,
    normalizedStatus,
    supervisionType: rawSupervisionType,
    normalizedSupervisionType,
    isComplianceEligible,
    startDate: project.start_date ?? project.startDate ?? null,
    supervisionStartDate: project.supervision_start_date ?? project.supervisionStartDate ?? null,
    assignedSupervisorId: primarySup,
    supervisorIds,
    supervisors,
    periods,
    weeklyCells,
  }
}

/**
 * Top-level pure calculation engine for the Supervisor Visit Compliance Dashboard.
 */
export function calculateSupervisorVisitCompliance(input: {
  projects: RawProjectRecord[]
  participants?: RawParticipantRecord[]
  reports: RawReportRecord[]
  supervisorProfiles?: Map<
    string,
    { id: string; name: string; email: string | null; avatarUrl: string | null }
  >
  weeks: ComplianceCalendarWeek[]
  today?: string
}): SupervisorVisitComplianceDashboardData {
  const {
    projects,
    participants = [],
    reports,
    supervisorProfiles = new Map(),
    weeks,
    today = currentCalendarDateKey(),
  } = input

  const rangeStart = weeks.length > 0 ? weeks[0].startDate : today
  const rangeEnd = weeks.length > 0 ? weeks[weeks.length - 1].endDate : today

  // Build ProjectComplianceTimelineRow for each project
  const projectRows = projects.map((project) =>
    buildProjectTimelineRow({
      project,
      supervisorProfiles,
      participants,
      reports,
      weeks,
      today,
    }),
  )

  // Sort projects alphabetically by name
  projectRows.sort((a, b) => a.projectName.localeCompare(b.projectName))

  // Collect distinct supervisors and calculate their assigned active project counts
  const supervisorMap = new Map<
    string,
    { id: string; name: string; email: string | null; avatarUrl: string | null; count: number }
  >()

  for (const row of projectRows) {
    for (const sup of row.supervisors) {
      const existing = supervisorMap.get(sup.id)
      if (existing) {
        if (row.normalizedStatus === "active") {
          existing.count += 1
        }
      } else {
        supervisorMap.set(sup.id, {
          id: sup.id,
          name: sup.name,
          email: sup.email,
          avatarUrl: sup.avatarUrl,
          count: row.normalizedStatus === "active" ? 1 : 0,
        })
      }
    }
  }

  // Also include any profile that created a report in the period
  for (const r of reports) {
    const creatorId = r.created_by ?? r.createdBy ?? null
    if (creatorId && !supervisorMap.has(creatorId)) {
      const prof = supervisorProfiles.get(creatorId)
      supervisorMap.set(creatorId, {
        id: creatorId,
        name: prof?.name ?? "Supervisor",
        email: prof?.email ?? null,
        avatarUrl: prof?.avatarUrl ?? null,
        count: 0,
      })
    }
  }

  const supervisors = Array.from(supervisorMap.values()).map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    avatarUrl: s.avatarUrl,
    assignedProjectsCount: s.count,
  }))
  supervisors.sort((a, b) => a.name.localeCompare(b.name))

  return {
    rangeStart,
    rangeEnd,
    referenceDate: today,
    weeks,
    projects: projectRows,
    supervisors,
  }
}
