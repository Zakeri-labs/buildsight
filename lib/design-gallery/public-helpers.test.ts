import { describe, expect, test } from "vitest"
import { contactMessage } from "./contact"
import { galleryHref, parsePublicLocale } from "./public-locale"
import { filterDesigns, normalizeForSearch } from "./search"
import { normalizeHost, pickPublicSite } from "./site"

describe("public locale", () => {
  test("Arabic unless lang=en", () => {
    expect(parsePublicLocale(undefined)).toBe("ar")
    expect(parsePublicLocale("en")).toBe("en")
    expect(parsePublicLocale(["en", "ar"])).toBe("en")
    expect(parsePublicLocale("EN")).toBe("ar")
    expect(parsePublicLocale("fr")).toBe("ar")
  })

  test("links keep the language and drop empty parameters", () => {
    expect(galleryHref("/designs", "ar", { q: "", category: "villas" })).toBe("/designs?category=villas")
    expect(galleryHref("/designs/villa", "en")).toBe("/designs/villa?lang=en")
    expect(galleryHref("/designs", "en", { q: "فيلا مسبح" })).toBe("/designs?q=%D9%81%D9%8A%D9%84%D8%A7+%D9%85%D8%B3%D8%A8%D8%AD&lang=en")
  })
})

describe("pickPublicSite", () => {
  const bonyan = { slug: "bonyan", customHost: null }
  const other = { slug: "other", customHost: "Designs.Other.com" }
  const pick = (...args: Parameters<typeof pickPublicSite>) => pickPublicSite(...args)

  test("a custom host wins, ignoring case, port and trailing dot", () => {
    expect(pick([bonyan, other], "designs.other.com:443", "bonyan")).toEqual({ site: other, matchedCustomHost: true })
    expect(pick([bonyan, other], "DESIGNS.OTHER.COM.", "bonyan")).toEqual({ site: other, matchedCustomHost: true })
  })

  test("other hosts use the configured default site", () => {
    expect(pick([bonyan, other], "app.bonyanec.com", "bonyan")).toEqual({ site: bonyan, matchedCustomHost: false })
    expect(pick([bonyan, other], "app.bonyanec.com", "missing")).toBeNull()
  })

  test("without a default, nothing is shown — except a single site during local development", () => {
    expect(pick([bonyan], "app.bonyanec.com", null)).toBeNull()
    expect(pick([bonyan], "localhost:3000", null, { allowSingleSiteFallback: true })).toEqual({ site: bonyan, matchedCustomHost: false })
    expect(pick([bonyan, other], "localhost:3000", null, { allowSingleSiteFallback: true })).toBeNull()
    expect(pick([], "localhost:3000", "bonyan")).toBeNull()
  })

  test("a lookalike host does not match a custom host", () => {
    expect(pick([bonyan, other], "designs.other.com.evil.com", "bonyan")).toEqual({ site: bonyan, matchedCustomHost: false })
  })

  test("normalizeHost", () => {
    expect(normalizeHost(" Designs.Other.com.:8443, proxy.local")).toBe("designs.other.com")
    expect(normalizeHost(null)).toBe("")
  })
})

