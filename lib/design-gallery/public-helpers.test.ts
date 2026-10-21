import { describe, expect, test } from "vitest"
import { contactMessage } from "./contact"
import { galleryHref, parsePublicLocale } from "./public-locale"
import { filterDesigns, normalizeForSearch } from "./search"
import { pickPublicSite } from "./site"

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

  test("a custom host wins, ignoring case, port and trailing dot", () => {
    expect(pickPublicSite([bonyan, other], "designs.other.com:443", "bonyan")).toBe(other)
    expect(pickPublicSite([bonyan, other], "DESIGNS.OTHER.COM.", "bonyan")).toBe(other)
  })

  test("other hosts use the configured default site", () => {
    expect(pickPublicSite([bonyan, other], "app.bonyanec.com", "bonyan")).toBe(bonyan)
    expect(pickPublicSite([bonyan, other], "app.bonyanec.com", "missing")).toBeNull()
  })

  test("without a default, only a single enabled site is used", () => {
    expect(pickPublicSite([bonyan], "localhost:3000", null)).toBe(bonyan)
    expect(pickPublicSite([bonyan, other], "localhost:3000", null)).toBeNull()
    expect(pickPublicSite([], "localhost:3000", "bonyan")).toBeNull()
  })

  test("a lookalike host does not match a custom host", () => {
    expect(pickPublicSite([bonyan, other], "designs.other.com.evil.com", null)).toBeNull()
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
