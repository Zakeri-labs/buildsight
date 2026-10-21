/** Date and time parts of an instant as seen in an IANA time zone (e.g. Asia/Muscat). */
export function zonedParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  )
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday: weekdays.indexOf(parts.weekday as string),
    seconds: Number(parts.second),
  }
}

/** Minutes the zone is ahead of UTC at that instant (Asia/Muscat: 240). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone)
  const [y, m, d] = p.date.split("-").map(Number)
  const [h, min] = p.time.split(":").map(Number)
  const asUtc = Date.UTC(y, m - 1, d, h, min, p.seconds)
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000)
}

/** The instant of a wall-clock date and time in a time zone ("2026-10-27", "10:30", "Asia/Muscat"). */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number)
  const [h, min] = time.split(":").map(Number)
  const guess = Date.UTC(y, m - 1, d, h, min)
  // Two passes settle the offset also next to a daylight-saving change.
  let instant = new Date(guess - offsetMinutes(new Date(guess), timeZone) * 60000)
  instant = new Date(guess - offsetMinutes(instant, timeZone) * 60000)
  return instant
}

/** "2026-10-27" + n days, as a calendar date (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}
