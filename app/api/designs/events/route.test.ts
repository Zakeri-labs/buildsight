import { beforeEach, expect, test, vi } from "vitest"

const insert = vi.fn(async () => ({ error: null as unknown }))
let site: unknown = null
const designs: Record<string, { id: string; isBookable: boolean }> = {
  "modern-villa-pool": { id: "d-1", isBookable: true },
  "saham-public-park": { id: "d-2", isBookable: false },
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ insert }) }) }))
vi.mock("@/lib/design-gallery/public", () => ({
  loadPublicSite: async () => site,
  findPublicDesign: async (_org: string, slug: string) => designs[slug] ?? null,
  requestHost: async () => "app.bonyanec.com",
}))

const { POST } = await import("./route")

const BROWSER = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1",
  "sec-fetch-site": "same-origin",
}
let address = 0
const post = (body: string, headers: Record<string, string> = {}) =>
  POST(
    new Request("https://app.bonyanec.com/api/designs/events", {
      method: "POST",
      body,
      // A new address per request, so the rate limit does not interfere unless a test wants it to.
      headers: { ...BROWSER, "x-forwarded-for": `10.0.0.${++address}`, ...headers },
    }) as never,
  )
const json = (value: unknown) => JSON.stringify(value)

beforeEach(() => {
  insert.mockClear()
  site = { site: { organizationId: "org-1" }, origin: "https://app.bonyanec.com" }
})

test("stores a valid view of a published design for the request's organization", async () => {
  const response = await post(json({ type: "design_view", design: "modern-villa-pool", locale: "ar", utm_source: "instagram" }))
  expect(response.status).toBe(204)
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: "org-1", design_id: "d-1", event_type: "design_view", utm_source: "instagram" }))
})

test("drops bots, scripts, other sites, big or malformed bodies, unknown designs and disabled galleries — always 204", async () => {
  const cases: [string, Record<string, string>?][] = [
    [json({ type: "gallery_view" }), { "user-agent": "Googlebot/2.1" }],
    [json({ type: "gallery_view" }), { "user-agent": "curl/8.4.0" }],
    [json({ type: "gallery_view" }), { "sec-fetch-site": "cross-site" }],
    [json({ type: "gallery_view" }), { "sec-fetch-site": "", origin: "https://evil.example" }],
    [json({ type: "gallery_view" }), { "sec-fetch-site": "" }],
    [json({ type: "gallery_view", utm_campaign: "x".repeat(3000) })],
    [json({ type: "gallery_view", utm_campaign: "ب".repeat(1100) })], // under 2048 characters, over 2048 bytes
    ["not json"],
    [json({ type: "design_view", design: "draft-or-missing" })],
  ]
  for (const [body, headers] of cases) expect((await post(body, headers)).status).toBe(204)
  site = null
  expect((await post(json({ type: "gallery_view" }))).status).toBe(204)
  expect(insert).not.toHaveBeenCalled()
})

test("a beacon from this site without Sec-Fetch-Site is accepted by its Origin", async () => {
  await post(json({ type: "gallery_view" }), { "sec-fetch-site": "", origin: "https://app.bonyanec.com" })
  expect(insert).toHaveBeenCalledTimes(1)
})

test("contact intents must fit the design", async () => {
  await post(json({ type: "contact_click", intent: "same", design: "saham-public-park" })) // reference project: no booking
  await post(json({ type: "contact_click", intent: "similar", design: "modern-villa-pool" })) // bookable: not "similar"
  await post(json({ type: "contact_click", intent: "idea", design: "modern-villa-pool" })) // idea has no design
  expect(insert).not.toHaveBeenCalled()
  await post(json({ type: "contact_click", intent: "similar", design: "saham-public-park" }))
  await post(json({ type: "contact_click", intent: "idea" }))
  expect(insert).toHaveBeenCalledTimes(2)
})

test("more than 30 events a minute from one address are dropped", async () => {
  const headers = { "x-forwarded-for": "203.0.113.9" }
  for (let i = 0; i < 35; i += 1) await post(json({ type: "gallery_view" }), headers)
  expect(insert).toHaveBeenCalledTimes(30)
})

test("a database failure is logged and still answers 204", async () => {
  insert.mockResolvedValueOnce({ error: { message: "down" } })
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    expect((await post(json({ type: "gallery_view" }))).status).toBe(204)
    expect(log).toHaveBeenCalledWith("design gallery event not stored:", "down")
  } finally {
    log.mockRestore()
  }
})

test("a body announced as too big is dropped before it is read", async () => {
  const arrayBuffer = vi.fn(async () => new TextEncoder().encode(json({ type: "gallery_view" })).buffer)
  const headers = new Headers({ ...BROWSER, "x-forwarded-for": "198.51.100.7", "content-length": "50000000" })
  expect((await POST({ headers, arrayBuffer } as never)).status).toBe(204)
  expect(arrayBuffer).not.toHaveBeenCalled()
  expect(insert).not.toHaveBeenCalled()
})
