import type { PublicLocale } from "@/lib/design-gallery/public-locale"

export const BONYAN_CONTACT = {
  phone: "+96894114511",
  phoneRaw: "+96894114511",
  phoneHref: "tel:+96894114511",
  whatsapp: "+96894114511",
  whatsappHref: "https://wa.me/96894114511",
  email: "info@bonyanec.com",
  mapHref: "https://maps.app.goo.gl/QH2wMhHbD71WDPY58",
  locationAr: "سلطنة عُمان - مسقط",
  locationEn: "Muscat, Oman",
  addressAr: "Mabela, Sanaya, Muscat",
  addressEn: "Mabela, Sanaya, Muscat",
  social: [
    { label: "Bonyan Construction", href: "https://instagram.com/bonyan_ec" },
    { label: "Interior Design", href: "https://instagram.com/bonyan_ec" },
    { label: "Construction Consultancy", href: "https://instagram.com/bonyan_ec" },
  ],
} as const

export function mainSiteUrl(path: string, locale: PublicLocale, baseUrl: string): string {
  const root = baseUrl.replace(/\/$/, "")
  const p = path.startsWith("/") ? path : `/${path}`
  if (locale === "ar") {
    return `${root}${p}`
  }
  if (p === "/" || p.startsWith("/#")) {
    return `${root}/en${p === "/" ? "" : p}`
  }
  return `${root}/en${p}`
}
