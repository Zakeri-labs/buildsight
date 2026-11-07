import { beforeEach, expect, test, vi } from "vitest"

// Based on the reviewer's isolation probe: the anonymous policies return
// published designs of EVERY enabled gallery, so only the organization filter
// in lib/design-gallery/public.ts keeps galleries apart.
const A = "org-a"
const B = "org-b"
const image = (id: string) => [{ id, storage_path: `/design-gallery/samples/bonyan/${id}.webp`, order_index: 0 }]
const tables: Record<string, any[]> = {
  design_gallery_sites: [
    { organization_id: A, slug: "bonyan", custom_host: null, is_enabled: true },
    { organization_id: B, slug: "other", custom_host: "Designs.Other.com", is_enabled: true },
  ],
  design_categories: [
    { id: "ca", organization_id: A, key: "villas" },
    { id: "cb", organization_id: B, key: "villas" },
  ],
  designs: [
    { id: "a1", organization_id: A, slug: "villa-a", status: "published", is_bookable: true, design_images: image("a") },
    { id: "b1", organization_id: B, slug: "villa-b", status: "published", is_bookable: true, design_images: image("b") },
  ],
}
function query(rows: any[]): any {
  const q: any = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (key: string, value: unknown) => query(rows.filter((row) => row[key] === value)),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }),
  }
  return q
}
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: (table: string) => query(tables[table]) }) }))
let requestHeaders = new Headers()
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }))
let configuredOrigin: string | null = "https://app.bonyanec.com"
vi.mock("@/lib/auth/site-origin", () => ({ resolveSiteOrigin: async () => configuredOrigin }))

async function load(headers: Record<string, string>) {
  vi.resetModules()
  requestHeaders = new Headers(headers)
  return import("./public")
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
  process.env.DESIGN_GALLERY_DEFAULT_SITE = "bonyan"
  configuredOrigin = "https://app.bonyanec.com"
})

test("the app host shows only the default organization's gallery", async () => {
  const { loadPublicGallery, loadPublicDesign, findPublicDesign } = await load({ host: "app.bonyanec.com" })
  const gallery = (await loadPublicGallery())!
  expect(gallery.designs.map((d) => d.slug)).toEqual(["villa-a"])
  expect(gallery.categories.map((c) => c.id)).toEqual(["ca"])
  expect(gallery.origin).toBe("https://app.bonyanec.com")
  expect(await loadPublicDesign("villa-b")).toBeNull()
  expect(await findPublicDesign(A, "villa-b")).toBeNull()
})

test("a custom host shows only its own organization, with its own origin (trailing dot ignored)", async () => {
  const { loadPublicGallery } = await load({ host: "Designs.Other.com." })
  const gallery = (await loadPublicGallery())!
  expect(gallery.designs.map((d) => d.slug)).toEqual(["villa-b"])
  expect(gallery.categories.map((c) => c.id)).toEqual(["cb"])
  expect(gallery.origin).toBe("https://designs.other.com")
})

test("a forged Host header never becomes the origin of canonical or shared links", async () => {
  const { loadPublicGallery } = await load({ host: "evil.example", "x-forwarded-host": "evil.example" })
  expect((await loadPublicGallery())!.origin).toBe("https://app.bonyanec.com")
  configuredOrigin = null
  const again = await load({ host: "evil.example" })
  expect((await again.loadPublicGallery())!.origin).toBeNull()
})

test("absoluteUrl", async () => {
  const { absoluteUrl } = await load({ host: "app.bonyanec.com" })
  expect(absoluteUrl("https://a.com", "/x.webp")).toBe("https://a.com/x.webp")
  expect(absoluteUrl(null, "/x.webp")).toBeNull()
  expect(absoluteUrl(null, "https://cdn.example/x.webp")).toBe("https://cdn.example/x.webp")
})
