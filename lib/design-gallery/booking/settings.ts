import { cleanText, parseNumber, type DesignFieldError } from "../validation"
import type { BookingSettings } from "./slots"
import { isValidTimeZone } from "./timezone"

export type BookingSettingsInput = BookingSettings & { officeAddressAr: string | null; officeAddressEn: string | null }

type Result =
  | { ok: true; value: BookingSettingsInput }
  | { ok: false; errors: Partial<Record<keyof BookingSettingsInput, DesignFieldError>> }

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const ADDRESS_MAX = 200

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function whole(raw: unknown, min: number, max: number): number | DesignFieldError {
  const value = parseNumber(raw)
  if (value === null) return "required"
  if (value === "invalid" || !Number.isInteger(value)) return "invalidNumber"
  return value < min || value > max ? "outOfRange" : value
}

/**
 * Booking settings from the admin panel (same limits as the database check
 * in 084): working days, hours in the gallery's time zone, meeting length,
 * notice and how far ahead, office address.
 */
export function validateBookingSettings(raw: Record<string, unknown>): Result {
  const errors: Partial<Record<keyof BookingSettingsInput, DesignFieldError>> = {}

  const timeZone = typeof raw.timeZone === "string" ? raw.timeZone.trim() : ""
  if (!timeZone) errors.timeZone = "required"
  else if (!isValidTimeZone(timeZone)) errors.timeZone = "invalidTimeZone"

  const days = (Array.isArray(raw.workDays) ? raw.workDays : [raw.workDays]).flatMap((d) =>
    d === undefined || d === null || d === "" ? [] : [Number(d)],
  )
  const workDays = [...new Set(days)].sort((a, b) => a - b)
  if (workDays.length === 0) errors.workDays = "required"
  else if (workDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.workDays = "outOfRange"

  const dayStart = typeof raw.dayStart === "string" ? raw.dayStart.trim().slice(0, 5) : ""
  const dayEnd = typeof raw.dayEnd === "string" ? raw.dayEnd.trim().slice(0, 5) : ""
  if (!TIME.test(dayStart)) errors.dayStart = dayStart ? "invalidTime" : "required"
  if (!TIME.test(dayEnd)) errors.dayEnd = dayEnd ? "invalidTime" : "required"

  const slotMinutes = whole(raw.slotMinutes, 15, 240)
  if (typeof slotMinutes === "string") errors.slotMinutes = slotMinutes
  const minNoticeHours = whole(raw.minNoticeHours, 0, 168)
  if (typeof minNoticeHours === "string") errors.minNoticeHours = minNoticeHours
  const daysAhead = whole(raw.daysAhead, 1, 90)
  if (typeof daysAhead === "string") errors.daysAhead = daysAhead

  // The working day must hold at least one meeting.
  if (!errors.dayStart && !errors.dayEnd && typeof slotMinutes === "number" && minutes(dayEnd) - minutes(dayStart) < slotMinutes) {
    errors.dayEnd = "outOfRange"
  }

  const address = (value: unknown, key: "officeAddressAr" | "officeAddressEn") => {
    const text = typeof value === "string" ? cleanText(value) : ""
    if (Array.from(text).length > ADDRESS_MAX) errors[key] = "tooLong"
    return text || null
  }
  const officeAddressAr = address(raw.officeAddressAr, "officeAddressAr")
  const officeAddressEn = address(raw.officeAddressEn, "officeAddressEn")

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      timeZone,
      workDays,
      dayStart,
      dayEnd,
      slotMinutes: slotMinutes as number,
      minNoticeHours: minNoticeHours as number,
      daysAhead: daysAhead as number,
      officeAddressAr,
      officeAddressEn,
    },
  }
}
