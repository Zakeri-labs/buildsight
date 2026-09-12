import {
  APPLICATION_TIME_ZONE,
  addCalendarDays,
  currentCalendarDateKey,
  isCalendarDateKey,
} from "@/lib/calendar/date"

export type SiteVisitDateRangePreset =
  | "today"
  | "tomorrow"
  | "next7"
  | "next30"
  | "thisMonth"
  | "custom"

export type SiteVisitDateRange = {
  preset: SiteVisitDateRangePreset
  startDate: string | null
  endDate: string | null
  startUtc: string | null
  endExclusiveUtc: string | null
  label: string
}

export type SiteVisitDateRangeSearchParams = {
  range?: string | string[]
  from?: string | string[]
  to?: string | string[]
}

const PRESETS = new Set<SiteVisitDateRangePreset>([
  "today",
  "tomorrow",
  "next7",
  "next30",
  "thisMonth",
  "custom",
])

export const SITE_VISIT_PRESET_OPTIONS: { value: Exclude<SiteVisitDateRangePreset, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "next7", label: "Next 7 Days" },
  { value: "next30", label: "Next 30 Days" },
  { value: "thisMonth", label: "This Month" },
]

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

export function applicationDateStartUtc(dateKey: string): string {
  if (!isCalendarDateKey(dateKey)) throw new Error("Invalid calendar date")
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
  preset: SiteVisitDateRangePreset,
  startDate: string | null,
  endDate: string | null,
  label: string,
): SiteVisitDateRange {
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

export function resolveSiteVisitDateRange(
  params: SiteVisitDateRangeSearchParams = {},
  now = new Date(),
): SiteVisitDateRange {
  const requested = firstValue(params.range)
  const preset = requested && PRESETS.has(requested as SiteVisitDateRangePreset)
    ? (requested as SiteVisitDateRangePreset)
    : "today"
  const today = currentCalendarDateKey(now)

  if (preset === "today") return buildRange("today", today, today, "Today")

  if (preset === "tomorrow") {
    const tomorrow = addCalendarDays(today, 1)
    return buildRange("tomorrow", tomorrow, tomorrow, "Tomorrow")
  }

  if (preset === "next7") {
    return buildRange("next7", today, addCalendarDays(today, 7), "Next 7 Days")
  }

  if (preset === "next30") {
    return buildRange("next30", today, addCalendarDays(today, 30), "Next 30 Days")
  }

  if (preset === "thisMonth") {
    const [year, month] = today.split("-").map(Number)
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`
    return buildRange("thisMonth", monthStart, monthEnd, "This Month")
  }

  if (preset === "custom") {
    const from = firstValue(params.from)
    const to = firstValue(params.to)
    if (from && to && isCalendarDateKey(from) && isCalendarDateKey(to) && from <= to) {
      return buildRange("custom", from, to, customRangeLabel(from, to))
    }
  }

  return buildRange("today", today, today, "Today")
}
