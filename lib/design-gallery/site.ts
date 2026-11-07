type SiteLike = { slug: string; customHost: string | null; isDefault?: boolean }

/** Host without port, trailing dot or case: "Designs.Other.com.:443" → "designs.other.com". */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
}

export type PickedSite<T> = { site: T; matchedCustomHost: boolean }

/**
 * Which organization's gallery a public request shows:
 * 1. the site whose custom host is the request host (e.g. designs.example.com);
 * 2. otherwise DESIGN_GALLERY_DEFAULT_SITE, when it names an enabled site;
 * 3. otherwise the site marked as the default in the database (082 migration);
 * 4. only during local development without any default: the single enabled site.
 * `sites` must already be limited to enabled sites.
 */
export function pickPublicSite<T extends SiteLike>(
  sites: readonly T[],
  host: string | null | undefined,
  defaultSlug: string | null | undefined,
  options: { allowSingleSiteFallback?: boolean } = {},
): PickedSite<T> | null {
  const requestHost = normalizeHost(host)
  if (requestHost) {
    const byHost = sites.find((site) => site.customHost && normalizeHost(site.customHost) === requestHost)
    if (byHost) return { site: byHost, matchedCustomHost: true }
  }
  const slug = defaultSlug?.trim().toLowerCase()
  if (slug) {
    const bySlug = sites.find((site) => site.slug === slug)
    if (bySlug) return { site: bySlug, matchedCustomHost: false }
    // A variable naming a gallery that does not exist (or is switched off)
    // must not hide the default gallery; the caller logs the mismatch.
  }
  const marked = sites.find((site) => site.isDefault)
  if (marked) return { site: marked, matchedCustomHost: false }
  if (options.allowSingleSiteFallback && sites.length === 1) return { site: sites[0], matchedCustomHost: false }
  return null
}
