import { beforeEach, describe, expect, test, vi } from "vitest"
import { DEFAULT_BOOKING_SETTINGS } from "./slots"

const ORG = "aaaaaaaa-1111-4222-8333-444444444444"
const NOW = new Date("2026-10-21T12:00:00Z") // Wed 16:00 Muscat
const SUNDAY_9 = "2026-10-25T05:00:00.000Z" // Sun 09:00 Muscat
const KEY = () => crypto.randomUUID()

// ---------- in-memory stand-in for the service-role client ----------
type Row = Record<string, any>
let requests: Row[] = []
let attachments: Row[] = []
let insertError: { code: string; message: string } | null = null
let attachmentError: { code: string; message: string } | null = null
const files = new Map<string, Uint8Array>()
const removed: string[] = []

function query(table: string) {
  const filters: ((row: Row) => boolean)[] = []
  let op: "select" | "insert" | "update" = "select"
  let payload: Row = {}
  const rows = () => (table === "design_meeting_requests" ? requests : attachments)
  const run = () => {
    if (op === "insert") {
      if (insertError) return { data: null, error: insertError }
      if (table === "design_meeting_attachments" && attachmentError) return { data: null, error: attachmentError }
      if (table === "design_meeting_requests" && requests.some((r) => r.starts_at && r.starts_at === payload.starts_at && r.status !== "cancelled")) {
        return { data: null, error: { code: "23505", message: "design_meeting_requests_one_per_slot" } }
      }
      const row = { id: crypto.randomUUID(), meet_link: null, created_at: NOW.toISOString(), ...payload }
      rows().push(row)
      return { data: row, error: null }
    }
    const matched = rows().filter((row) => filters.every((f) => f(row)))
    if (op === "update") {
      matched.forEach((row) => Object.assign(row, payload))
      return { data: matched[0] ?? null, error: null }
    }
    return { data: matched, error: null }
  }
  const chain: any = {
    select: () => chain,
    insert: (p: Row) => ((op = "insert"), (payload = p), chain),
    update: (p: Row) => ((op = "update"), (payload = p), chain),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), chain),
    gte: (k: string, v: string) => (filters.push((r) => r[k] != null && r[k] >= v), chain),
    limit: () => chain,
    lt: (k: string, v: string) => (filters.push((r) => r[k] != null && r[k] < v), chain),
    single: async () => run(),
    maybeSingle: async () => {
      const result = run()
      return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error }
    },
    then: (resolve: (v: unknown) => unknown) => resolve(run()),
  }
  return chain
}

const storage = {
  list: vi.fn(async (folder: string) => ({ data: [...files.keys()].filter((p) => p.startsWith(`${folder}/`)).map((p) => ({ name: p })), error: null })),
  createSignedUploadUrl: vi.fn(async () => ({ data: { token: "tok" }, error: null })),
  download: vi.fn(async (path: string) =>
    files.has(path) ? { data: new Blob([files.get(path)!]), error: null } : { data: null, error: { message: "Object not found", statusCode: "404" } },
  ),
  remove: vi.fn(async (paths: string[]) => (removed.push(...paths), paths.forEach((p) => files.delete(p)), { data: null, error: null })),
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: query, storage: { from: () => storage } }) }))
let address = "10.0.0.1"
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": address }) }))

const site = {
  site: {
    organizationId: ORG,
    booking: DEFAULT_BOOKING_SETTINGS,
    officeAddressAr: "المعبيلة الصناعية، مسقط",
    officeAddressEn: "Mabela Industrial Area, Muscat",
  },
  origin: "https://app.bonyanec.com",
}
const designs: Record<string, Row> = {
  "modern-villa-pool": { id: "d1", isBookable: true, code: "BD-101", titleAr: "فيلا عصرية بمسبح", titleEn: "Modern villa" },
  "saham-public-park": { id: "d2", isBookable: false, code: "BD-502", titleAr: "حديقة", titleEn: "Park" },
}
vi.mock("../public", () => ({
  loadPublicSite: async () => site,
  findPublicDesign: async (_org: string, slug: string) => designs[slug] ?? null,
}))

