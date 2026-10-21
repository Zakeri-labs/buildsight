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
      if (table === "design_meeting_requests" && requests.some((r) => r.starts_at && r.starts_at === payload.starts_at && r.status !== "cancelled")) {
        return { data: null, error: { code: "23505", message: "design_meeting_requests_one_per_slot" } }
      }
      const row = { id: crypto.randomUUID(), meet_link: null, ...payload }
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
  download: vi.fn(async (path: string) => (files.has(path) ? { data: new Blob([files.get(path)!]), error: null } : { data: null, error: { message: "missing" } })),
  remove: vi.fn(async (paths: string[]) => (removed.push(...paths), { data: null, error: null })),
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
  openedAt: NOW.getTime() - 60_000,
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
      results.push(await submitMeetingRequest(form({ meetingMode: "call_me", slotStart: "" }), NOW))
    }
    expect(results.map((r) => r.ok)).toEqual([true, true, true, true, true, false])
    expect(results[5]).toEqual({ ok: false, error: "tooMany" })
  })

  test("bots (hidden field filled, or sent within 3 seconds) are refused without saving", async () => {
    expect(await submit(form({ website: "spam" }))).toEqual({ ok: false, error: "failed" })
    expect(await submit(form({ openedAt: NOW.getTime() - 500 }))).toEqual({ ok: false, error: "failed" })
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
  test("files in the request's own folder are attached; others are ignored; fake files are deleted", async () => {
    const key = KEY()
    const own = `${ORG}/${key}/11111111-2222-4333-8444-555555555555.pdf`
    const fake = `${ORG}/${key}/11111111-2222-4333-8444-666666666666.pdf`
    const foreign = `${ORG}/${KEY()}/11111111-2222-4333-8444-777777777777.pdf`
    files.set(own, pdf)
    files.set(fake, new TextEncoder().encode("<html>"))
    files.set(foreign, pdf)
    const result = await submit(form({ requestKey: key, path: "idea", designSlug: "", ideaText: "", attachmentPaths: [own, fake, foreign] }))
    expect(result.ok).toBe(true)
    expect(attachments.map((a) => a.storage_path)).toEqual([own])
    expect(attachments[0]).toMatchObject({ content_type: "application/pdf", organization_id: ORG })
    expect(removed).toEqual([fake])
  })

  test("upload: only images and PDF up to 10 MB, at most 3 per request, into the request's folder", async () => {
    const key = KEY()
    address = "10.3.3.3"
    const ok = await prepareIdeaUpload({ requestKey: key, name: "plan.pdf", size: 1000, type: "application/pdf" })
    expect(ok.ok && ok.data.storagePath).toMatch(new RegExp(`^${ORG}/${key}/[0-9a-f-]{36}\\.pdf$`))
    expect((await prepareIdeaUpload({ requestKey: key, name: "x.exe", size: 10, type: "application/x-msdownload" })).ok).toBe(false)
    expect((await prepareIdeaUpload({ requestKey: key, name: "big.pdf", size: 11 * 1024 * 1024, type: "application/pdf" })).ok).toBe(false)
    expect((await prepareIdeaUpload({ requestKey: "../../x", name: "a.pdf", size: 10, type: "application/pdf" })).ok).toBe(false)
    for (let i = 0; i < 3; i += 1) files.set(`${ORG}/${key}/f${i}.pdf`, pdf)
    expect(await prepareIdeaUpload({ requestKey: key, name: "4.pdf", size: 10, type: "application/pdf" })).toEqual({
      ok: false,
      error: "invalid",
      fieldErrors: { attachmentPaths: "tooManyFiles" },
    })
  })
})
