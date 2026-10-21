import type { PublicLocale } from "../public-locale"

/** Arabic text with Latin digits, as on the rest of the gallery. */
const LOCALE_TAG: Record<PublicLocale, string> = { ar: "ar-OM-u-nu-latn", en: "en-GB" }
/** "9:00 AM" rather than British "9:00 am". */
const TIME_TAG: Record<PublicLocale, string> = { ar: "ar-OM-u-nu-latn", en: "en-US" }

/** A calendar date ("2026-10-25") as day chip parts: "Sun" / "25". */
export function dayChip(date: string, locale: PublicLocale): { weekday: string; day: string; month: string } {
  const noon = new Date(`${date}T12:00:00Z`)
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE_TAG[locale], { timeZone: "UTC", ...options }).format(noon)
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }), month: part({ month: "short" }) }
}

/** "9:00 AM" / "9:00 ص" in the gallery's time zone. */
export function timeLabel(iso: string, locale: PublicLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(TIME_TAG[locale], {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso))
}

/** "Sunday 25 October, 9:00 AM" in the gallery's time zone (confirmation). */
export function meetingWhen(iso: string, locale: PublicLocale, timeZone: string): string {
  const date = new Intl.DateTimeFormat(LOCALE_TAG[locale], { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso))
  return `${date}${locale === "ar" ? "، " : ", "}${timeLabel(iso, locale, timeZone)}`
}
