import { describe, expect, test, vi } from "vitest"

vi.mock("@/lib/auth/effective-role", () => ({
  resolveUserEffectiveRole: vi.fn(async (userId: string) => {
    if (userId === "11111111-1111-4111-8111-111111111111") {
      return { role: "architect_administrator", destination: "/design-gallery", organizationId: "org-1" }
    }
    if (userId === "22222222-2222-4222-8222-222222222222") {
      return { role: "admin", destination: "/", organizationId: "org-1" }
    }
    if (userId === "33333333-3333-4333-8333-333333333333") {
      return { role: "member", destination: "/memberhomepage", organizationId: "org-1" }
    }
    return { role: "viewer", destination: "/projects", organizationId: "org-1" }
  }),
}))

const { resolveDefaultLandingDestination } = await import("./default-landing")

describe("resolveDefaultLandingDestination", () => {
  test("routes architect_administrator to /design-gallery", async () => {
    const res = await resolveDefaultLandingDestination("11111111-1111-4111-8111-111111111111")
    expect(res).toEqual({ destination: "/design-gallery", mode: "architect_administrator" })
  })

  test("routes admin to /", async () => {
    const res = await resolveDefaultLandingDestination("22222222-2222-4222-8222-222222222222")
    expect(res).toEqual({ destination: "/", mode: "admin" })
  })

  test("routes member to /memberhomepage", async () => {
    const res = await resolveDefaultLandingDestination("33333333-3333-4333-8333-333333333333")
    expect(res).toEqual({ destination: "/memberhomepage", mode: "member" })
  })

  test("invalid userId falls back to /", async () => {
    const res = await resolveDefaultLandingDestination("invalid-uuid")
    expect(res).toEqual({ destination: "/", mode: "fallback" })
  })
})
