import { beforeEach, expect, test, vi } from "vitest"

const ORG = "aaaaaaaa-1111-4222-8333-444444444444"
const session = vi.fn()
const assertOrgAdmin = vi.fn()

vi.mock("@/lib/auth/session", () => ({ requireOnboarded: () => session() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ fake: true }) }))
vi.mock("@/lib/auth/guards", () => {
  class AuthzError extends Error {}
  return { AuthzError, assertOrgAdmin: (org: string) => assertOrgAdmin(org) }
})

const { requireDesignGalleryAdmin, getDesignGalleryAdmin, mapDesign } = await import("./server")
const { AuthzError } = await import("@/lib/auth/guards")

beforeEach(() => {
  session.mockReset()
  assertOrgAdmin.mockReset()
})

test("the session claim is re-checked against the database before any access", async () => {
  session.mockResolvedValue({ memberships: [{ role: "org_admin", organization: { id: ORG, name: "Bonyan", type: "supervising" } }] })
  assertOrgAdmin.mockRejectedValue(new AuthzError("membership revoked"))
  await expect(requireDesignGalleryAdmin()).rejects.toThrow("membership revoked")
  expect(assertOrgAdmin).toHaveBeenCalledWith(ORG)
  expect(await getDesignGalleryAdmin()).toBeNull()
})

test("an admin gets their organization and the user id confirmed by the database", async () => {
  session.mockResolvedValue({ memberships: [{ role: "org_admin", organization: { id: ORG, name: "Bonyan", type: "supervising" } }] })
  assertOrgAdmin.mockResolvedValue("user-1")
  expect(await requireDesignGalleryAdmin()).toEqual({ userId: "user-1", org: { id: ORG, name: "Bonyan" }, admin: { fake: true } })
})

test("a member who is not an admin anywhere is refused without a database check", async () => {
  session.mockResolvedValue({ memberships: [{ role: "org_member", organization: { id: ORG, name: "Bonyan", type: "supervising" } }] })
  await expect(requireDesignGalleryAdmin()).rejects.toBeInstanceOf(AuthzError)
  expect(assertOrgAdmin).not.toHaveBeenCalled()
})

test("mapDesign reads numbers sent as strings and orders images by position", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"
  const design = mapDesign({
    id: "d",
    built_area_sqm: "520.00",
    bedrooms: 5,
    design_images: [
      { id: "b", storage_path: "/design-gallery/samples/bonyan/b.webp", order_index: 1 },
      { id: "x", storage_path: "https://evil.example/x.png", order_index: 0 },
      { id: "a", storage_path: "/design-gallery/samples/bonyan/a.webp", order_index: 0 },
    ],
  })
  expect(design.builtAreaSqm).toBe(520)
  expect(design.images.map((i) => i.id)).toEqual(["a", "b"])
})
