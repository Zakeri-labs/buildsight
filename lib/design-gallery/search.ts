import { toAsciiDigits } from "./validation"

type SearchableDesign = {
  categoryId: string
  code: string
  titleAr: string
  titleEn: string
  summaryAr: string | null
  summaryEn: string | null
  descriptionAr: string | null
  descriptionEn: string | null
  floorsAr: string | null
  floorsEn: string | null
  serviceAr: string | null
  serviceEn: string | null
}

type SearchableCategory = { id: string; key: string; nameAr: string; nameEn: string }

/**
 * Folds text so that what visitors type matches how designs are written:
 * Arabic diacritics and tatweel removed, alef/hamza forms, ta marbuta, alef
 * maqsura and Persian ی/ک unified, Arabic and Persian digits made ASCII,
 * Latin lower-cased without accents.
 */
export function normalizeForSearch(value: string): string {
  return toAsciiDigits(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىی]/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

// "الفيلا", "بالفيلا", "والمسبح", "للمسبح" → the word itself.
const ARABIC_ARTICLE = /^(?:وال|بال|فال|كال|لل|ال)(?=\p{L}{2})/u

// One attached letter: "بمسبح", "وملاعب", "لفيلا".
const ARABIC_ATTACHED = /^[وبفكل](?=\p{L}{3})/u

/**
 * Comparable forms of a folded word: the Arabic article (ال، بال، وال…) or
 * one attached letter (ب، و، ف، ك، ل) removed, and simple English plurals.
 * Both the query and the design text go through this, so "بالمسبح",
 * "بمسبح" and "مسبح" meet.
 */
export function searchStems(word: string): string[] {
  if (/^\p{Script=Arabic}+$/u.test(word)) {
    const withoutArticle = word.replace(ARABIC_ARTICLE, "")
    return Array.from(new Set([word, withoutArticle, word.replace(ARABIC_ATTACHED, "")]))
  }
  if (/^[a-z]+$/.test(word) && word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return [word.slice(0, -1)]
  return [word]
}

/** Letters+digits of a design code, e.g. "BD-101" / "bd 101" / "bd101" → "bd101". */
function compactCode(value: string): string {
  return normalizeForSearch(value).replace(/\s+/g, "")
}

// A code typed in the search box: 1–4 letters then digits, with or without a dash or space.
const CODE_IN_QUERY = /(?:^|\s)([a-z]{1,4})[\s-]?(\d{1,6})(?=\s|$)/gi

/**
 * Designs in the given category (by key) that match the query, in either
 * language. Each word of 2+ characters must start a word of the design's text
 * (so "on" does not match "complex"); a design code must match exactly
 * (BD-101 is not BD-1010). An empty query or the "all" category keeps everything.
 */
export function filterDesigns<T extends SearchableDesign>(
  designs: readonly T[],
  categories: readonly SearchableCategory[],
  options: { query?: string | null; categoryKey?: string | null },
): T[] {
  const category = options.categoryKey ? categories.find((c) => c.key === options.categoryKey) : null
  const inCategory =
    options.categoryKey && options.categoryKey !== "all"
      ? designs.filter((design) => category && design.categoryId === category.id)
      : [...designs]

  let query = toAsciiDigits(options.query ?? "")
  const codes: string[] = []
  query = query.replace(CODE_IN_QUERY, (_match, letters: string, digits: string) => {
    codes.push(`${letters}${digits}`.toLowerCase())
    return " "
  })
  const words = normalizeForSearch(query)
    .split(" ")
    .filter((word) => Array.from(word).length >= 2)
    .map(searchStems)
  if (!words.length && !codes.length) return inCategory

  const categoryText = new Map(categories.map((c) => [c.id, `${c.nameAr} ${c.nameEn}`]))
  return inCategory.filter((design) => {
    if (codes.length && !codes.every((code) => compactCode(design.code) === code)) return false
    if (!words.length) return true
    const textWords = normalizeForSearch(
      [
        design.code,
        design.titleAr,
        design.titleEn,
        design.summaryAr,
        design.summaryEn,
        design.descriptionAr,
        design.descriptionEn,
        design.floorsAr,
        design.floorsEn,
        design.serviceAr,
        design.serviceEn,
        categoryText.get(design.categoryId),
      ]
        .filter(Boolean)
        .join(" "),
    )
      .split(" ")
      .flatMap(searchStems)
    return words.every((forms) => forms.some((form) => textWords.some((textWord) => textWord.startsWith(form))))
  })
}
