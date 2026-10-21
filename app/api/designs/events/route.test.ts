import { beforeEach, expect, test, vi } from "vitest"

const insert = vi.fn(async () => ({ error: null }))
let gallery: unknown = null

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ insert }) }) }))
vi.mock("@/lib/design-gallery/public", () => ({
  loadPublicGallery: async () => gallery,
  requestHost: async () => "app.bonyanec.com",
}))

const { POST } = await import("./route")

const HUMAN = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1"
const post = (body: string, userAgent = HUMAN) =>
  POST(new Request("https://app.bonyanec.com/api/designs/events", { method: "POST", body, headers: { "user-agent": userAgent } }) as never)

beforeEach(() => {
  insert.mockClear()
  gallery = { site: { organizationId: "org-1" }, designs: [{ id: "d-1", slug: "modern-villa-pool" }] }
})

test("stores a valid view of a published design for the request's organization", async () => {
  const response = await post(JSON.stringify({ type: "design_view", design: "modern-villa-pool", locale: "ar", utm_source: "instagram" }))
  expect(response.status).toBe(204)
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ organization_id: "org-1", design_id: "d-1", event_type: "design_view", utm_source: "instagram" }))
})

test("drops bots, oversized or malformed bodies, unknown designs and disabled galleries — always answering 204", async () => {
  const cases: [string, string?][] = [
    [JSON.stringify({ type: "gallery_view" }), "Googlebot/2.1"],
    [JSON.stringify({ type: "gallery_view", utm_campaign: "x".repeat(3000) })],
    ["not json"],
    [JSON.stringify({ type: "design_view", design: "draft-or-missing" })],
  ]
  for (const [body, ua] of cases) expect((await post(body, ua)).status).toBe(204)
  gallery = null
  expect((await post(JSON.stringify({ type: "gallery_view" }))).status).toBe(204)
  expect(insert).not.toHaveBeenCalled()
})

test("a database failure is logged and still answers 204", async () => {
  insert.mockResolvedValueOnce({ error: { message: "down" } } as never)
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    expect((await post(JSON.stringify({ type: "gallery_view" }))).status).toBe(204)
    expect(log).toHaveBeenCalledWith("design gallery event not stored:", "down")
  } finally {
    log.mockRestore()
  }
})
