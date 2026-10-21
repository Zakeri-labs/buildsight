type SiteLike = { slug: string; customHost: string | null }

function hostname(host: string | null | undefined): string {
  return (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
}

/**
 * Which organization's gallery a public request shows:
 * 1. the site whose custom host is the request host (e.g. designs.example.com);
 * 2. otherwise the configured default site slug (DESIGN_GALLERY_DEFAULT_SITE);
 * 3. otherwise the only enabled site, if there is exactly one.
 * `sites` must already be limited to enabled sites.
 */
export function pickPublicSite<T extends SiteLike>(sites: readonly T[], host: string | null | undefined, defaultSlug?: string | null): T | null {
  const requestHost = hostname(host)
  if (requestHost) {
    const byHost = sites.find((site) => site.customHost && hostname(site.customHost) === requestHost)
    if (byHost) return byHost
  }
  const slug = defaultSlug?.trim().toLowerCase()
  if (slug) return sites.find((site) => site.slug === slug) ?? null
  return sites.length === 1 ? sites[0] : null
}
