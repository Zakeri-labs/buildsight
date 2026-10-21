import { describe, expect, test } from "vitest"
import { looksAutomated, normalizeBookingPhone, validateMeetingRequest } from "./validation"
import { OMAN_GOVERNORATES, OMAN_WILAYAT } from "./wilayat"

const KEY = "11111111-2222-4333-8444-555555555555"
const ORG = "aaaaaaaa-1111-4222-8333-444444444444"
const base = {
  requestKey: KEY,
  path: "same",
  designSlug: "modern-villa-pool",
  clientName: "أحمد البلوشي",
  whatsappPhone: "9123 4567",
  email: "",
  projectType: "villa",
  landStatus: "owned_ready",
  wilayat: "sur",
  landAreaSqm: "٦٠٠ م²",
  startTimeline: "within_3_months",
  meetingMode: "office",
  slotStart: "2026-10-25T05:00:00.000Z",
  locale: "ar",
}

describe("validateMeetingRequest", () => {
  test("accepts the proposal's example request", () => {
    expect(validateMeetingRequest(base)).toEqual({
      ok: true,
      value: {
        requestKey: KEY,
        path: "same",
        designSlug: "modern-villa-pool",
        clientName: "أحمد البلوشي",
        whatsappPhone: "96891234567",
        email: null,
        projectType: "villa",
        landStatus: "owned_ready",
        wilayat: "sur",
        landAreaSqm: 600,
        startTimeline: "within_3_months",
        ideaText: null,
        meetingMode: "office",
        slotStart: "2026-10-25T05:00:00.000Z",
        attachmentPaths: [],
        locale: "ar",
      },
    })
  })

  test("a remote meeting needs an email; office and call-me do not", () => {
    expect(validateMeetingRequest({ ...base, meetingMode: "remote" })).toEqual({ ok: false, errors: { email: "required" } })
    expect(validateMeetingRequest({ ...base, meetingMode: "remote", email: "Ahmed@Example.com" })).toMatchObject({ ok: true, value: { email: "ahmed@example.com" } })
    expect(validateMeetingRequest({ ...base, email: "not-an-email" })).toEqual({ ok: false, errors: { email: "invalidEmail" } })
  })

  test("call-me has no time slot; other modes need one", () => {
    expect(validateMeetingRequest({ ...base, meetingMode: "call_me" })).toMatchObject({ ok: true, value: { slotStart: null } })
    expect(validateMeetingRequest({ ...base, slotStart: "" })).toEqual({ ok: false, errors: { slotStart: "required" } })
  })

  test("design paths need a design; the idea path needs a description or a file and never keeps a design", () => {
    expect(validateMeetingRequest({ ...base, designSlug: "" })).toEqual({ ok: false, errors: { designSlug: "required" } })
    expect(validateMeetingRequest({ ...base, path: "idea" })).toEqual({ ok: false, errors: { ideaText: "ideaNeeded" } })
    expect(validateMeetingRequest({ ...base, path: "idea", ideaText: "فيلا من طابقين" })).toMatchObject({ ok: true, value: { designSlug: null } })
    const file = `${ORG}/${KEY}/22222222-3333-4444-8555-666666666666.pdf`
    expect(validateMeetingRequest({ ...base, path: "idea", attachmentPaths: [file] })).toMatchObject({ ok: true, value: { attachmentPaths: [file] } })
    expect(validateMeetingRequest({ ...base, attachmentPaths: [file] })).toEqual({ ok: false, errors: { attachmentPaths: "invalidChoice" } })
    expect(validateMeetingRequest({ ...base, path: "idea", attachmentPaths: [file, file, file, file] })).toEqual({ ok: false, errors: { attachmentPaths: "tooManyFiles" } })
    expect(validateMeetingRequest({ ...base, path: "idea", attachmentPaths: ["../../etc/passwd"] })).toEqual({ ok: false, errors: { attachmentPaths: "invalidChoice" } })
  })

  test("phones: local Omani numbers get 968, others keep their country code; words are refused", () => {
    expect(normalizeBookingPhone("9123 4567")).toBe("96891234567")
    expect(normalizeBookingPhone("+968 9123 4567")).toBe("96891234567")
    expect(normalizeBookingPhone("٩١٢٣٤٥٦٧")).toBe("96891234567")
    expect(normalizeBookingPhone("+971 50 123 4567")).toBe("971501234567")
    expect(validateMeetingRequest({ ...base, whatsappPhone: "12345" })).toEqual({ ok: false, errors: { whatsappPhone: "invalidPhone" } })
    expect(validateMeetingRequest({ ...base, whatsappPhone: "call me 91234567" })).toEqual({ ok: false, errors: { whatsappPhone: "invalidPhone" } })
  })

  test("wilayat from the list or 'other:' with a place name", () => {
    expect(validateMeetingRequest({ ...base, wilayat: "atlantis" })).toEqual({ ok: false, errors: { wilayat: "invalidChoice" } })
    expect(validateMeetingRequest({ ...base, wilayat: "other: دبي " })).toMatchObject({ ok: true, value: { wilayat: "other:دبي" } })
    expect(validateMeetingRequest({ ...base, wilayat: "other:" })).toEqual({ ok: false, errors: { wilayat: "required" } })
    expect(validateMeetingRequest({ ...base, wilayat: "" })).toMatchObject({ ok: true, value: { wilayat: null } })
  })

  test("names and choices", () => {
    expect(validateMeetingRequest({ ...base, clientName: "‏" })).toEqual({ ok: false, errors: { clientName: "required" } })
    expect(validateMeetingRequest({ ...base, clientName: "أ" })).toEqual({ ok: false, errors: { clientName: "tooShort" } })
    expect(validateMeetingRequest({ ...base, projectType: "castle", landStatus: "x", startTimeline: "never", meetingMode: "fax" })).toMatchObject({
      ok: false,
      errors: { projectType: "invalidChoice", landStatus: "invalidChoice", startTimeline: "invalidChoice", meetingMode: "invalidChoice" },
    })
    expect(validateMeetingRequest({ ...base, requestKey: "1" })).toEqual({ ok: false, errors: { requestKey: "required" } })
    expect(validateMeetingRequest({ ...base, landAreaSqm: "كبيرة" })).toEqual({ ok: false, errors: { landAreaSqm: "invalidNumber" } })
  })
})

test("bot checks: filled hidden field, or a form sent in under 3 seconds", () => {
  const now = 1_000_000
  expect(looksAutomated({ openedAt: now - 10_000 }, now)).toBe(false)
  expect(looksAutomated({ openedAt: now - 10_000, website: "http://spam" }, now)).toBe(true)
  expect(looksAutomated({ openedAt: now - 1000 }, now)).toBe(true)
  expect(looksAutomated({}, now)).toBe(true)
})

test("Oman has 61 wilayat in 11 governorates with unique keys", () => {
  expect(OMAN_GOVERNORATES).toHaveLength(11)
  expect(OMAN_WILAYAT).toHaveLength(61)
  expect(new Set(OMAN_WILAYAT.map((w) => w.key)).size).toBe(61)
})
