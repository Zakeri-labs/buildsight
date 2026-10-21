import { expect, test } from "vitest"
import { dictionaries } from "@/lib/i18n/dictionaries"

function shape(value: unknown): unknown {
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]).sort())
  }
  return typeof value
}

test("design gallery texts exist in both Arabic and English with the same keys", () => {
  expect(shape(dictionaries.ar.designGallery)).toEqual(shape(dictionaries.en.designGallery))
  expect(shape(dictionaries.ar.designGalleryPublic)).toEqual(shape(dictionaries.en.designGalleryPublic))
  expect(dictionaries.ar.nav.designGallery).toBe("معرض التصاميم")
  expect(dictionaries.en.nav.designGallery).toBe("Design Gallery")
})

test("every action error and field error code has a translation", () => {
  const codes = [
    "required", "tooLong", "invalidSlug", "invalidCode", "invalidNumber", "outOfRange", "invalidCategory",
    "invalidPhone", "invalidUrl", "taken", "forbidden", "notFound", "stale", "invalid", "needsImage", "invalidImage", "uploadFailed", "failed",
  ]
  for (const locale of ["en", "ar"] as const) {
    for (const code of codes) {
      expect(dictionaries[locale].designGallery.errors[code as keyof typeof dictionaries.en.designGallery.errors]).toBeTruthy()
    }
  }
})
