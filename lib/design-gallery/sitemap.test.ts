import { expect, test } from "vitest"
import { buildGallerySitemap } from "./sitemap"

test("lists the gallery, categories and designs with escaped Arabic/English alternates", () => {
  const xml = buildGallerySitemap("https://app.bonyanec.com", [{ key: "villas" }], [{ slug: "modern-villa-pool", updatedAt: "2026-10-21T00:00:00Z" }])
  expect(xml).toContain("<loc>https://app.bonyanec.com/designs</loc>")
  expect(xml).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://app.bonyanec.com/designs?category=villas&amp;lang=en"/>')
  expect(xml).toContain("<loc>https://app.bonyanec.com/designs/modern-villa-pool</loc>")
  expect(xml).toContain("<lastmod>2026-10-21T00:00:00Z</lastmod>")
  expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
})
