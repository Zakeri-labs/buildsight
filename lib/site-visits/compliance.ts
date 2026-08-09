import {
  addCalendarDays,
  currentCalendarDateKey,
  isCalendarDateKey,
} from "@/lib/calendar/date"
import { normalizeProjectStatus } from "@/lib/projects/project-status"

export const VISIT_COMPLIANCE_INTERVAL_DAYS = {
  monthly_2: 15,
  monthly_3: 10,
  monthly_4: 7,
} as const

export type VisitComplianceSupervisionType = keyof typeof VISIT_COMPLIANCE_INTERVAL_DAYS
export type VisitComplianceState = "on_track" | "due_soon" | "due_today" | "overdue"

export type VisitComplianceInput = {
  status: string | null | undefined
  supervisionType: string | null | undefined
  latestCompletedVisitAt?: string | null
  supervisionStartDate?: string | null
  startDate?: string | null
  legacyFallbackDate?: string | null
}

export type VisitComplianceCalculation = {
  state: VisitComplianceState
  intervalDays: number
  supervisionType: VisitComplianceSupervisionType
  baselineDate: string
  lastCompletedVisitDate: string | null
  nextRequiredVisitDate: string
  daysRemaining: number | null
  daysOverdue: number | null
}

function normalizedCalendarDate(value: string | null | undefined): string | null {
  const candidate = value?.trim()
  if (!candidate) return null
  if (isCalendarDateKey(candidate)) return candidate

  const parsed = new Date(candidate)
  if (Number.isNaN(parsed.getTime())) return null
  return currentCalendarDateKey(parsed)
}

function calendarDayDifference(fromDate: string, toDate: string): number {
  if (!isCalendarDateKey(fromDate) || !isCalendarDateKey(toDate)) {
    throw new Error("Invalid visit compliance calendar date")
  }

  const [fromYear, fromMonth, fromDay] = fromDate.split("-").map(Number)
  const [toYear, toMonth, toDay] = toDate.split("-").map(Number)
  const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay)
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay)
  return Math.round((toUtc - fromUtc) / 86_400_000)
}

export function normalizeVisitComplianceSupervisionType(
  value: string | null | undefined,
): VisitComplianceSupervisionType | null {
  if (typeof value !== "string") return null

  // Project creation/editing persist monthly_2/monthly_3/monthly_4. Some existing
  // rows can contain the equivalent visible label ("Monthly 2") or punctuation-only
  // variants. Normalize only exact equivalents of those three current options; other
  // legacy supervision modes intentionally remain outside recurring compliance.
  const token = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
  if (token === "monthly2") return "monthly_2"
  if (token === "monthly3") return "monthly_3"
  if (token === "monthly4") return "monthly_4"
  return null
}

export function isVisitComplianceSupervisionType(
  value: string | null | undefined,
): boolean {
  return normalizeVisitComplianceSupervisionType(value) !== null
}

export function isVisitComplianceEligible(
  status: string | null | undefined,
  supervisionType: string | null | undefined,
): boolean {
  // Reuse the application's canonical Project status normalization. Existing Project
  // rows can legitimately carry legacy active equivalents such as `in_progress` /
  // `under_construction`; the rest of the Project UI already treats those as Active.
  const rawStatus = typeof status === "string" ? status.trim() : ""
  return Boolean(rawStatus) && normalizeProjectStatus(rawStatus) === "active" && normalizeVisitComplianceSupervisionType(supervisionType) !== null
}

export function calculateVisitCompliance(
  input: VisitComplianceInput,
  today = currentCalendarDateKey(),
): VisitComplianceCalculation | null {
  if (!isVisitComplianceEligible(input.status, input.supervisionType)) return null
  if (!isCalendarDateKey(today)) throw new Error("Invalid visit compliance current date")

  const normalizedSupervisionType = normalizeVisitComplianceSupervisionType(input.supervisionType)
  if (!normalizedSupervisionType) return null

  const lastCompletedVisitDate = normalizedCalendarDate(input.latestCompletedVisitAt)
  const supervisionStartDate = normalizedCalendarDate(input.supervisionStartDate)
  const startDate = normalizedCalendarDate(input.startDate)
  const legacyFallbackDate = normalizedCalendarDate(input.legacyFallbackDate)
  const baselineDate = lastCompletedVisitDate ?? supervisionStartDate ?? startDate ?? legacyFallbackDate
  if (!baselineDate) return null

  const intervalDays = VISIT_COMPLIANCE_INTERVAL_DAYS[normalizedSupervisionType]
  const nextRequiredVisitDate = addCalendarDays(baselineDate, intervalDays)
  const daysUntilDue = calendarDayDifference(today, nextRequiredVisitDate)

  if (daysUntilDue < 0) {
    return {
      state: "overdue",
      intervalDays,
      supervisionType: normalizedSupervisionType,
      baselineDate,
      lastCompletedVisitDate,
      nextRequiredVisitDate,
      daysRemaining: null,
      daysOverdue: Math.abs(daysUntilDue),
    }
  }

  if (daysUntilDue === 0) {
    return {
      state: "due_today",
      intervalDays,
      supervisionType: normalizedSupervisionType,
      baselineDate,
      lastCompletedVisitDate,
      nextRequiredVisitDate,
      daysRemaining: null,
      daysOverdue: null,
    }
  }

  if (daysUntilDue <= 3) {
    return {
      state: "due_soon",
      intervalDays,
      supervisionType: normalizedSupervisionType,
      baselineDate,
      lastCompletedVisitDate,
      nextRequiredVisitDate,
      daysRemaining: daysUntilDue,
      daysOverdue: null,
    }
  }

  return {
    state: "on_track",
    intervalDays,
    supervisionType: normalizedSupervisionType,
    baselineDate,
    lastCompletedVisitDate,
    nextRequiredVisitDate,
    daysRemaining: null,
    daysOverdue: null,
  }
}
