import "server-only"

import { headers } from "next/headers"

const PUBLIC_SITE_URL_ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "APP_URL",
  "SITE_URL",
  "BASE_URL",
] as const

function normalizeOrigin(value: string | null | undefined, defaultProtocol = "https:"): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `${defaultProtocol}//${trimmed}`
    const parsed = new URL(withProtocol)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null
    if (parsed.username || parsed.password) return null
    return parsed.origin
  } catch {
    return null
  }
}

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? ""
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}

function hostnameFromHost(host: string): string {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase()
  } catch {
    return ""
  }
}

function normalizedVercelHost(value: string | undefined): string {
  const origin = normalizeOrigin(value)
  if (!origin) return ""
  return new URL(origin).host.toLowerCase()
}

/**
 * Resolve the public application origin without trusting client-submitted URL values.
 * Production must use an explicit configured URL or Vercel's trusted production URL.
 * Preview request hosts are accepted only when they match Vercel-provided deployment hosts.
 */
export async function resolveSiteOrigin(): Promise<string | null> {
  for (const key of PUBLIC_SITE_URL_ENV_KEYS) {
    const origin = normalizeOrigin(process.env[key])
    if (origin) return origin
  }

  if (process.env.VERCEL_ENV === "production") {
    const productionOrigin = normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    if (productionOrigin) return productionOrigin
  }

  const requestHeaders = await headers()
  const forwardedHost = firstHeaderValue(requestHeaders.get("x-forwarded-host"))
  const directHost = firstHeaderValue(requestHeaders.get("host"))
  const requestHost = (forwardedHost || directHost).toLowerCase()
  const requestHostname = hostnameFromHost(requestHost)

  if (process.env.VERCEL_ENV === "preview") {
    const trustedPreviewHosts = new Set(
      [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
        .map(normalizedVercelHost)
        .filter(Boolean),
    )

    if (requestHost && trustedPreviewHosts.has(requestHost)) {
      return `https://${requestHost}`
    }

    const previewOrigin = normalizeOrigin(process.env.VERCEL_URL)
    if (previewOrigin) return previewOrigin
  }

  if (process.env.NODE_ENV !== "production") {
    const legacyDevOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL, "http:")
    if (legacyDevOrigin && isLocalHostname(new URL(legacyDevOrigin).hostname.toLowerCase())) {
      return legacyDevOrigin
    }

    if (requestHost && isLocalHostname(requestHostname)) {
      const forwardedProto = firstHeaderValue(requestHeaders.get("x-forwarded-proto"))
      const protocol = forwardedProto === "https" ? "https" : "http"
      return `${protocol}://${requestHost}`
    }

    return "http://localhost:3000"
  }

  return null
}

export async function buildAuthCallbackUrl(nextPath: string): Promise<string | null> {
  const origin = await resolveSiteOrigin()
  if (!origin) return null

  const callbackUrl = new URL("/auth/callback", origin)
  callbackUrl.searchParams.set("next", nextPath)
  return callbackUrl.toString()
}