describe("search", () => {
  const categories = [
    { id: "c1", key: "villas", nameAr: "فلل سكنية", nameEn: "Villas" },
    { id: "c2", key: "public-spaces", nameAr: "فضاءات عامة", nameEn: "Public spaces" },
  ]
  const base = {
    summaryAr: null, summaryEn: null, descriptionAr: null, descriptionEn: null,
    floorsAr: null, floorsEn: null, serviceAr: null, serviceEn: null,
  }
  const pool = { ...base, categoryId: "c1", code: "BD-101", titleAr: "فيلا عصرية بمسبح", titleEn: "Modern villa with pool", floorsAr: "سطح + 2" }
  const stone = { ...base, categoryId: "c1", code: "BD-103", titleAr: "فيلا بواجهة حجرية", titleEn: "Stone-facade villa" }
  const park = { ...base, categoryId: "c2", code: "BD-502", titleAr: "حديقة صحم العامة", titleEn: "Saham public park", descriptionAr: "مسارات مشي وملاعب" }
  const designs = [pool, stone, park]
  const find = (query: string, categoryKey?: string) => filterDesigns(designs, categories, { query, categoryKey }).map((d) => d.code)

  test("finds the words visitors type, in Arabic or English", () => {
    expect(find("فيلا")).toEqual(["BD-101", "BD-103"])
    expect(find("مسبح")).toEqual(["BD-101"])
    expect(find("villa")).toEqual(["BD-101", "BD-103"])
    expect(find("POOL")).toEqual(["BD-101"])
    expect(find("bd-502")).toEqual(["BD-502"])
  })

  test("matches across spelling variants: hamza, ta marbuta, ya, diacritics, Persian letters and digits", () => {
    expect(find("فِيلَا")).toEqual(["BD-101", "BD-103"])
    expect(find("حجريه")).toEqual(["BD-103"])
    expect(find("عامه")).toEqual(["BD-502"])
    expect(find("فیلا")).toEqual(["BD-101", "BD-103"]) // Persian ی
    expect(find("سطح ٢")).toEqual(["BD-101"])
    expect(find("ملاعب")).toEqual(["BD-502"])
  })

  test("every word must match; unrelated input finds nothing", () => {
    expect(find("فيلا مسبح")).toEqual(["BD-101"])
    expect(find("فيلا حديقة")).toEqual([])
    expect(find("hospital")).toEqual([])
    expect(find("مستشفى")).toEqual([])
  })

  test("category by key, combined with the query; empty query keeps everything", () => {
    expect(find("", "villas")).toEqual(["BD-101", "BD-103"])
    expect(find("مسبح", "public-spaces")).toEqual([])
    expect(find("", "all")).toEqual(["BD-101", "BD-103", "BD-502"])
    expect(find("", "unknown-category")).toEqual([])
    expect(find("   ")).toEqual(["BD-101", "BD-103", "BD-502"])
  })

  test("category names are searchable", () => {
    expect(find("فضاءات")).toEqual(["BD-502"])
    expect(find("villas")).toEqual(["BD-101", "BD-103"])
  })

  test("Arabic article and attached prepositions, English plurals", () => {
    expect(find("الفيلا")).toEqual(["BD-101", "BD-103"])
    expect(find("بالمسبح")).toEqual(["BD-101"])
    expect(find("pools")).toEqual(["BD-101"])
    expect(find("villas")).toEqual(["BD-101", "BD-103"])
  })

  test("codes match exactly, with or without the dash", () => {
    const withLongCode = [...designs, { ...pool, code: "BD-1010" }]
    const byCode = (query: string) => filterDesigns(withLongCode, categories, { query }).map((d) => d.code)
    expect(byCode("BD-101")).toEqual(["BD-101"])
    expect(byCode("bd101")).toEqual(["BD-101"])
    expect(byCode("bd 1010")).toEqual(["BD-1010"])
    expect(byCode("BD-999")).toEqual([])
  })

  test("words match the start of a word; single letters are ignored", () => {
    expect(find("on")).toEqual([])
    expect(find("tern")).toEqual([]) // inside "modern", not at its start
    expect(find("a")).toEqual(["BD-101", "BD-103", "BD-502"])
    expect(find("ا")).toEqual(["BD-101", "BD-103", "BD-502"])
    expect(find("mod")).toEqual(["BD-101"])
  })

  test("normalization", () => {
    expect(normalizeForSearch("  Café — VILLA!! ")).toBe("cafe villa")
    expect(normalizeForSearch("أإآٱ")).toBe("اااا")
    expect(normalizeForSearch("مـــسبح")).toBe("مسبح")
  })
})

describe("contactMessage", () => {
  const design = { title: "فيلا عصرية بمسبح", code: "BD-101", url: "https://app.bonyanec.com/designs/modern-villa-pool" }

  test("design messages carry the name, code and link", () => {
    expect(contactMessage("same", "ar", design)).toBe(
      "مرحباً، أريد تصميماً بطابع «فيلا عصرية بمسبح» (BD-101).\nhttps://app.bonyanec.com/designs/modern-villa-pool",
    )
    expect(contactMessage("question", "en", { ...design, title: "Modern villa with pool" })).toBe(
      'Hello, I have a question about the "Modern villa with pool" design (BD-101).\nhttps://app.bonyanec.com/designs/modern-villa-pool',
    )
  })

  test("without a design, design messages fall back to the general one", () => {
    expect(contactMessage("modified", "ar")).toBe("مرحباً، أرغب بالتواصل بخصوص معرض التصاميم.")
    expect(contactMessage("idea", "en")).toContain("different design")
  })
})