let calendar: any = { connected: false }
vi.mock("./calendar", () => ({ googleCalendarProvider: () => calendar }))

const { submitMeetingRequest, getAvailability, prepareIdeaUpload } = await import("./server")

const form = (overrides: Row = {}) => ({
  requestKey: KEY(),
  elapsedMs: 60_000,
  path: "same",
  designSlug: "modern-villa-pool",
  clientName: "أحمد البلوشي",
  whatsappPhone: "91234567",
  projectType: "villa",
  landStatus: "owned_ready",
  wilayat: "sur",
  landAreaSqm: "600",
  startTimeline: "within_3_months",
  meetingMode: "office",
  slotStart: SUNDAY_9,
  locale: "ar",
  ...overrides,
})

let ip = 0
const submit = (raw: Row) => {
  address = `10.1.0.${++ip}` // a new address per call unless a test pins one
  return submitMeetingRequest(raw, NOW)
}

beforeEach(() => {
  requests = []
  attachments = []
  insertError = null
  attachmentError = null
  files.clear()
  removed.length = 0
  calendar = { connected: false }
  vi.clearAllMocks()
})

describe("saving a request", () => {
  test("office meeting without a connected calendar: saved and confirmed, no invitation", async () => {
    const result = await submit(form())
    expect(result).toEqual({
      ok: true,
      data: {
        mode: "office",
        startsAt: SUNDAY_9,
        timeZone: "Asia/Muscat",
        meetLink: null,
        calendarInvite: false,
        officeAddressAr: "المعبيلة الصناعية، مسقط",
        officeAddressEn: "Mabela Industrial Area, Muscat",
      },
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      organization_id: ORG,
      design_id: "d1",
      whatsapp_phone: "96891234567",
      status: "confirmed",
      calendar_status: "not_configured",
      starts_at: SUNDAY_9,
      ends_at: "2026-10-25T05:45:00.000Z",
    })
  })

  test("remote meeting with the calendar connected: event with Meet, client invited", async () => {
    const createEvent = vi.fn(async (_input: { description: string }) => ({ eventId: "evt", meetLink: "https://meet.google.com/abc-defg-hij" }))
    calendar = { connected: true, busy: async () => [], createEvent }
    const result = await submit(form({ meetingMode: "remote", email: "ahmed@example.com", path: "modified" }))
    expect(result).toMatchObject({ ok: true, data: { meetLink: "https://meet.google.com/abc-defg-hij", calendarInvite: true } })
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({ withMeet: true, attendeeEmail: "ahmed@example.com", location: null }))
    expect(createEvent.mock.calls[0][0].description).toContain("فيلا عصرية بمسبح (BD-101) — مع تعديلات")
    expect(requests[0]).toMatchObject({ calendar_status: "created", calendar_event_id: "evt" })
  })

  test("the calendar failing does not lose the request", async () => {
    calendar = { connected: true, busy: async () => [], createEvent: async () => Promise.reject(new Error("quota")) }
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const result = await submit(form())
      expect(result).toMatchObject({ ok: true, data: { calendarInvite: false } })
      expect(requests[0]).toMatchObject({ status: "confirmed", calendar_status: "failed", calendar_error: "quota" })
    } finally {
      log.mockRestore()
    }
  })

  test("office meeting with the calendar connected: no Meet; the client is told about an invitation only if one was sent", async () => {
    const createEvent = vi.fn(async (_input: { withMeet: boolean; attendeeEmail: string | null; location: string | null }) => ({ eventId: "evt", meetLink: null }))
    calendar = { connected: true, busy: async () => [], createEvent }
    const noEmail = await submit(form())
    expect(noEmail).toMatchObject({ ok: true, data: { calendarInvite: false, meetLink: null } })
    expect(createEvent.mock.calls[0][0]).toMatchObject({ withMeet: false, attendeeEmail: null, location: "المعبيلة الصناعية، مسقط" })
    const withEmail = await submit(form({ slotStart: "2026-10-25T05:45:00.000Z", email: "salem@example.com", clientName: "سالم", whatsappPhone: "92345678" }))
    expect(withEmail).toMatchObject({ ok: true, data: { calendarInvite: true } })
    expect(createEvent.mock.calls[1][0]).toMatchObject({ withMeet: false, attendeeEmail: "salem@example.com" })
  })

  test("the calendar description uses words, not internal codes", async () => {
    const createEvent = vi.fn(async (_input: { description: string }) => ({ eventId: "evt", meetLink: null }))
    calendar = { connected: true, busy: async () => [], createEvent }
    await submit(form())
    const text = createEvent.mock.calls[0][0].description
    expect(text).toContain("المشروع: فيلا · صور")
    expect(text).toContain("الأرض: أملكها والكروكي جاهز · البدء: خلال 3 أشهر")
    expect(text).not.toMatch(/villa|owned_ready|within_3_months/)
  })

  test("the request keeps the design's code and title, so it survives the design being deleted", async () => {
    await submit(form())
    expect(requests[0]).toMatchObject({ design_id: "d1", design_code: "BD-101", design_title_ar: "فيلا عصرية بمسبح", design_title_en: "Modern villa" })
  })

  test("call me: no time slot, no calendar event, status new", async () => {
    const createEvent = vi.fn()
    calendar = { connected: true, busy: async () => [], createEvent }
    const result = await submit(form({ meetingMode: "call_me", slotStart: "" }))
    expect(result).toMatchObject({ ok: true, data: { mode: "call_me", startsAt: null } })
    expect(requests[0]).toMatchObject({ status: "new", calendar_status: "not_needed", starts_at: null })
    expect(createEvent).not.toHaveBeenCalled()
  })
})

