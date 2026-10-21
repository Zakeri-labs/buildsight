import type { MetadataRoute } from "next"
import { absoluteUrl, loadPublicGallery } from "@/lib/design-gallery/public"
import { galleryHref } from "@/lib/design-gallery/public-locale"

export const dynamic = "force-dynamic"

/** /designs/sitemap.xml — the gallery and every published design, in Arabic with English alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const gallery = await loadPublicGallery()
  if (!gallery) return []
  const entry = (path: string, lastModified?: string): MetadataRoute.Sitemap[number] => ({
    url: absoluteUrl(gallery.origin, galleryHref(path, "ar")),
    lastModified,
    alternates: {
      languages: {
        ar: absoluteUrl(gallery.origin, galleryHref(path, "ar")),
        en: absoluteUrl(gallery.origin, galleryHref(path, "en")),
      },
    },
  })
  return [entry("/designs"), ...gallery.designs.map((design) => entry(`/designs/${design.slug}`, design.updatedAt))]
}
