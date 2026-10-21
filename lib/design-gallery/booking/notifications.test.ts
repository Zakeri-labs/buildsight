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
  designs: { code: "BD-101" },
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
    const item = designMeetingNotification({ ...row, path: "idea", meeting_mode: "call_me", starts_at: null, status: "new", designs: null }, "Asia/Muscat")
    expect(item).toMatchObject({ reference: "Own idea", context: "Call back · Waiting for a call", status: "New" })
    expect(item.body).toBe("أحمد asked to be called back.")
  })
})

// ---------- who receives them ----------
type Q = { table: string; filters: [string, string, unknown][] }
const queries: Q[] = []
let memberships: { organization_id: string }[] = []
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
const { getDesignMeetingNotificationFeed } = await import("./admin")

describe("feed", () => {
  beforeEach(() => {
    queries.length = 0
    memberships = []
    requestRows = [row]
    requestError = null
  })

  test("only org admins (active) get items, only for their own organizations", async () => {
    memberships = [{ organization_id: "org-a" }]
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

  test("members and viewers get nothing and nothing is read", async () => {
    const feed = await getDesignMeetingNotificationFeed({ userId: "u2" })
    expect(feed).toEqual({ canNotify: false, items: [] })
    expect(queries.map((q) => q.table)).toEqual(["organization_memberships"])
  })

  test("before migration 084 is run, the bell keeps working", async () => {
    memberships = [{ organization_id: "org-a" }]
    requestError = { code: "42P01" }
    expect(await getDesignMeetingNotificationFeed({ userId: "u1" })).toEqual({ canNotify: false, items: [] })
  })
})