describe("time slots", () => {
  test("a slot that is already booked is refused before saving", async () => {
    await submit(form())
    const second = await submit(form({ clientName: "سالم" }))
    expect(second).toEqual({ ok: false, error: "slotTaken" })
    expect(requests).toHaveLength(1)
  })

  test("two people booking the same slot at the same moment: the database lets only one through", async () => {
    requests.push({ id: "x", organization_id: "another-org", starts_at: SUNDAY_9, status: "confirmed" }) // not visible to the slot check
    const result = await submit(form())
    expect(result).toEqual({ ok: false, error: "slotTaken" })
  })

  test("a cancelled meeting frees its time", async () => {
    await submit(form())
    requests[0].status = "cancelled"
    expect((await submit(form({ clientName: "سالم", whatsappPhone: "92345678" }))).ok).toBe(true)
  })

  test("a time that is not offered (Friday, too soon, off the grid) is refused", async () => {
    for (const slotStart of ["2026-10-23T05:00:00.000Z", "2026-10-21T13:00:00.000Z", "2026-10-25T05:10:00.000Z"]) {
      expect(await submit(form({ slotStart }))).toEqual({ ok: false, error: "slotTaken" })
    }
  })

  test("busy times in the team calendar are not offered; if the calendar cannot be read, bookings alone decide", async () => {
    calendar = { connected: true, busy: async () => [{ start: new Date(SUNDAY_9), end: new Date("2026-10-25T06:00:00Z") }], createEvent: async () => ({ eventId: "e", meetLink: null }) }
    expect(await submit(form())).toEqual({ ok: false, error: "slotTaken" })
    calendar = { connected: true, busy: async () => Promise.reject(new Error("down")), createEvent: async () => ({ eventId: "e", meetLink: null }) }
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      expect((await submit(form())).ok).toBe(true)
    } finally {
      log.mockRestore()
    }
  })

  test("availability lists working days with free slots", async () => {
    const result = await getAvailability(NOW)
    expect(result.ok && result.data.days.find((d) => d.date === "2026-10-25")?.slots[0].start).toBe(SUNDAY_9)
  })
})

