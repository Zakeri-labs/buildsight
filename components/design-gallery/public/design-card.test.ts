import { expect, test } from "vitest"
import { formatNumber, specLine } from "./design-card"
import type { Design } from "@/lib/design-gallery/types"

const design = {
  floorsAr: "سطح + 2",
  floorsEn: "Roof + 2",
  builtAreaSqm: 12000,
  summaryAr: "ملخص",
  summaryEn: "Summary",
} as Design

test("spec line uses Western digits and isolates each part for mixed-direction text", () => {
  expect(specLine(design, "en")).toBe("⁨Roof + 2⁩ · ⁨≈ 12,000 m²⁩")
  expect(specLine(design, "ar")).toBe("⁨سطح + 2⁩ · ⁨≈ 12,000 م²⁩")
})

test("without floors or area the summary is shown", () => {
  expect(specLine({ ...design, floorsAr: null, builtAreaSqm: null } as Design, "ar")).toBe("ملخص")
})

test("numbers keep up to 2 decimals", () => {
  expect(formatNumber(520.5)).toBe("520.5")
  expect(formatNumber(5)).toBe("5")
})
