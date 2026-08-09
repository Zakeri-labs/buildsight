import {
  APPLICATION_TIME_ZONE,
  addCalendarDays,
  currentCalendarDateKey,
  isCalendarDateKey,
} from "@/lib/calendar/date"

export type DashboardDateRangePreset =
  | "today"
  | "last7"
  | "last30"
  | "thisMonth"
  | "all"
  | "custom"

export type DashboardActivityDateFilter = {
  startDate: string
  endDate: string
  startUtc: string
  endExclusiveUtc: string
}

export type DashboardDateRange = {
  preset: DashboardDateRangePreset
  startDate: string | null
  endDate: string | null
  startUtc: string | null
  endExclusiveUtc: string | null
  label: string
}

type DashboardDateRangeSearchParams = {
  range?: string | string[]
  from?: string | string[]
  to?: string | string[]
}

const PRESETS = new Set<DashboardDateRangePreset>([
  "today",
  "last7",
  "last30",
  "thisMonth",
  "all",
  "custom",
])

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function dateParts(dateKey: string): [number, number, number] {
  return dateKey.split("-").map(Number) as [number, number, number]
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(
    Number(values.get("year")),
    Number(values.get("month")) - 1,
    Number(values.get("day")),
    Number(values.get("hour")),
    Number(values.get("minute")),
    Number(values.get("second")),
  )
  return asUtc - date.getTime()
}

/** Convert application-local calendar midnight to a UTC instant without using server/browser local time. */
export function applicationDateStartUtc(dateKey: string): string {
  if (!isCalendarDateKey(dateKey)) throw new Error("Invalid dashboard calendar date")
  const [year, month, day] = dateParts(dateKey)
  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0)
  let candidate = localMidnightAsUtc

  for (let index = 0; index < 3; index += 1) {
    const offset = timeZoneOffsetMs(new Date(candidate), APPLICATION_TIME_ZONE)
    const adjusted = localMidnightAsUtc - offset
    if (adjusted === candidate) break
    candidate = adjusted
  }

  return new Date(candidate).toISOString()
}

function compactDateLabel(dateKey: string, includeYear: boolean): string {
  const [year, month, day] = dateParts(dateKey)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(date)
}

function customRangeLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return compactDateLabel(endDate, true)
  return `${compactDateLabel(startDate, false)} – ${compactDateLabel(endDate, true)}`
}

function buildRange(
  preset: DashboardDateRangePreset,
  startDate: string | null,
  endDate: string | null,
  label: string,
): DashboardDateRange {
  if (!startDate || !endDate) {
    return { preset, startDate: null, endDate: null, startUtc: null, endExclusiveUtc: null, label }
  }

  return {
    preset,
    startDate,
    endDate,
    startUtc: applicationDateStartUtc(startDate),
    endExclusiveUtc: applicationDateStartUtc(addCalendarDays(endDate, 1)),
    label,
  }
}

export function resolveDashboardDateRange(
  params: DashboardDateRangeSearchParams = {},
  now = new Date(),
): DashboardDateRange {
  const requested = firstValue(params.range)
  const preset = requested && PRESETS.has(requested as DashboardDateRangePreset)
    ? (requested as DashboardDateRangePreset)
    : "last30"
  const today = currentCalendarDateKey(now)

  if (preset === "all") return buildRange("all", null, null, "All Time")
  if (preset === "today") return buildRange("today", today, today, "Today")
  if (preset === "last7") return buildRange("last7", addCalendarDays(today, -6), today, "Last 7 Days")
  if (preset === "thisMonth") return buildRange("thisMonth", `${today.slice(0, 7)}-01`, today, "This Month")

  if (preset === "custom") {
    const from = firstValue(params.from)
    const to = firstValue(params.to)
    if (from && to && isCalendarDateKey(from) && isCalendarDateKey(to) && from <= to) {
      return buildRange("custom", from, to, customRangeLabel(from, to))
    }
  }

  return buildRange("last30", addCalendarDays(today, -29), today, "Last 30 Days")
}


/**
 * Return the temporal filter for Dashboard activity queries. `All Time` is
 * deliberately represented by null so stale custom from/to values can never
 * leak into an unbounded activity query. Contractual/current-state features
 * must not consume this helper unless they intentionally use Dashboard range.
 */
export function dashboardActivityDateFilter(
  range: DashboardDateRange,
): DashboardActivityDateFilter | null {
  if (range.preset === "all") return null
  if (!range.startUtc || !range.endExclusiveUtc) return null
  return {
    startDate: range.startDate!,
    endDate: range.endDate!,
    startUtc: range.startUtc,
    endExclusiveUtc: range.endExclusiveUtc,
  }
}
