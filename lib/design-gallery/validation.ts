import type { DesignInput, DesignSiteInput } from "./types"

/**
 * Validation for design gallery forms. Returns error codes, not sentences,
 * so the UI can show them in Arabic or English (see `designGallery.errors`
 * in lib/i18n/dictionaries.ts).
 */
export type DesignFieldError =
  | "required"
  | "tooLong"
  | "invalidSlug"
  | "invalidCode"
  | "invalidNumber"
  | "outOfRange"
  | "invalidCategory"
  | "invalidPhone"
  | "taken"

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Partial<Record<keyof T, DesignFieldError>> }

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const CODE_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LIMITS = {
  slug: 80,
  code: 20,
  title: 120,
  summary: 200,
  description: 4000,
  short: 60,
  displayName: 80,
} as const

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value)
}

/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits and separators to ASCII. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".") // Arabic decimal separator
    .replace(/[٬،]/g, ",") // Arabic thousands separator, Arabic comma
}

/** Lower-case, hyphen-separated, ASCII only. Arabic letters are dropped. */
export function slugify(value: string): string {
  return toAsciiDigits(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug)
    .replace(/-+$/g, "")
}

export function normalizeDesignCode(value: string): string {
  return toAsciiDigits(value)
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
}

/** Digits only; accepts "+968 9411 4511", "00968…", Arabic digits. */
export function normalizeWhatsappPhone(value: string): string {
  return toAsciiDigits(value).replace(/\D/g, "").replace(/^00/, "")
}

function text(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : ""
}

function optionalText(raw: unknown): string | null {
  const value = text(raw)
  return value ? value : null
}

function bool(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === "on" || raw === "1"
}

function parseNumber(raw: unknown): number | null | "invalid" {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : "invalid"
  const value = toAsciiDigits(text(raw)).replace(/,/g, "")
  if (!value) return null
  if (!/^\d+(\.\d+)?$/.test(value)) return "invalid"
  return Number(value)
}

export function validateDesignInput(
  raw: Record<string, unknown>,
  allowedCategoryIds: readonly string[],
): ValidationResult<DesignInput> {
  const errors: Partial<Record<keyof DesignInput, DesignFieldError>> = {}

  const titleAr = text(raw.titleAr)
  const titleEn = text(raw.titleEn)
  if (!titleAr) errors.titleAr = "required"
  else if (titleAr.length > LIMITS.title) errors.titleAr = "tooLong"
  if (!titleEn) errors.titleEn = "required"
  else if (titleEn.length > LIMITS.title) errors.titleEn = "tooLong"

  const categoryId = text(raw.categoryId)
  if (!categoryId) errors.categoryId = "required"
  else if (!UUID_PATTERN.test(categoryId) || !allowedCategoryIds.includes(categoryId)) {
    errors.categoryId = "invalidCategory"
  }

  const slugSource = text(raw.slug) || titleEn
  const slug = slugify(slugSource)
  if (!slug) errors.slug = text(raw.slug) ? "invalidSlug" : "required"
  else if (!SLUG_PATTERN.test(slug)) errors.slug = "invalidSlug"

  const code = normalizeDesignCode(text(raw.code))
  if (!code) errors.code = "required"
  else if (code.length > LIMITS.code) errors.code = "tooLong"
  else if (!CODE_PATTERN.test(code)) errors.code = "invalidCode"

  const optional = {
    summaryAr: [optionalText(raw.summaryAr), LIMITS.summary],
    summaryEn: [optionalText(raw.summaryEn), LIMITS.summary],
    descriptionAr: [optionalText(raw.descriptionAr), LIMITS.description],
    descriptionEn: [optionalText(raw.descriptionEn), LIMITS.description],
    floorsAr: [optionalText(raw.floorsAr), LIMITS.short],
    floorsEn: [optionalText(raw.floorsEn), LIMITS.short],
    serviceAr: [optionalText(raw.serviceAr), LIMITS.short],
    serviceEn: [optionalText(raw.serviceEn), LIMITS.short],
  } as const
  for (const [field, [value, limit]] of Object.entries(optional) as [keyof typeof optional, readonly [string | null, number]][]) {
    if (value && value.length > limit) errors[field] = "tooLong"
  }

  const area = parseNumber(raw.builtAreaSqm)
  if (area === "invalid") errors.builtAreaSqm = "invalidNumber"
  else if (area !== null && (area <= 0 || area > 1_000_000)) errors.builtAreaSqm = "outOfRange"

  const bedrooms = parseNumber(raw.bedrooms)
  if (bedrooms === "invalid" || (typeof bedrooms === "number" && !Number.isInteger(bedrooms))) {
    errors.bedrooms = "invalidNumber"
  } else if (bedrooms !== null && (bedrooms < 0 || bedrooms > 50)) errors.bedrooms = "outOfRange"

  const sortOrder = parseNumber(raw.sortOrder)
  if (sortOrder === "invalid" || (typeof sortOrder === "number" && !Number.isInteger(sortOrder))) {
    errors.sortOrder = "invalidNumber"
  } else if (sortOrder !== null && sortOrder > 100_000) errors.sortOrder = "outOfRange"

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      categoryId,
      slug,
      code,
      titleAr,
      titleEn,
      summaryAr: optional.summaryAr[0],
      summaryEn: optional.summaryEn[0],
      descriptionAr: optional.descriptionAr[0],
      descriptionEn: optional.descriptionEn[0],
      floorsAr: optional.floorsAr[0],
      floorsEn: optional.floorsEn[0],
      builtAreaSqm: area as number | null,
      bedrooms: bedrooms as number | null,
      serviceAr: optional.serviceAr[0],
      serviceEn: optional.serviceEn[0],
      isBookable: bool(raw.isBookable),
      sortOrder: (sortOrder as number | null) ?? 0,
    },
  }
}

export function validateSiteInput(raw: Record<string, unknown>): ValidationResult<DesignSiteInput> {
  const errors: Partial<Record<keyof DesignSiteInput, DesignFieldError>> = {}
  const displayNameAr = optionalText(raw.displayNameAr)
  const displayNameEn = optionalText(raw.displayNameEn)
  if (displayNameAr && displayNameAr.length > LIMITS.displayName) errors.displayNameAr = "tooLong"
  if (displayNameEn && displayNameEn.length > LIMITS.displayName) errors.displayNameEn = "tooLong"

  const phoneRaw = text(raw.whatsappPhone)
  const whatsappPhone = phoneRaw ? normalizeWhatsappPhone(phoneRaw) : null
  if (phoneRaw && (!whatsappPhone || whatsappPhone.length < 8 || whatsappPhone.length > 15)) {
    errors.whatsappPhone = "invalidPhone"
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { isEnabled: bool(raw.isEnabled), displayNameAr, displayNameEn, whatsappPhone } }
}
