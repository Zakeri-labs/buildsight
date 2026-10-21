import { cleanText, isUuid, normalizeWhatsappPhone, parseNumber } from "../validation"
import {
  IDEA_FILE_MAX_COUNT,
  LAND_STATUSES,
  MEETING_MODES,
  MEETING_PATHS,
  PROJECT_TYPES,
  START_TIMELINES,
  type MeetingRequestInput,
} from "./types"
import { findWilayat } from "./wilayat"

export type BookingFieldError =
  | "required"
  | "tooShort"
  | "tooLong"
  | "invalidPhone"
  | "invalidEmail"
  | "invalidChoice"
  | "invalidNumber"
  | "outOfRange"
  | "ideaNeeded"
  | "tooManyFiles"

export type BookingValidation =
  | { ok: true; value: MeetingRequestInput }
  | { ok: false; errors: Partial<Record<keyof MeetingRequestInput, BookingFieldError>> }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ATTACHMENT_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/
/** Default country for local numbers typed without a code (Oman: 8 digits). */
export const LOCAL_COUNTRY_CODE = "968"

function text(raw: unknown): string {
  return typeof raw === "string" ? cleanText(raw) : ""
}

function choice<T extends string>(raw: unknown, options: readonly T[]): T | null {
  return options.includes(raw as T) ? (raw as T) : null
}

/** WhatsApp number with country code; an 8-digit local Omani number gets 968 in front. */
export function normalizeBookingPhone(raw: string): string {
  const digits = normalizeWhatsappPhone(raw)
  return digits.length === 8 ? `${LOCAL_COUNTRY_CODE}${digits}` : digits
}

/**
 * Checks a booking form. Field errors are codes, shown in Arabic or English
 * by the form. Path rules: "same"/"modified" need a design; "idea" needs a
 * description or at least one file. A remote meeting needs an email (for the
 * calendar invitation); "call me" has no time slot.
 */
export function validateMeetingRequest(raw: Record<string, unknown>): BookingValidation {
  const errors: Partial<Record<keyof MeetingRequestInput, BookingFieldError>> = {}

  const requestKey = typeof raw.requestKey === "string" && isUuid(raw.requestKey) ? raw.requestKey.toLowerCase() : ""
  if (!requestKey) errors.requestKey = "required"

  const path = choice(raw.path, MEETING_PATHS)
  if (!path) errors.path = "invalidChoice"

  const designSlug = typeof raw.designSlug === "string" && SLUG.test(raw.designSlug) ? raw.designSlug : null
  if ((path === "same" || path === "modified") && !designSlug) errors.designSlug = "required"

  const clientName = text(raw.clientName)
  if (!clientName) errors.clientName = "required"
  else if (Array.from(clientName).length < 2) errors.clientName = "tooShort"
  else if (Array.from(clientName).length > 100) errors.clientName = "tooLong"

  const phoneRaw = text(raw.whatsappPhone)
  const whatsappPhone = phoneRaw ? normalizeBookingPhone(phoneRaw) : ""
  if (!phoneRaw) errors.whatsappPhone = "required"
  else if (!/^[0-9]{8,15}$/.test(whatsappPhone) || whatsappPhone.length < 10) errors.whatsappPhone = "invalidPhone"

  const meetingMode = choice(raw.meetingMode, MEETING_MODES)
  if (!meetingMode) errors.meetingMode = "invalidChoice"

  const emailRaw = text(raw.email).toLowerCase()
  const email = emailRaw || null
  if (email && (email.length > 254 || !EMAIL.test(email))) errors.email = "invalidEmail"
  else if (!email && meetingMode === "remote") errors.email = "required"

  const projectType = choice(raw.projectType, PROJECT_TYPES)
  if (!projectType) errors.projectType = "invalidChoice"
  const landStatus = choice(raw.landStatus, LAND_STATUSES)
  if (!landStatus) errors.landStatus = "invalidChoice"
  const startTimeline = choice(raw.startTimeline, START_TIMELINES)
  if (!startTimeline) errors.startTimeline = "invalidChoice"

  // A key from the list, or "other:<free text>" for a place outside it.
  const wilayatRaw = text(raw.wilayat)
  let wilayat: string | null = null
  if (wilayatRaw.startsWith("other:")) {
    const place = cleanText(wilayatRaw.slice(6))
    if (!place) errors.wilayat = "required"
    else if (Array.from(place).length > 60) errors.wilayat = "tooLong"
    else wilayat = `other:${place}`
  } else if (wilayatRaw) {
    if (findWilayat(wilayatRaw)) wilayat = wilayatRaw
    else errors.wilayat = "invalidChoice"
  }

  const parsedArea = parseNumber(raw.landAreaSqm)
  const landAreaSqm = typeof parsedArea === "number" ? Math.round(parsedArea * 100) / 100 : parsedArea
  if (landAreaSqm === "invalid") errors.landAreaSqm = "invalidNumber"
  else if (landAreaSqm !== null && (landAreaSqm <= 0 || landAreaSqm > 10_000_000)) errors.landAreaSqm = "outOfRange"

  const ideaText = text(raw.ideaText) || null
  if (ideaText && Array.from(ideaText).length > 2000) errors.ideaText = "tooLong"

  const attachmentPaths = Array.isArray(raw.attachmentPaths)
    ? raw.attachmentPaths.filter((p): p is string => typeof p === "string")
    : []
  if (attachmentPaths.length > IDEA_FILE_MAX_COUNT) errors.attachmentPaths = "tooManyFiles"
  else if (attachmentPaths.some((p) => !ATTACHMENT_PATH.test(p))) errors.attachmentPaths = "invalidChoice"
  else if (attachmentPaths.length && path !== "idea") errors.attachmentPaths = "invalidChoice"
  if (path === "idea" && !ideaText && attachmentPaths.length === 0) errors.ideaText = "ideaNeeded"

  const slotStart = typeof raw.slotStart === "string" && Number.isFinite(Date.parse(raw.slotStart)) ? new Date(raw.slotStart).toISOString() : null
  if (meetingMode && meetingMode !== "call_me" && !slotStart) errors.slotStart = "required"

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      requestKey,
      path: path!,
      designSlug: path === "idea" ? null : designSlug,
      clientName,
      whatsappPhone,
      email,
      projectType: projectType!,
      landStatus: landStatus!,
      wilayat,
      landAreaSqm: landAreaSqm as number | null,
      startTimeline: startTimeline!,
      ideaText,
      meetingMode: meetingMode!,
      slotStart: meetingMode === "call_me" ? null : slotStart,
      attachmentPaths,
      locale: raw.locale === "en" ? "en" : "ar",
    },
  }
}

/** Bot checks: the hidden "website" field must stay empty and the form must have been open at least 3 seconds. */
export function looksAutomated(raw: Record<string, unknown>, now: number): boolean {
  if (typeof raw.website === "string" && raw.website.trim()) return true
  const openedAt = Number(raw.openedAt)
  return !Number.isFinite(openedAt) || now - openedAt < 3000 || now - openedAt > 24 * 3600_000
}
