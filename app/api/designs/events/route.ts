import { NextRequest, NextResponse } from "next/server"
import { isBotUserAgent, isConsistentEvent, isSameSiteBeacon, parseGalleryEvent } from "@/lib/design-gallery/events"
import { findPublicDesign, loadPublicSite, requestHost } from "@/lib/design-gallery/public"
import { createRateLimiter } from "@/lib/design-gallery/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 2048
const allow = createRateLimiter({ limit: 30, windowMs: 60_000 })
const done = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })

function clientAddress(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown"
}

/**
 * Anonymous page views and contact clicks from the public gallery
 * (navigator.sendBeacon). Always answers 204 so the page never waits on it.
 * Dropped: bots and scripts, beacons from other sites, more than 30 events a
 * minute from one address, bodies over 2 KB, malformed events, designs that
 * are not published in this request's gallery, and contact intents that do
 * not fit the design.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBotUserAgent(request.headers.get("user-agent"))) return done()
    const host = await requestHost()
    if (!isSameSiteBeacon(request.headers, host)) return done()
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return done()
    if (!allow(clientAddress(request))) return done()

    const bytes = await request.arrayBuffer()
    if (bytes.byteLength > MAX_BODY_BYTES) return done()
    let body: unknown = null
    try {
      body = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      return done()
    }
    const event = parseGalleryEvent(body, host)
    if (!event) return done()

    const resolved = await loadPublicSite()
    if (!resolved) return done()
    const organizationId = resolved.site.organizationId
    const design = event.designSlug ? await findPublicDesign(organizationId, event.designSlug) : null
    if (event.designSlug && !design) return done()
    if (!isConsistentEvent(event, design)) return done()

    const { error } = await createAdminClient().from("design_gallery_events").insert({
      organization_id: organizationId,
      design_id: design?.id ?? null,
      event_type: event.type,
      intent: event.intent,
      locale: event.locale,
      referrer_host: event.referrerHost,
      utm_source: event.utmSource,
      utm_medium: event.utmMedium,
      utm_campaign: event.utmCampaign,
    })
    if (error) console.error("design gallery event not stored:", error.message)
  } catch (error) {
    console.error("design gallery event failed:", error instanceof Error ? error.message : error)
  }
  return done()
}
