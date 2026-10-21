import { NextRequest, NextResponse } from "next/server"
import { isBotUserAgent, parseGalleryEvent } from "@/lib/design-gallery/events"
import { loadPublicGallery, requestHost } from "@/lib/design-gallery/public"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 2048
const done = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })

/**
 * Anonymous page views and contact clicks from the public gallery
 * (sent with navigator.sendBeacon). Always answers 204 so the page never
 * waits on it; malformed events, bots and unknown designs are dropped.
 */
export async function POST(request: NextRequest) {
  try {
    if (isBotUserAgent(request.headers.get("user-agent"))) return done()
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return done()

    let body: unknown = null
    try {
      body = JSON.parse(text)
    } catch {
      return done()
    }
    const event = parseGalleryEvent(body, await requestHost())
    if (!event) return done()

    const gallery = await loadPublicGallery()
    if (!gallery) return done()
    const design = event.designSlug ? gallery.designs.find((d) => d.slug === event.designSlug) : null
    if (event.designSlug && !design) return done()

    const { error } = await createAdminClient().from("design_gallery_events").insert({
      organization_id: gallery.site.organizationId,
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
