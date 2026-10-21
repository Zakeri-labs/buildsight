import { describe, expect, test } from "vitest"
import {
  cleanText,
  normalizeDesignCode,
  normalizeWhatsappPhone,
  slugify,
  toAsciiDigits,
  validateDesignInput,
  validateSiteInput,
} from "./validation"

const CATEGORY = "3f0c8a52-6a0e-4c7e-9b8a-1d2e3f4a5b6c"
const OTHER_CATEGORY = "11111111-2222-4333-8444-555555555555"

const valid = {
  categoryId: CATEGORY,
  titleAr: "فيلا عصرية بمسبح",
  titleEn: "Modern villa with pool",
  code: "bd 101",
  builtAreaSqm: "520",
  bedrooms: "5",
  isBookable: "on",
}

describe("toAsciiDigits", () => {
  test("converts Arabic-Indic and Persian digits and the Arabic decimal separator", () => {
    expect(toAsciiDigits("٥٢٠٫٥")).toBe("520.5")
    expect(toAsciiDigits("۵۲۰")).toBe("520")
    expect(toAsciiDigits("١٬٢٠٠")).toBe("1,200")
  })
})

describe("slugify", () => {
  test("makes a lower-case hyphenated ASCII slug", () => {
    expect(slugify("  Modern Villa — with POOL!  ")).toBe("modern-villa-with-pool")
    expect(slugify("Villa ٥")).toBe("villa-5")
  })

  test("returns empty for Arabic-only text, which has no ASCII form", () => {
    expect(slugify("فيلا عصرية")).toBe("")
  })
})

describe("normalizeDesignCode / normalizeWhatsappPhone", () => {
  test("codes are upper-case with hyphens", () => {
    expect(normalizeDesignCode(" bd_101 ")).toBe("BD-101")
    expect(normalizeDesignCode("bd  ١٠٢")).toBe("BD-102")
  })

  test("phones keep digits only and drop a leading 00", () => {
    expect(normalizeWhatsappPhone("+968 9411 4511")).toBe("96894114511")
    expect(normalizeWhatsappPhone("00968-9411-4511")).toBe("96894114511")
    expect(normalizeWhatsappPhone("٩٦٨٩٤١١٤٥١١")).toBe("96894114511")
  })
})

describe("validateDesignInput", () => {
  test("accepts a complete design and normalizes it", () => {
    const result = validateDesignInput(valid, [CATEGORY])
    expect(result).toMatchObject({
      ok: true,
      value: {
        slug: "modern-villa-with-pool",
        code: "BD-101",
        builtAreaSqm: 520,
        bedrooms: 5,
        isBookable: true,
        sortOrder: 0,
        summaryAr: null,
      },
    })
  })

  test("accepts Arabic digits in numbers", () => {
    const result = validateDesignInput({ ...valid, builtAreaSqm: "٥٢٠٫٥", bedrooms: "۴" }, [CATEGORY])
    expect(result).toMatchObject({ ok: true, value: { builtAreaSqm: 520.5, bedrooms: 4 } })
  })

  test("an explicit slug wins over the English title", () => {
    const result = validateDesignInput({ ...valid, slug: "Pool Villa 2" }, [CATEGORY])
    expect(result).toMatchObject({ ok: true, value: { slug: "pool-villa-2" } })
  })

  test("requires both titles, a category and a code", () => {
    const result = validateDesignInput({ titleAr: " ", titleEn: "" }, [CATEGORY])
    expect(result).toEqual({
      ok: false,
      errors: { titleAr: "required", titleEn: "required", categoryId: "required", slug: "required", code: "required" },
    })
  })

  test("rejects a category of another organization", () => {
    const result = validateDesignInput({ ...valid, categoryId: OTHER_CATEGORY }, [CATEGORY])
    expect(result).toEqual({ ok: false, errors: { categoryId: "invalidCategory" } })
  })

  test("rejects an Arabic-only slug instead of silently replacing it", () => {
    const result = validateDesignInput({ ...valid, slug: "فيلا" }, [CATEGORY])
    expect(result).toEqual({ ok: false, errors: { slug: "invalidSlug" } })
  })

  test("rejects numbers that are not numbers or out of range", () => {
    expect(validateDesignInput({ ...valid, builtAreaSqm: "about 500" }, [CATEGORY])).toEqual({
      ok: false,
      errors: { builtAreaSqm: "invalidNumber" },
    })
    expect(validateDesignInput({ ...valid, builtAreaSqm: "0" }, [CATEGORY])).toEqual({
      ok: false,
      errors: { builtAreaSqm: "outOfRange" },
    })
    expect(validateDesignInput({ ...valid, bedrooms: "2.5" }, [CATEGORY])).toEqual({
      ok: false,
      errors: { bedrooms: "invalidNumber" },
    })
    expect(validateDesignInput({ ...valid, bedrooms: "51" }, [CATEGORY])).toEqual({
      ok: false,
      errors: { bedrooms: "outOfRange" },
    })
  })

  test("empty optional numbers stay empty", () => {
    const result = validateDesignInput({ ...valid, builtAreaSqm: "", bedrooms: "" }, [CATEGORY])
    expect(result).toMatchObject({ ok: true, value: { builtAreaSqm: null, bedrooms: null } })
  })

  test("rejects text that is too long", () => {
    const result = validateDesignInput({ ...valid, summaryEn: "x".repeat(201), code: "A".repeat(21) }, [CATEGORY])
    expect(result).toEqual({ ok: false, errors: { summaryEn: "tooLong", code: "tooLong" } })
  })

  test("rejects codes with characters outside A-Z, 0-9 and hyphens", () => {
    expect(validateDesignInput({ ...valid, code: "BD/101" }, [CATEGORY])).toEqual({
      ok: false,
      errors: { code: "invalidCode" },
    })
  })

  test("isBookable is false unless explicitly set", () => {
    const { isBookable: _ignored, ...rest } = valid
    expect(validateDesignInput(rest, [CATEGORY])).toMatchObject({ ok: true, value: { isBookable: false } })
  })
})

