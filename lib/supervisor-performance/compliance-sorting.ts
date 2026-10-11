import type { ProjectComplianceTimelineRow } from "./types"

export type ComplianceSortOption =
  | "project_code_desc"
  | "project_code_asc"
  | "missing_visits_desc"
  | "lowest_compliance"
  | "highest_compliance"
  | "earliest_due"
  | "name_asc"
  | "name_desc"

export const COMPLIANCE_SORT_OPTIONS: Array<{ value: ComplianceSortOption; label: string }> = [
  { value: "project_code_desc", label: "Project Code (Newest First)" },
  { value: "project_code_asc", label: "Project Code (Oldest First)" },
  { value: "missing_visits_desc", label: "Most Missing Visits" },
  { value: "lowest_compliance", label: "Lowest Compliance" },
  { value: "highest_compliance", label: "Highest Compliance" },
  { value: "earliest_due", label: "Earliest Due Visit" },
  { value: "name_asc", label: "Project Name A-Z" },
  { value: "name_desc", label: "Project Name Z-A" },
]

export function getSortOptionLabel(option: ComplianceSortOption): string {
  const found = COMPLIANCE_SORT_OPTIONS.find((o) => o.value === option)
  return found ? found.label : "Project Code (Newest First)"
}

export function parseProjectCode(code: string | null | undefined): {
  year: number
  sequence: number
  raw: string
} {
  if (!code || typeof code !== "string") {
    return { year: 0, sequence: 0, raw: "" }
  }

  const trimmed = code.trim()
  if (!trimmed || trimmed === "N/A" || trimmed === "—") {
    return { year: 0, sequence: 0, raw: "" }
  }

  // Format: Bonyan/sup/YYYY/XXX or Bonyan/sup/YYYY-XXX or YYYY/XXX
  // Look for 4-digit year (e.g. 2024, 2025, 2026, 2027) followed by sequence number
  const matchWithYear = /(?:^|[^\d])(20\d{2})[^\d]+(\d+)(?:[^\d]|$)/i.exec(trimmed)
  if (matchWithYear) {
    const year = parseInt(matchWithYear[1], 10)
    const sequence = parseInt(matchWithYear[2], 10)
    return { year, sequence, raw: trimmed }
  }

  // Any 4-digit year in string
  const yearMatch = /(?:^|[^\d])(20\d{2})(?:[^\d]|$)/.exec(trimmed)
  const numbers = trimmed.match(/\d+/g)

  if (yearMatch && numbers) {
    const year = parseInt(yearMatch[1], 10)
    const nonYearNums = numbers.filter((n) => n !== yearMatch[1])
    const sequence = nonYearNums.length > 0 ? parseInt(nonYearNums[nonYearNums.length - 1], 10) : 0
    return { year, sequence, raw: trimmed }
  }

  if (numbers && numbers.length > 0) {
    const sequence = parseInt(numbers[numbers.length - 1], 10)
    return { year: 0, sequence, raw: trimmed }
  }

  return { year: 0, sequence: 0, raw: trimmed }
}

export function compareProjectCodeDesc(
  a: ProjectComplianceTimelineRow,
  b: ProjectComplianceTimelineRow,
): number {
  const parsedA = parseProjectCode(a.projectCode)
  const parsedB = parseProjectCode(b.projectCode)

  // 1. Year descending
  if (parsedA.year !== parsedB.year) {
    if (parsedA.year === 0) return 1
    if (parsedB.year === 0) return -1
    return parsedB.year - parsedA.year
  }

  // 2. Sequence descending
  if (parsedA.sequence !== parsedB.sequence) {
    return parsedB.sequence - parsedA.sequence
  }

  // 3. Fallback: string compare
  return (b.projectCode || "").localeCompare(a.projectCode || "")
}

export function compareProjectCodeAsc(
  a: ProjectComplianceTimelineRow,
  b: ProjectComplianceTimelineRow,
): number {
  const parsedA = parseProjectCode(a.projectCode)
  const parsedB = parseProjectCode(b.projectCode)

  // 1. Year ascending
  if (parsedA.year !== parsedB.year) {
    if (parsedA.year === 0) return 1
    if (parsedB.year === 0) return -1
    return parsedA.year - parsedB.year
  }

  // 2. Sequence ascending
  if (parsedA.sequence !== parsedB.sequence) {
    return parsedA.sequence - parsedB.sequence
  }

  // 3. Fallback: string compare
  return (a.projectCode || "").localeCompare(b.projectCode || "")
}