describe("abuse and repeats", () => {
  test("the same form sent twice is one request, even past the rate limit", async () => {
    const raw = form()
    const first = await submit(raw)
    address = "10.9.9.9"
    const again = await submitMeetingRequest(raw, NOW)
    expect(again).toEqual(first)
    expect(requests).toHaveLength(1)
  })

  test("more than 5 new requests in 10 minutes from one address are refused", async () => {
    const results = []
    for (let i = 0; i < 6; i += 1) {
      address = "10.2.2.2"
      results.push(await submitMeetingRequest(form({ meetingMode: "call_me", slotStart: "", whatsappPhone: `9123456${i}` }), NOW))
    }
    expect(results.map((r) => r.ok)).toEqual([true, true, true, true, true, false])
    expect(results[5]).toEqual({ ok: false, error: "tooMany" })
  })

  test("one WhatsApp number: at most 3 requests a day, whatever the address (counted in the database)", async () => {
    const results = []
    for (let i = 0; i < 4; i += 1) results.push(await submit(form({ meetingMode: "call_me", slotStart: "" })))
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false])
    expect(results[3]).toEqual({ ok: false, error: "tooMany" })
    requests.forEach((r) => (r.created_at = "2026-10-20T11:00:00.000Z")) // more than a day ago
    expect((await submit(form({ meetingMode: "call_me", slotStart: "" }))).ok).toBe(true)
  })

  test("bots (hidden field filled, or sent within 3 seconds) are refused without saving", async () => {
    expect(await submit(form({ website: "spam" }))).toEqual({ ok: false, error: "failed" })
    expect(await submit(form({ elapsedMs: 500 }))).toEqual({ ok: false, error: "failed" })
    expect(await submit(form({ elapsedMs: undefined }))).toEqual({ ok: false, error: "failed" })
    expect(requests).toHaveLength(0)
  })

  test("reference projects and unknown designs cannot be booked", async () => {
    expect(await submit(form({ designSlug: "saham-public-park" }))).toEqual({ ok: false, error: "designNotBookable" })
    expect(await submit(form({ designSlug: "draft-or-missing" }))).toEqual({ ok: false, error: "designNotBookable" })
  })

  test("invalid forms return field errors", async () => {
    expect(await submit(form({ meetingMode: "remote" }))).toEqual({ ok: false, error: "invalid", fieldErrors: { email: "required" } })
  })
})