describe("validateSiteInput", () => {
  test("normalizes the WhatsApp number", () => {
    expect(validateSiteInput({ isEnabled: "on", whatsappPhone: "+968 9411 4511" })).toEqual({
      ok: true,
      value: { isEnabled: true, displayNameAr: null, displayNameEn: null, whatsappPhone: "96894114511" },
    })
  })

  test("rejects a phone number that is too short or has no digits", () => {
    expect(validateSiteInput({ whatsappPhone: "12345" })).toEqual({ ok: false, errors: { whatsappPhone: "invalidPhone" } })
    expect(validateSiteInput({ whatsappPhone: "call me" })).toEqual({ ok: false, errors: { whatsappPhone: "invalidPhone" } })
  })

  test("an empty phone is allowed", () => {
    expect(validateSiteInput({ whatsappPhone: "" })).toMatchObject({ ok: true, value: { whatsappPhone: null } })
  })
})

describe("input from real keyboards", () => {
  test("invisible characters are removed; a title made only of them is empty", () => {
    expect(cleanText("\u200f٥٢٠\u200e ")).toBe("٥٢٠")
    expect(cleanText("فيلا\u202e عصرية")).toBe("فيلا عصرية")
    expect(cleanText("line one\nline two")).toBe("line one\nline two")
    expect(validateDesignInput({ ...valid, titleAr: "\u200b\u200f" }, [CATEGORY])).toEqual({
      ok: false,
      errors: { titleAr: "required" },
    })
  })

  test("a unit typed after the area is accepted", () => {
    for (const area of ["520 م²", "520m2", "520 m²", "٥٢٠ متر", "520 sqm", "\u200f٥٢٠\u200f"]) {
      expect(validateDesignInput({ ...valid, builtAreaSqm: area }, [CATEGORY]), area).toMatchObject({
        ok: true,
        value: { builtAreaSqm: 520 },
      })
    }
  })

  test("a comma is accepted only as a thousands separator", () => {
    expect(validateDesignInput({ ...valid, builtAreaSqm: "1,200" }, [CATEGORY])).toMatchObject({ ok: true, value: { builtAreaSqm: 1200 } })
    expect(validateDesignInput({ ...valid, builtAreaSqm: "1,5" }, [CATEGORY])).toEqual({ ok: false, errors: { builtAreaSqm: "invalidNumber" } })
    expect(validateDesignInput({ ...valid, builtAreaSqm: "12,00" }, [CATEGORY])).toEqual({ ok: false, errors: { builtAreaSqm: "invalidNumber" } })
  })

  test("an area that rounds to zero at 2 decimals is out of range, not a database error", () => {
    expect(validateDesignInput({ ...valid, builtAreaSqm: "0.004" }, [CATEGORY])).toEqual({ ok: false, errors: { builtAreaSqm: "outOfRange" } })
    expect(validateDesignInput({ ...valid, builtAreaSqm: "0.005" }, [CATEGORY])).toMatchObject({ ok: true, value: { builtAreaSqm: 0.01 } })
  })

  test("order must be 0 to 100000 whether it arrives as text or as a number", () => {
    for (const sortOrder of [-5, "-5", -3_000_000_000, 100_001]) {
      expect(validateDesignInput({ ...valid, sortOrder }, [CATEGORY]).ok, String(sortOrder)).toBe(false)
    }
    expect(validateDesignInput({ ...valid, sortOrder: 7 }, [CATEGORY])).toMatchObject({ ok: true, value: { sortOrder: 7 } })
  })

  test("codes accept en dashes and Arabic digits", () => {
    expect(normalizeDesignCode("BD–101")).toBe("BD-101")
    expect(normalizeDesignCode("bd—١٠١")).toBe("BD-101")
  })

  test("an emoji counts as one character", () => {
    expect(validateDesignInput({ ...valid, slug: "home", titleEn: "🏠".repeat(61) }, [CATEGORY]).ok).toBe(true)
    expect(validateDesignInput({ ...valid, slug: "home", titleEn: "🏠".repeat(121) }, [CATEGORY])).toMatchObject({ ok: false, errors: { titleEn: "tooLong" } })
  })

  test("a phone number with words in it is rejected, not merged into one number", () => {
    expect(validateSiteInput({ whatsappPhone: "+968 9411 4511 ext 22" })).toEqual({ ok: false, errors: { whatsappPhone: "invalidPhone" } })
    expect(validateSiteInput({ whatsappPhone: "٩٦٨٩٤١١٤٥١١ تحويلة ٢" })).toEqual({ ok: false, errors: { whatsappPhone: "invalidPhone" } })
  })
})
