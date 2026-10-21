type SiteLike = { slug: string; customHost: string | null }

/** Host without port, trailing dot or case: "Designs.Other.com.:443" → "designs.other.com". */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
}

export type PickedSite<T> = { site: T; matchedCustomHost: boolean }

/**
 * Which organization's gallery a public request shows:
 * 1. the site whose custom host is the request host (e.g. designs.example.com);
 * 2. otherwise the configured default site slug (DESIGN_GALLERY_DEFAULT_SITE);
 * 3. only during local development without a default: the single enabled site.
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
    return bySlug ? { site: bySlug, matchedCustomHost: false } : null
  }
  if (options.allowSingleSiteFallback && sites.length === 1) return { site: sites[0], matchedCustomHost: false }
  return null
}
