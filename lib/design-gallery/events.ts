import { CONTACT_INTENTS, type ContactIntent } from "./contact"

export const GALLERY_EVENT_TYPES = ["gallery_view", "design_view", "contact_click"] as const
export type GalleryEventType = (typeof GALLERY_EVENT_TYPES)[number]

export type GalleryEvent = {
  type: GalleryEventType
  intent: ContactIntent | null
  designSlug: string | null
  locale: "ar" | "en" | null
  referrerHost: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|lighthouse|headless/i

/** Crawlers and link previews (WhatsApp, Telegram…) are not visitors. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT.test(userAgent)
}

function shortText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max)
  return cleaned || null
}

/** The referring site's host; null for our own pages, missing or malformed values. */
export function referrerHost(referrer: unknown, ownHost: string | null | undefined): string | null {
  if (typeof referrer !== "string" || !referrer) return null
  try {
    const url = new URL(referrer)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    const host = url.hostname.toLowerCase().slice(0, 255)
    const own = (ownHost ?? "").split(":")[0].toLowerCase()
    return host && host !== own ? host : null
  } catch {
    return null
  }
}

/**
 * Validates an anonymous analytics event sent by the public pages.
 * Returns null for anything malformed; unknown fields are ignored.
 */
export function parseGalleryEvent(body: unknown, ownHost: string | null | undefined): GalleryEvent | null {
  if (!body || typeof body !== "object") return null
  const raw = body as Record<string, unknown>
  if (!GALLERY_EVENT_TYPES.includes(raw.type as GalleryEventType)) return null
  const type = raw.type as GalleryEventType

  const designSlug = typeof raw.design === "string" && raw.design.length <= 80 && SLUG.test(raw.design) ? raw.design : null
  if (type === "design_view" && !designSlug) return null

  const intent = CONTACT_INTENTS.includes(raw.intent as ContactIntent) ? (raw.intent as ContactIntent) : null
  if (type === "contact_click" && !intent) return null

  return {
    type,
    intent: type === "contact_click" ? intent : null,
    designSlug,
    locale: raw.locale === "en" ? "en" : raw.locale === "ar" ? "ar" : null,
    referrerHost: referrerHost(raw.referrer, ownHost),
    utmSource: shortText(raw.utm_source, 100),
    utmMedium: shortText(raw.utm_medium, 100),
    utmCampaign: shortText(raw.utm_campaign, 100),
  }
}
