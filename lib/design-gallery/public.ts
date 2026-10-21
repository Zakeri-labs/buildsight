import "server-only"

import { cache } from "react"
import { headers } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { resolveSiteOrigin } from "@/lib/auth/site-origin"
import { DESIGN_COLUMNS, mapCategory, mapDesign, mapSite } from "./server"
import { normalizeHost, pickPublicSite } from "./site"
import type { Design, DesignCategory, DesignGallerySite } from "./types"

/**
 * Public pages read with the anonymous key and no user session, so the
 * database policies (published designs of an enabled gallery only) decide
 * what is shown — even when an admin who is signed in opens the page.
 * The policies allow every enabled gallery, so every query below is also
 * limited to the one organization resolved for the request.
 */
function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export type PublicSite = {
  site: DesignGallerySite
  /**
   * Absolute origin for canonical links, sitemaps and shared links: the
   * site's custom host, else the configured app URL. Never taken from the
   * request's Host header; null when nothing trustworthy is configured.
   */
  origin: string | null
}

export type PublicGallery = PublicSite & {
  categories: DesignCategory[]
  designs: Design[]
}

export async function requestHost(): Promise<string> {
  const h = await headers()
  return normalizeHost(h.get("x-forwarded-host") || h.get("host"))
}

/** The enabled gallery for this request (custom host, else DESIGN_GALLERY_DEFAULT_SITE). */
export const loadPublicSite = cache(async (): Promise<PublicSite | null> => {
  const client = createPublicClient()
  if (!client) return null
  const { data, error } = await client.from("design_gallery_sites").select("*").eq("is_enabled", true)
  if (error) throw error
  const sites = (data ?? []).map(mapSite)
  const host = await requestHost()
  const defaultSlug = process.env.DESIGN_GALLERY_DEFAULT_SITE
  const picked = pickPublicSite(sites, host, defaultSlug, {
    allowSingleSiteFallback: process.env.NODE_ENV !== "production",
  })
  if (defaultSlug?.trim() && !picked?.matchedCustomHost && picked?.site.slug !== defaultSlug.trim().toLowerCase()) {
    console.warn(
      `design gallery: DESIGN_GALLERY_DEFAULT_SITE="${defaultSlug}" matches no enabled gallery [${sites.map((s) => s.slug).join(", ")}]` +
        (picked ? `; showing the database default "${picked.site.slug}"` : ""),
    )
  }
  if (!picked) {
    // Visible in the server logs (e.g. Vercel) when /designs shows "not found".
    console.warn(
      `design gallery: no gallery for host "${host}" — ${sites.length} enabled galleries [${sites.map((s) => s.slug).join(", ")}], ` +
        `DESIGN_GALLERY_DEFAULT_SITE=${defaultSlug ? `"${defaultSlug}"` : "unset"}, default in database: ${sites.find((s) => s.isDefault)?.slug ?? "none"}`,
    )
    return null
  }
  const origin = picked.matchedCustomHost
    ? `https://${normalizeHost(picked.site.customHost)}`
    : await resolveSiteOrigin()
  return { site: picked.site, origin }
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

/** One published design of the request's gallery, by slug (light lookup for the events endpoint). */
export async function findPublicDesign(
  organizationId: string,
  slug: string,
): Promise<{ id: string; isBookable: boolean } | null> {
  const client = createPublicClient()
  if (!client) return null
  const { data, error } = await client
    .from("designs")
    .select("id, is_bookable")
    .eq("organization_id", organizationId)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle()
  if (error) throw error
  return data ? { id: data.id, isBookable: Boolean(data.is_bookable) } : null
}

/** Absolute URL for Open Graph, sitemaps and shared links; null without a trusted origin. */
export function absoluteUrl(origin: string | null, pathOrUrl: string): string | null {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl
  if (!origin) return null
  return `${origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`
}
