import { loadPublicGallery } from "@/lib/design-gallery/public"
import { buildGallerySitemap } from "@/lib/design-gallery/sitemap"

export const dynamic = "force-dynamic"

/** Served as /designs/sitemap.xml (see next.config.mjs) for the gallery of this request's organization. */
export async function GET() {
  const gallery = await loadPublicGallery()
  // Without a gallery or a trusted origin there is nothing to list.
  if (!gallery?.origin) return new Response("Not found", { status: 404 })
  return new Response(buildGallerySitemap(gallery.origin, gallery.categories, gallery.designs), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  })
}
