const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/

function pad(value: number) {
  return String(value).padStart(2, "0")
}

export function isCalendarMonthKey(value: string): boolean {
  const match = MONTH_KEY_PATTERN.exec(value)
  if (!match) return false
  const month = Number(match[2])
  return month >= 1 && month <= 12
}

export function calendarMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function currentCalendarMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

export function calendarMonthDate(monthKey: string): Date {
  if (!isCalendarMonthKey(monthKey)) return new Date()
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