export function getMissingVisitsCount(project: ProjectComplianceTimelineRow): number {
  const periodMissed = project.periods.filter((p) => p.status === "missing").length
  const weeklyMissed = Object.values(project.weeklyCells).filter((c) => c.status === "missing").length
  return Math.max(periodMissed, weeklyMissed)
}

export function getProjectComplianceRate(project: ProjectComplianceTimelineRow): number | null {
  const applicablePeriods = project.periods.filter((p) => p.status !== "not_applicable")
  const evaluatedPeriods = applicablePeriods.filter(
    (p) => p.status === "done" || p.status === "extra" || p.status === "missing",
  )
  if (evaluatedPeriods.length > 0) {
    const doneCount = evaluatedPeriods.filter((p) => p.status === "done" || p.status === "extra").length
    return Math.round((doneCount / evaluatedPeriods.length) * 100)
  }

  // Fallback to weekly cells if periods are empty
  const cells = Object.values(project.weeklyCells)
  const evaluatedCells = cells.filter(
    (c) => c.status === "done" || c.status === "extra" || c.status === "missing",
  )
  if (evaluatedCells.length > 0) {
    const doneCells = evaluatedCells.filter((c) => c.status === "done" || c.status === "extra").length
    return Math.round((doneCells / evaluatedCells.length) * 100)
  }

  return null
}

export function getEarliestDueDate(project: ProjectComplianceTimelineRow): string | null {
  const upcomingPeriods = project.periods.filter((p) => p.status === "upcoming")
  const periodDates = upcomingPeriods.map((p) => p.startDate)

  const upcomingCells = Object.values(project.weeklyCells).filter((c) => c.status === "upcoming")
  const cellDates = upcomingCells.map((c) => c.startDate)

  const allDates = [...periodDates, ...cellDates].filter(Boolean)
  if (allDates.length === 0) return null

  allDates.sort()
  return allDates[0]
}

export function sortComplianceProjects(
  projects: ProjectComplianceTimelineRow[],
  sortOption: ComplianceSortOption = "project_code_desc",
): ProjectComplianceTimelineRow[] {
  const copy = [...projects]

  switch (sortOption) {
    case "project_code_desc":
      return copy.sort(compareProjectCodeDesc)

    case "project_code_asc":
      return copy.sort(compareProjectCodeAsc)

    case "missing_visits_desc":
      return copy.sort((a, b) => {
        const missingA = getMissingVisitsCount(a)
        const missingB = getMissingVisitsCount(b)
        if (missingB !== missingA) {
          return missingB - missingA
        }
        return compareProjectCodeDesc(a, b)
      })

    case "lowest_compliance":
      return copy.sort((a, b) => {
        const rateA = getProjectComplianceRate(a)
        const rateB = getProjectComplianceRate(b)
        if (rateA !== null && rateB !== null) {
          if (rateA !== rateB) return rateA - rateB
          return compareProjectCodeDesc(a, b)
        }
        if (rateA !== null) return -1
        if (rateB !== null) return 1
        return compareProjectCodeDesc(a, b)
      })

    case "highest_compliance":
      return copy.sort((a, b) => {
        const rateA = getProjectComplianceRate(a)
        const rateB = getProjectComplianceRate(b)
        if (rateA !== null && rateB !== null) {
          if (rateA !== rateB) return rateB - rateA
          return compareProjectCodeDesc(a, b)
        }
        if (rateA !== null) return -1
        if (rateB !== null) return 1
        return compareProjectCodeDesc(a, b)
      })

    case "earliest_due":
      return copy.sort((a, b) => {
        const dueA = getEarliestDueDate(a)
        const dueB = getEarliestDueDate(b)
        if (dueA && dueB) {
          const diff = dueA.localeCompare(dueB)
          if (diff !== 0) return diff
          return compareProjectCodeDesc(a, b)
        }
        if (dueA) return -1
        if (dueB) return 1
        return compareProjectCodeDesc(a, b)
      })

    case "name_asc":
      return copy.sort((a, b) =>
        a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" }),
      )

    case "name_desc":
      return copy.sort((a, b) =>
        b.projectName.localeCompare(a.projectName, undefined, { sensitivity: "base" }),
      )

    default:
      return copy.sort(compareProjectCodeDesc)
  }
}
