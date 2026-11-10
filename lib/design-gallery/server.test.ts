import { beforeEach, expect, test, vi } from "vitest"

const ORG = "aaaaaaaa-1111-4222-8333-444444444444"
const session = vi.fn()
const maybeSingle = vi.fn()
const selectFn = vi.fn()

const fakeAdmin = {
  from: vi.fn(() => ({
    select: selectFn.mockImplementation(() => {
      const chain: any = {
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        maybeSingle: () => maybeSingle(),
      }
      return chain
    }),
  })),
}

vi.mock("@/lib/auth/session", () => ({ requireOnboarded: () => session() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeAdmin }))
vi.mock("@/lib/auth/guards", () => {
  class AuthzError extends Error {}
  return { AuthzError, getUserIdOrThrow: vi.fn(async () => "user-1") }
})

const { requireDesignGalleryAdmin, getDesignGalleryAdmin, assertDesignGalleryAdmin, mapDesign } = await import("./server")
const { AuthzError } = await import("@/lib/auth/guards")

beforeEach(() => {
  session.mockReset()
  maybeSingle.mockReset()
  selectFn.mockClear()
})

test("the session claim is re-checked against the database before any access", async () => {
  session.mockResolvedValue({ memberships: [{ role: "org_admin", organization: { id: ORG, name: "Bonyan", type: "supervising" } }] })
  maybeSingle.mockResolvedValue({ data: null, error: null })
  await expect(requireDesignGalleryAdmin()).rejects.toThrow("Only organization admins and architect administrators can manage the design gallery.")
  expect(await getDesignGalleryAdmin()).toBeNull()
})

test("an admin gets their organization and the user id confirmed by the database", async () => {
  session.mockResolvedValue({ memberships: [{ role: "org_admin", organization: { id: ORG, name: "Bonyan", type: "supervising" } }] })
  maybeSingle.mockResolvedValue({ data: { id: "m1" }, error: null })
  expect(await requireDesignGalleryAdmin()).toEqual({ userId: "user-1", org: { id: ORG, name: "Bonyan" }, admin: fakeAdmin })
})

test("an architect_administrator gets their organization and the user id confirmed by the database", async () => {
  session.mockResolvedValue({ memberships: [{ role: "architect_administrator", organization: { id: ORG, name: "Bonyan", type: "supervising" } }] })
  maybeSingle.mockResolvedValue({ data: { id: "m2" }, error: null })
  expect(await requireDesignGalleryAdmin()).toEqual({ userId: "user-1", org: { id: ORG, name: "Bonyan" }, admin: fakeAdmin })
})

test("a member who is not an admin anywhere is refused without a database check", async () => {
  session.mockResolvedValue({ memberships: [{ role: "org_member", organization: { id: ORG, name: "Bonyan", type: "supervising" } }] })
  await expect(requireDesignGalleryAdmin()).rejects.toBeInstanceOf(AuthzError)
  expect(maybeSingle).not.toHaveBeenCalled()
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
