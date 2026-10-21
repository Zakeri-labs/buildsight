import { addDays, zonedParts, zonedTimeToUtc } from "./timezone"

export type BookingSettings = {
  timeZone: string
  /** 0 = Sunday … 6 = Saturday, in the gallery's time zone. */
  workDays: number[]
  /** "HH:MM" */
  dayStart: string
  dayEnd: string
  slotMinutes: number
  minNoticeHours: number
  daysAhead: number
}

export type Interval = { start: Date; end: Date }
export type Slot = { start: string; end: string; time: string }
export type BookingDay = { date: string; weekday: number; slots: Slot[] }

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  timeZone: "Asia/Muscat",
  workDays: [0, 1, 2, 3, 4],
  dayStart: "09:00",
  dayEnd: "17:00",
  slotMinutes: 45,
  minNoticeHours: 12,
  daysAhead: 21,
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

/**
 * Bookable meeting times: every working day from today (in the gallery's
 * time zone) for `daysAhead` days, slots of `slotMinutes` between the
 * opening and closing time, at least `minNoticeHours` from now, and not
 * overlapping anything busy (the team calendar and existing bookings).
 * Days without a free slot are kept so the UI can show them as full.
 */
export function availableDays(settings: BookingSettings, now: Date, busy: readonly Interval[]): BookingDay[] {
  const today = zonedParts(now, settings.timeZone).date
  const earliest = now.getTime() + settings.minNoticeHours * 3600_000
  const open = minutesOf(settings.dayStart)
  const close = minutesOf(settings.dayEnd)
  const days: BookingDay[] = []

  for (let offset = 0; offset < settings.daysAhead; offset += 1) {
    const date = addDays(today, offset)
    const weekday = zonedParts(zonedTimeToUtc(date, "12:00", settings.timeZone), settings.timeZone).weekday
    if (!settings.workDays.includes(weekday)) continue

    const slots: Slot[] = []
    for (let minute = open; minute + settings.slotMinutes <= close; minute += settings.slotMinutes) {
      const start = zonedTimeToUtc(date, hhmm(minute), settings.timeZone)
      // A wall-clock time skipped by a daylight-saving change does not exist: no slot.
      const seen = zonedParts(start, settings.timeZone)
      if (seen.date !== date || seen.time !== hhmm(minute)) continue
      const end = new Date(start.getTime() + settings.slotMinutes * 60_000)
      if (start.getTime() < earliest) continue
      if (busy.some((b) => b.start < end && b.end > start)) continue
      slots.push({ start: start.toISOString(), end: end.toISOString(), time: hhmm(minute) })
    }
    days.push({ date, weekday, slots })
  }
  return days
}

/** The offered slot that starts at `startIso`, or null if that time is not bookable now. */
export function findOfferedSlot(settings: BookingSettings, now: Date, busy: readonly Interval[], startIso: string): Slot | null {
  const wanted = Date.parse(startIso)
  if (!Number.isFinite(wanted)) return null
  for (const day of availableDays(settings, now, busy)) {
    const slot = day.slots.find((s) => Date.parse(s.start) === wanted)
    if (slot) return slot
  }
  return null
}
