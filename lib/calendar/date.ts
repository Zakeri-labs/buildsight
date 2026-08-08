const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

// The application's existing Settings UI defines its operating timezone as
// Gulf Standard Time (GMT+4). Site Visit date/time fields are stored as a
// calendar date plus a time-without-time-zone, so all "today" boundaries must
// be resolved in that same application timezone rather than in server UTC or
// the browser's local timezone.
export const APPLICATION_TIME_ZONE = "Asia/Dubai"

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function datePartsInApplicationTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APPLICATION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
  }
}

export function isCalendarMonthKey(value: string): boolean {
  const match = MONTH_KEY_PATTERN.exec(value)
  if (!match) return false
  const month = Number(match[2])
  return month >= 1 && month <= 12
}

export function isCalendarDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
}

export function currentCalendarDateKey(date = new Date()): string {
  const { year, month, day } = datePartsInApplicationTimeZone(date)
  return `${year}-${pad(month)}-${pad(day)}`
}

export function addCalendarDays(dateKey: string, amount: number): string {
  if (!isCalendarDateKey(dateKey) || !Number.isInteger(amount)) throw new Error("Invalid calendar date")
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + amount)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function calendarDateFromKey(dateKey: string): Date {
  if (!isCalendarDateKey(dateKey)) return new Date()
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function calendarMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function currentCalendarMonthKey(): string {
  return currentCalendarDateKey().slice(0, 7)
}

export function calendarMonthDate(monthKey: string): Date {
  if (!isCalendarMonthKey(monthKey)) return calendarDateFromKey(currentCalendarDateKey())
  const [year, month] = monthKey.split("-").map(Number)
  return new Date(year, month - 1, 1)
}

export function getCalendarVisibleRange(monthKey: string): { rangeStart: string; rangeEnd: string } {
  if (!isCalendarMonthKey(monthKey)) throw new Error("Invalid calendar month")
  const [year, month] = monthKey.split("-").map(Number)
  const first = new Date(Date.UTC(year, month - 1, 1))
  const last = new Date(Date.UTC(year, month, 0))
  const gridStart = new Date(first)
  gridStart.setUTCDate(first.getUTCDate() - first.getUTCDay())
  const gridEnd = new Date(last)
  gridEnd.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()))

  const format = (date: Date) =>
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`

  return { rangeStart: format(gridStart), rangeEnd: format(gridEnd) }
}
