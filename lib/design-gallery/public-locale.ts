export type PublicLocale = "ar" | "en"

/** Arabic is the default; only an explicit "en" switches to English. */
export function parsePublicLocale(value: unknown): PublicLocale {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === "en" ? "en" : "ar"
}

/**
 * Link inside the public gallery that keeps the language: Arabic URLs carry no
 * language parameter, English ones carry `lang=en`. Empty params are dropped.
 */
export function galleryHref(
  path: string,
  locale: PublicLocale,
  params: Record<string, string | null | undefined> = {},
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  if (locale === "en") search.set("lang", "en")
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

/** Replaces {name} placeholders in a dictionary text. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}
