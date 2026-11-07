import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, expect, test, vi } from "vitest"
import type { Design, DesignCategory, DesignGallerySite } from "@/lib/design-gallery/types"

const site: DesignGallerySite = {
  organizationId: "org",
  slug: "bonyan",
  customHost: null,
  isEnabled: true,
  displayNameAr: "بنيان",
  displayNameEn: "Bonyan",
  whatsappPhone: "96894114511",
  logoUrl: null,
  websiteUrl: null,
  isDefault: true,
  booking: { timeZone: "Asia/Muscat", workDays: [0, 1, 2, 3, 4], dayStart: "09:00", dayEnd: "17:00", slotMinutes: 45, minNoticeHours: 12, daysAhead: 21 },
  officeAddressAr: null,
  officeAddressEn: null,
}
const villas: DesignCategory = { id: "c1", key: "villas", nameAr: "فلل سكنية", nameEn: "Villas", sortOrder: 1, bookableByDefault: true }
const design = (overrides: Partial<Design>): Design => ({
  id: "d1",
  organizationId: "org",
  categoryId: "c1",
  slug: "modern-villa-pool",
  code: "BD-101",
  titleAr: "فيلا عصرية بمسبح",
  titleEn: "Modern villa with pool",
  summaryAr: null,
  summaryEn: null,
  descriptionAr: null,
  descriptionEn: null,
  floorsAr: null,
  floorsEn: null,
  builtAreaSqm: null,
  bedrooms: null,
  serviceAr: "تصميم + 3D",
  serviceEn: "Design + 3D",
  isBookable: true,
  status: "published",
  sortOrder: 0,
  publishedAt: null,
  updatedAt: "2026-10-21T00:00:00Z",
  images: [{ id: "i1", storagePath: "/x.webp", url: "/design-gallery/samples/bonyan/x.webp", altAr: null, altEn: null, orderIndex: 0 }],
  ...overrides,
})

let gallery: any = null
vi.mock("@/lib/design-gallery/public", async () => {
  const actual = await vi.importActual<typeof import("@/lib/design-gallery/public")>("@/lib/design-gallery/public")
  return {
    absoluteUrl: actual.absoluteUrl,
    loadPublicGallery: async () => gallery,
    loadPublicSite: async () => (gallery ? { site: gallery.site, origin: gallery.origin } : null),
    loadPublicDesign: async (slug: string) => {
      const found = gallery?.designs.find((d: Design) => d.slug === slug)
      return found ? { ...gallery, design: found, category: villas } : null
    },
  }
})
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))

const listPage = await import("./page")
const detailPage = await import("./[slug]/page")
const bookPage = await import("./book/page")
const { DesignCard, IdeaCard } = await import("@/components/design-gallery/public/design-card")

beforeEach(() => {
  gallery = { site, origin: "https://app.bonyanec.com", categories: [villas], designs: [design({})] }
})

const list = (params: Record<string, string>) => listPage.generateMetadata({ searchParams: Promise.resolve(params) })

test("gallery metadata: canonical keeps the category and language; searches are noindex", async () => {
  const meta = await list({ category: "villas", lang: "en" })
  expect(meta.alternates?.canonical).toBe("https://app.bonyanec.com/designs?category=villas&lang=en")
  expect(meta.alternates?.languages).toMatchObject({ ar: "https://app.bonyanec.com/designs?category=villas" })
  expect(meta.robots).toBeUndefined()
  expect((await list({ q: "فيلا" })).robots).toEqual({ index: false, follow: true })
  expect((await list({ category: "unknown" })).alternates?.canonical).toBe("https://app.bonyanec.com/designs")
})

test("without a trusted origin there are no absolute canonical or image URLs", async () => {
  gallery.origin = null
  const meta = await list({})
  expect(meta.alternates).toBeUndefined()
  expect(meta.openGraph?.url).toBeUndefined()
  expect(meta.openGraph?.images).toBeUndefined()
})

test("a missing or unpublished design is not found, also for its metadata", async () => {
  const props = { params: Promise.resolve({ slug: "stone-facade-villa" }), searchParams: Promise.resolve({}) }
  await expect(detailPage.generateMetadata(props)).rejects.toThrow("NEXT_NOT_FOUND")
  await expect(detailPage.default(props)).rejects.toThrow("NEXT_NOT_FOUND")
})

