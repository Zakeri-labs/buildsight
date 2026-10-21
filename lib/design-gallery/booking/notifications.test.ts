import { beforeEach, describe, expect, test, vi } from "vitest"
import { designMeetingNotification } from "./notifications"

const row = {
  id: "r1",
  organization_id: "org-a",
  client_name: "أحمد",
  path: "modified",
  meeting_mode: "office",
  starts_at: "2026-10-25T05:00:00Z",
  status: "confirmed",
  created_at: "2026-10-21T12:00:00Z",
  design_code: "BD-101",
}

describe("bell item for a meeting request", () => {
  test("shows client, design and the time in the gallery's time zone, and links to the request", () => {
    expect(designMeetingNotification(row, "Asia/Muscat")).toMatchObject({
      kind: "design_meeting",
      notificationKey: "design_meeting:r1",
      subject: "أحمد",
      reference: "BD-101 · with changes",
      context: "Office meeting · Sun 25 Oct, 09:00",
      href: "/design-gallery/requests?request=r1",
      status: "Confirmed",
    })
  })

  test("a call-back request has no time; an idea has no design", () => {
    const item = designMeetingNotification({ ...row, path: "idea", meeting_mode: "call_me", starts_at: null, status: "new", design_code: null }, "Asia/Muscat")
    expect(item).toMatchObject({ reference: "Own idea", context: "Call back · Waiting for a call", status: "New" })
    expect(item.body).toBe("أحمد asked to be called back.")
  })
})

// ---------- who receives them ----------
type Q = { table: string; filters: [string, string, unknown][] }
const queries: Q[] = []
type Membership = { role: string; organizations: { id: string; name: string; type: string } }
let memberships: Membership[] = []
const adminOf = (id: string, type = "supervising"): Membership => ({ role: "org_admin", organizations: { id, name: id, type } })
let requestRows: unknown[] = []
let requestError: { code: string } | null = null
function from(table: string) {
  const q: Q = { table, filters: [] }
  queries.push(q)
  const chain: any = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    eq: (k: string, v: unknown) => (q.filters.push(["eq", k, v]), chain),
    in: (k: string, v: unknown) => (q.filters.push(["in", k, v]), chain),
    gte: (k: string, v: unknown) => (q.filters.push(["gte", k, v]), chain),
    then: (resolve: (v: unknown) => unknown) =>
      resolve(
        table === "organization_memberships"
          ? { data: memberships, error: null }
          : table === "design_meeting_requests"
            ? { data: requestError ? null : requestRows, error: requestError }
            : { data: [{ organization_id: "org-a", booking_timezone: "Asia/Muscat" }], error: null },
      ),
  }
  return chain
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }))
vi.mock("./server", () => ({ MEETING_FILES_BUCKET: "design-meeting-files" }))
const { getDesignMeetingNotificationFeed, loadMeetingRequests } = await import("./admin")

describe("feed", () => {
  beforeEach(() => {
    queries.length = 0
    memberships = []
    requestRows = [row]
    requestError = null
  })

  test("only org admins (active) get items, only for their own organizations", async () => {
    memberships = [adminOf("org-a")]
    const feed = await getDesignMeetingNotificationFeed({ userId: "u1", now: new Date("2026-10-21T13:00:00Z") })
    expect(feed.items).toHaveLength(1)
    expect(queries[0].filters).toEqual([
      ["eq", "user_id", "u1"],
      ["eq", "role", "org_admin"],
      ["eq", "status", "active"],
    ])
    const requests = queries.find((q) => q.table === "design_meeting_requests")!
    expect(requests.filters).toContainEqual(["in", "organization_id", ["org-a"]])
    expect(requests.filters).toContainEqual(["in", "status", ["new", "confirmed"]])
  })

  test("an admin of two organizations gets the requests of the gallery they manage (the one the list shows)", async () => {
    memberships = [adminOf("org-z", "external"), adminOf("org-a", "supervising")]
    await getDesignMeetingNotificationFeed({ userId: "u1" })
    const requests = queries.find((q) => q.table === "design_meeting_requests")!
    expect(requests.filters).toContainEqual(["in", "organization_id", ["org-a"]])
  })

  test("members and viewers get nothing and nothing is read", async () => {
    const feed = await getDesignMeetingNotificationFeed({ userId: "u2" })
    expect(feed).toEqual({ canNotify: false, items: [] })
    expect(queries.map((q) => q.table)).toEqual(["organization_memberships"])
  })

  test("before migration 084 is run, the bell keeps working", async () => {
    memberships = [adminOf("org-a")]
    requestError = { code: "42P01" }
    expect(await getDesignMeetingNotificationFeed({ userId: "u1" })).toEqual({ canNotify: false, items: [] })
  })
})

describe("request list", () => {
  test("reads only the admin's own organization; files get short-lived links; a deleted design still shows", async () => {
    const filters: [string, unknown][] = []
    const signed = vi.fn(async (paths: string[], seconds: number) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}?ttl=${seconds}` })),
      error: null,
    }))
    const rows = [
      {
        id: "r1",
        path: "same",
        client_name: "أحمد",
        whatsapp_phone: "96891234567",
        meeting_mode: "office",
        status: "confirmed",
        calendar_status: "failed",
        calendar_error: "token: invalid_grant",
        created_at: "2026-10-21T10:00:00Z",
        land_area_sqm: "600.00",
        designs: null,
        design_code: "BD-101",
        design_title_ar: "فيلا عصرية بمسبح",
        design_title_en: "Modern villa",
        design_meeting_attachments: [{ id: "f1", storage_path: "org-a/k/f.pdf", content_type: "application/pdf", file_name: null }],
      },
    ]
    const chain: any = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (k: string, v: unknown) => (filters.push([k, v]), chain),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
    }
    const ctx = { org: { id: "org-a", name: "A" }, userId: "u", admin: { from: () => chain, storage: { from: () => ({ createSignedUrls: signed }) } } } as any
    const [request] = await loadMeetingRequests(ctx)
    expect(filters).toEqual([["organization_id", "org-a"]])
    expect(request.design).toEqual({ slug: null, code: "BD-101", titleAr: "فيلا عصرية بمسبح", titleEn: "Modern villa" })
    expect(request.landAreaSqm).toBe(600)
    expect(request.calendarError).toBe("token: invalid_grant")
    expect(request.attachments[0].url).toBe("https://signed/org-a/k/f.pdf?ttl=3600")
  })
})