describe("idea files", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7 ...")
  test("files in the request's own folder are attached; others are ignored; fakes and files removed from the form are deleted", async () => {
    const key = KEY()
    const own = `${ORG}/${key}/11111111-2222-4333-8444-555555555555.pdf`
    const fake = `${ORG}/${key}/11111111-2222-4333-8444-666666666666.pdf`
    const removedInForm = `${ORG}/${key}/11111111-2222-4333-8444-888888888888.pdf`
    const foreign = `${ORG}/${KEY()}/11111111-2222-4333-8444-777777777777.pdf`
    files.set(own, pdf)
    files.set(fake, new TextEncoder().encode("<html>"))
    files.set(removedInForm, pdf)
    files.set(foreign, pdf)
    const result = await submit(form({ requestKey: key, path: "idea", designSlug: "", ideaText: "", attachmentPaths: [own, fake, foreign] }))
    expect(result.ok).toBe(true)
    expect(attachments.map((a) => a.storage_path)).toEqual([own])
    expect(attachments[0]).toMatchObject({ content_type: "application/pdf", organization_id: ORG })
    expect(removed).toEqual([fake, removedInForm])
    expect([...files.keys()].sort()).toEqual([foreign, own].sort())
  })

  test("a file that cannot be read right now: nothing is saved, the file is kept, sending again works", async () => {
    const key = KEY()
    const own = `${ORG}/${key}/11111111-2222-4333-8444-555555555555.pdf`
    files.set(own, pdf)
    storage.download.mockResolvedValueOnce({ data: null, error: { message: "fetch failed", statusCode: "500" } } as any)
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const raw = form({ requestKey: key, path: "idea", designSlug: "", ideaText: "", attachmentPaths: [own] })
      expect(await submit(raw)).toEqual({ ok: false, error: "failed" })
      expect(requests).toHaveLength(0)
      expect(removed).toEqual([])
      expect(files.has(own)).toBe(true)
      expect((await submit(raw)).ok).toBe(true)
      expect(attachments.map((a) => a.storage_path)).toEqual([own])
    } finally {
      log.mockRestore()
    }
  })

  test("a file record that cannot be saved keeps the file", async () => {
    const key = KEY()
    const own = `${ORG}/${key}/11111111-2222-4333-8444-555555555555.pdf`
    files.set(own, pdf)
    attachmentError = { code: "XX000", message: "db down" }
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      expect((await submit(form({ requestKey: key, path: "idea", designSlug: "", ideaText: "x", attachmentPaths: [own] }))).ok).toBe(true)
      expect(files.has(own)).toBe(true)
      expect(removed).toEqual([])
    } finally {
      log.mockRestore()
    }
  })

  test("an idea with no text needs a real file: paths that are not this request's files do not count", async () => {
    const elsewhere = `${KEY()}/${KEY()}/${KEY()}.pdf`
    const missing = `${ORG}/${KEY()}/${KEY()}.pdf`
    for (const attachmentPaths of [[elsewhere], [missing]]) {
      expect(await submit(form({ path: "idea", designSlug: "", ideaText: "", attachmentPaths }))).toEqual({
        ok: false,
        error: "invalid",
        fieldErrors: { ideaText: "ideaNeeded" },
      })
    }
    expect(requests).toHaveLength(0)
  })

  test("no more uploads into a request that is already sent", async () => {
    const key = KEY()
    await submit(form({ requestKey: key }))
    expect(await prepareIdeaUpload({ requestKey: key, name: "late.pdf", size: 10, type: "application/pdf" })).toEqual({ ok: false, error: "invalid" })
  })

  test("uploads: at most 12 in 10 minutes from one address", async () => {
    const results = []
    for (let i = 0; i < 13; i += 1) {
      address = "10.4.4.4"
      results.push((await prepareIdeaUpload({ requestKey: KEY(), name: "a.pdf", size: 10, type: "application/pdf" })).ok)
    }
    expect(results.filter(Boolean)).toHaveLength(12)
    expect(results[12]).toBe(false)
  })

  test("upload: only images and PDF up to 10 MB, a few per request (3 sent + replacements), into the request's folder", async () => {
    const key = KEY()
    address = "10.3.3.3"
    const ok = await prepareIdeaUpload({ requestKey: key, name: "plan.pdf", size: 1000, type: "application/pdf" })
    expect(ok.ok && ok.data.storagePath).toMatch(new RegExp(`^${ORG}/${key}/[0-9a-f-]{36}\\.pdf$`))
    expect((await prepareIdeaUpload({ requestKey: key, name: "x.exe", size: 10, type: "application/x-msdownload" })).ok).toBe(false)
    expect((await prepareIdeaUpload({ requestKey: key, name: "big.pdf", size: 11 * 1024 * 1024, type: "application/pdf" })).ok).toBe(false)
    expect((await prepareIdeaUpload({ requestKey: "../../x", name: "a.pdf", size: 10, type: "application/pdf" })).ok).toBe(false)
    for (let i = 0; i < 5; i += 1) files.set(`${ORG}/${key}/f${i}.pdf`, pdf)
    expect((await prepareIdeaUpload({ requestKey: key, name: "6.pdf", size: 10, type: "application/pdf" })).ok).toBe(true)
    files.set(`${ORG}/${key}/f5.pdf`, pdf)
    expect(await prepareIdeaUpload({ requestKey: key, name: "7.pdf", size: 10, type: "application/pdf" })).toEqual({
      ok: false,
      error: "invalid",
      fieldErrors: { attachmentPaths: "tooManyFiles" },
    })
  })
})