test("design page: bookable designs get the two booking buttons into the wizard; the illustrative note needs figures", async () => {
  const html = renderToStaticMarkup(await detailPage.default({ params: Promise.resolve({ slug: "modern-villa-pool" }), searchParams: Promise.resolve({}) }))
  expect(html).toContain("أريد تصميماً بهذا الطابع")
  expect(html).toContain("أريده مع تعديلات")
  expect(html).toContain('href="/designs/book?design=modern-villa-pool&amp;path=same"')
  expect(html).toContain('href="/designs/book?design=modern-villa-pool&amp;path=modified"')
  expect(html).toContain("wa.me") // the WhatsApp question stays
  expect(html).not.toContain("مشروع مماثل؟")
  expect(html).not.toContain("أرقام افتراضية للتوضيح") // only "service" is set
})

test("design page: reference projects get “similar project?” and no booking, even without WhatsApp the note shows", async () => {
  gallery.designs = [design({ isBookable: false, builtAreaSqm: 5000 })]
  let html = renderToStaticMarkup(await detailPage.default({ params: Promise.resolve({ slug: "modern-villa-pool" }), searchParams: Promise.resolve({}) }))
  expect(html).toContain("مشروع مماثل؟")
  expect(html).not.toContain("أريد تصميماً بهذا الطابع")
  expect(html).toContain("أرقام افتراضية للتوضيح")
  gallery.site = { ...site, whatsappPhone: null }
  html = renderToStaticMarkup(await detailPage.default({ params: Promise.resolve({ slug: "modern-villa-pool" }), searchParams: Promise.resolve({}) }))
  expect(html).toContain("مشروع مرجعي من أعمالنا")
  expect(html).not.toContain("wa.me")
})

test("cards: booking opens the wizard (also without WhatsApp); reference projects ask on WhatsApp with the design in the message", () => {
  const card = (d: Design, phone: string | null = "96894114511") =>
    renderToStaticMarkup(<DesignCard design={d} category={villas} locale="en" whatsappPhone={phone} designUrl="https://app.bonyanec.com/designs/x" />)
  const bookable = card(design({}), null)
  expect(bookable).toContain("Book a meeting")
  expect(bookable).toContain('href="/designs/book?design=modern-villa-pool&amp;path=same&amp;lang=en"')
  const reference = card(design({ isBookable: false }))
  expect(reference).toContain("Similar project?")
  expect(reference).not.toContain("/designs/book")
  expect(decodeURIComponent(reference.replace(/&amp;/g, "&"))).toContain("Modern villa with pool")
  expect(card(design({ isBookable: false }), null)).not.toContain("wa.me")
  expect(renderToStaticMarkup(<IdeaCard locale="ar" />)).toContain('href="/designs/book"')
})

const book = (params: Record<string, string>) => bookPage.default({ searchParams: Promise.resolve(params) })

test("booking page: the design and path from the address; idea without a design; never indexed", async () => {
  let html = renderToStaticMarkup(await book({ design: "modern-villa-pool", path: "modified" }))
  expect(html).toContain("فيلا عصرية بمسبح")
  expect(html).toContain("مع تعديلات")
  expect(html).toContain("الخطوة 1 من 2")
  expect(html).toContain('href="/designs/book?design=modern-villa-pool&amp;path=modified&amp;lang=en"') // language switch keeps the booking
  html = renderToStaticMarkup(await book({ lang: "en" }))
  expect(html).toContain("Your own idea")
  expect(html).toContain("Describe your idea")
  expect((await bookPage.generateMetadata({ searchParams: Promise.resolve({}) })).robots).toEqual({ index: false, follow: false })
})

test("booking page: unknown designs are not found; reference projects go back to their page", async () => {
  await expect(book({ design: "nope" })).rejects.toThrow("NEXT_NOT_FOUND")
  gallery.designs = [design({ isBookable: false })]
  await expect(book({ design: "modern-villa-pool", lang: "en" })).rejects.toThrow("NEXT_REDIRECT /designs/modern-villa-pool?lang=en")
  gallery = null
  await expect(book({})).rejects.toThrow("NEXT_NOT_FOUND")
})
