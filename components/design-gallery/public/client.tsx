"use client"

import { useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import type { ContactIntent } from "@/lib/design-gallery/contact"
import type { GalleryEventType } from "@/lib/design-gallery/events"
import type { PublicLocale } from "@/lib/design-gallery/public-locale"

/**
 * Sets <html lang/dir> for a fixed-language public page and stops the app's
 * language provider from overriding it; restores the app language on leave.
 */
export function HtmlLocale({ locale }: { locale: PublicLocale }) {
  const { locale: appLocale, dir: appDir } = useI18n()
  useEffect(() => {
    const html = document.documentElement
    html.setAttribute("data-locale-locked", "")
    html.setAttribute("lang", locale)
    html.setAttribute("dir", locale === "ar" ? "rtl" : "ltr")
    return () => {
      html.removeAttribute("data-locale-locked")
      html.setAttribute("lang", appLocale)
      html.setAttribute("dir", appDir)
    }
  }, [locale, appLocale, appDir])
  return null
}

type EventPayload = { type: GalleryEventType; intent?: ContactIntent; design?: string; locale: PublicLocale }

// The same contact click within a few seconds (double click, click then
// middle-click) is one contact, not two.
const RECENT_CONTACT_MS = 3000
const recentContacts = new Map<string, number>()

function sendGalleryEvent(payload: EventPayload) {
  try {
    if (payload.type === "contact_click") {
      const key = `${payload.intent}:${payload.design ?? ""}`
      const now = Date.now()
      if (now - (recentContacts.get(key) ?? 0) < RECENT_CONTACT_MS) return
      recentContacts.set(key, now)
    }
    const params = new URLSearchParams(window.location.search)
    const body = JSON.stringify({
      ...payload,
      referrer: document.referrer || undefined,
      utm_source: params.get("utm_source") || undefined,
      utm_medium: params.get("utm_medium") || undefined,
      utm_campaign: params.get("utm_campaign") || undefined,
    })
    const blob = new Blob([body], { type: "application/json" })
    if (!navigator.sendBeacon?.("/api/designs/events", blob)) {
      void fetch("/api/designs/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } })
    }
  } catch {
    // Analytics must never break the page.
  }
}

/** Records one page view per mount. */
export function PageView({ design, locale }: { design?: string; locale: PublicLocale }) {
  useEffect(() => {
    sendGalleryEvent(design ? { type: "design_view", design, locale } : { type: "gallery_view", locale })
  }, [design, locale])
  return null
}

/** An external contact link (WhatsApp) that records the click before leaving. */
export function ContactLink({
  href,
  intent,
  design,
  locale,
  className,
  children,
}: {
  href: string
  intent: ContactIntent
  design?: string
  locale: PublicLocale
  className?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => sendGalleryEvent({ type: "contact_click", intent, design, locale })}
      // Middle-click and "open in new tab" are contacts too.
      onAuxClick={() => sendGalleryEvent({ type: "contact_click", intent, design, locale })}
    >
      {children}
    </a>
  )
}
