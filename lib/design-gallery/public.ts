import "server-only"

import { cache } from "react"
import { headers } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { resolveSiteOrigin } from "@/lib/auth/site-origin"
import { DESIGN_COLUMNS, mapCategory, mapDesign, mapSite } from "./server"
import { pickPublicSite } from "./site"
import type { Design, DesignCategory, DesignGallerySite } from "./types"

/**
 * Public pages read with the anonymous key and no user session, so the
 * database policies (published designs of an enabled gallery only) decide
 * what is shown — even when an admin who is signed in opens the page.
 */
function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export type PublicGallery = {
  site: DesignGallerySite
  origin: string
  categories: DesignCategory[]
  designs: Design[]
}

export async function requestHost(): Promise<string> {
  const h = await headers()
  return (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim().toLowerCase()
}

/** The enabled gallery for this request (custom host, else DESIGN_GALLERY_DEFAULT_SITE, else the only one). */
export const loadPublicSite = cache(async (): Promise<{ site: DesignGallerySite; origin: string } | null> => {
  const client = createPublicClient()
  if (!client) return null
  const { data, error } = await client.from("design_gallery_sites").select("*").eq("is_enabled", true)
  if (error) throw error
  const host = await requestHost()
  const site = pickPublicSite((data ?? []).map(mapSite), host, process.env.DESIGN_GALLERY_DEFAULT_SITE)
  if (!site) return null

  const onCustomHost = site.customHost && site.customHost.toLowerCase() === host.replace(/:\d+$/, "")
  const origin = onCustomHost ? `https://${site.customHost!.toLowerCase()}` : (await resolveSiteOrigin()) ?? `https://${host}`
  return { site, origin }
})

export const loadPublicGallery = cache(async (): Promise<PublicGallery | null> => {
  const resolved = await loadPublicSite()
  if (!resolved) return null
  const client = createPublicClient()!
  const org = resolved.site.organizationId
  const [categories, designs] = await Promise.all([
    client.from("design_categories").select("*").eq("organization_id", org).order("sort_order", { ascending: true }),
    client
      .from("designs")
      .select(DESIGN_COLUMNS)
      .eq("organization_id", org)
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(500),
  ])
  if (categories.error) throw categories.error
  if (designs.error) throw designs.error
  return {
    ...resolved,
    categories: (categories.data ?? []).map(mapCategory),
    // A design whose images could not be shown is left out rather than shown blank.
    designs: (designs.data ?? []).map(mapDesign).filter((design) => design.images.length > 0),
  }
})

export async function loadPublicDesign(slug: string) {
  const gallery = await loadPublicGallery()
  if (!gallery) return null
  const design = gallery.designs.find((d) => d.slug === slug)
  if (!design) return null
  return { ...gallery, design, category: gallery.categories.find((c) => c.id === design.categoryId) ?? null }
}

/** Absolute URL of an image for Open Graph / sitemaps. */
export function absoluteUrl(origin: string, pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`
}
