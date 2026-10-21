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

/**
 * Designs in the given category (by key) whose text contains every word of
 * the query, in either language. An empty query or "all" category keeps all.
 */
export function filterDesigns<T extends SearchableDesign>(
  designs: readonly T[],
  categories: readonly SearchableCategory[],
  options: { query?: string | null; categoryKey?: string | null },
): T[] {
  const category = options.categoryKey ? categories.find((c) => c.key === options.categoryKey) : null
  const inCategory = options.categoryKey && options.categoryKey !== "all"
    ? designs.filter((design) => category && design.categoryId === category.id)
    : [...designs]

  const words = normalizeForSearch(options.query ?? "").split(" ").filter(Boolean)
  if (!words.length) return inCategory

  const categoryText = new Map(categories.map((c) => [c.id, `${c.nameAr} ${c.nameEn}`]))
  return inCategory.filter((design) => {
    const haystack = normalizeForSearch(
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
    return words.every((word) => haystack.includes(word))
  })
}
