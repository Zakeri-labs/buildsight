import { describe, expect, test, vi } from "vitest"

vi.mock("@/lib/design-gallery/booking/server", () => ({
  getAvailability: vi.fn(async () => ({
    ok: true,
    data: {
      days: [{ date: "2026-11-20", weekday: 5, slots: [] }],
      timeZone: "Asia/Muscat",
    },
  })),
}))

describe("GET /api/designs/availability", () => {
  test("returns availability data with CORS headers", async () => {
    const { GET, OPTIONS } = await import("./route")

    const optRes = await OPTIONS()
    expect(optRes.status).toBe(204)
    expect(optRes.headers.get("access-control-allow-origin")).toBe("*")

    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.data.timeZone).toBe("Asia/Muscat")
  })
})
