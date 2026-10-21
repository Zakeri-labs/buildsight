import { galleryHref } from "./public-locale"

type SitemapDesign = { slug: string; updatedAt: string }
type SitemapCategory = { key: string }

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

/**
 * The gallery, each category and each published design, with Arabic as the
 * main URL and Arabic/English alternates. `origin` must be trusted (custom
 * host or configured app URL), never the request's Host header.
 */
export function buildGallerySitemap(origin: string, categories: readonly SitemapCategory[], designs: readonly SitemapDesign[]): string {
  const page = (path: string, params: Record<string, string> = {}, lastModified?: string) => {
    const ar = `${origin}${galleryHref(path, "ar", params)}`
    const en = `${origin}${galleryHref(path, "en", params)}`
    return [
      "<url>",
      `<loc>${xmlEscape(ar)}</loc>`,
      `<xhtml:link rel="alternate" hreflang="ar" href="${xmlEscape(ar)}"/>`,
      `<xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(en)}"/>`,
      lastModified ? `<lastmod>${xmlEscape(lastModified)}</lastmod>` : "",
      "</url>",
    ].join("")
  }
  const urls = [
    page("/designs"),
    ...categories.map((category) => page("/designs", { category: category.key })),
    ...designs.map((design) => page(`/designs/${design.slug}`, {}, design.updatedAt)),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`
}
