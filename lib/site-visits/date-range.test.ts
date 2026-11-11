import { describe, expect, it } from "vitest"
import { resolveSiteVisitDateRange, SITE_VISIT_PRESET_OPTIONS } from "./date-range"

describe("resolveSiteVisitDateRange", () => {
  const mockNow = new Date("2026-11-11T12:00:00Z") // 2026-11-11

  it("includes yesterday, last 3 days, and last 7 days in preset options", () => {
    const values = SITE_VISIT_PRESET_OPTIONS.map((o) => o.value)
    expect(values).toContain("yesterday")
    expect(values).toContain("last3")
    expect(values).toContain("last7")

    const yesterdayOption = SITE_VISIT_PRESET_OPTIONS.find((o) => o.value === "yesterday")
    expect(yesterdayOption?.label).toBe("Yesterday")

    const last3Option = SITE_VISIT_PRESET_OPTIONS.find((o) => o.value === "last3")
    expect(last3Option?.label).toBe("Last 3 Days")

    const last7Option = SITE_VISIT_PRESET_OPTIONS.find((o) => o.value === "last7")
    expect(last7Option?.label).toBe("Last 7 Days")
  })

  it("resolves 'yesterday' correctly", () => {
    const result = resolveSiteVisitDateRange({ range: "yesterday" }, mockNow)
    expect(result.preset).toBe("yesterday")
    expect(result.startDate).toBe("2026-11-10")
    expect(result.endDate).toBe("2026-11-10")
    expect(result.label).toBe("Yesterday")
  })

  it("resolves 'last3' correctly", () => {
    const result = resolveSiteVisitDateRange({ range: "last3" }, mockNow)
    expect(result.preset).toBe("last3")
    expect(result.startDate).toBe("2026-11-08")
    expect(result.endDate).toBe("2026-11-11")
    expect(result.label).toBe("Last 3 Days")
  })

  it("resolves 'last3days' alias correctly", () => {
    const result = resolveSiteVisitDateRange({ range: "last3Days" }, mockNow)
    expect(result.preset).toBe("last3")
    expect(result.startDate).toBe("2026-11-08")
    expect(result.endDate).toBe("2026-11-11")
  })

  it("resolves 'last7' correctly", () => {
    const result = resolveSiteVisitDateRange({ range: "last7" }, mockNow)
    expect(result.preset).toBe("last7")
    expect(result.startDate).toBe("2026-11-04")
    expect(result.endDate).toBe("2026-11-11")
    expect(result.label).toBe("Last 7 Days")
  })

  it("resolves 'last7days' alias correctly", () => {
    const result = resolveSiteVisitDateRange({ range: "last7Days" }, mockNow)
    expect(result.preset).toBe("last7")
    expect(result.startDate).toBe("2026-11-04")
    expect(result.endDate).toBe("2026-11-11")
  })

  it("preserves existing presets: today, tomorrow, next7, next30, thisMonth", () => {
    const today = resolveSiteVisitDateRange({ range: "today" }, mockNow)
    expect(today.startDate).toBe("2026-11-11")
    expect(today.endDate).toBe("2026-11-11")

    const tomorrow = resolveSiteVisitDateRange({ range: "tomorrow" }, mockNow)
    expect(tomorrow.startDate).toBe("2026-11-12")
    expect(tomorrow.endDate).toBe("2026-11-12")

    const next7 = resolveSiteVisitDateRange({ range: "next7" }, mockNow)
    expect(next7.startDate).toBe("2026-11-11")
    expect(next7.endDate).toBe("2026-11-18")

    const next30 = resolveSiteVisitDateRange({ range: "next30" }, mockNow)
    expect(next30.startDate).toBe("2026-11-11")
    expect(next30.endDate).toBe("2026-12-11")
  })
})
