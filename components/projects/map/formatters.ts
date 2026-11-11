/**
 * Formats a metric distance into human-readable meters or kilometers.
 */
export function formatDistance(meters: number, isArabic: boolean): string {
  if (!Number.isFinite(meters) || meters <= 0) return `0 ${isArabic ? "م" : "m"}`
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} ${isArabic ? "كم" : "km"}`
  }
  return `${Math.round(meters)} ${isArabic ? "م" : "m"}`
}

/**
 * Formats a square meters area into human-readable m² or km².
 */
export function formatArea(sqMeters: number, isArabic: boolean): string {
  if (!Number.isFinite(sqMeters) || sqMeters <= 0) return `0 ${isArabic ? "م²" : "m²"}`
  if (sqMeters >= 1_000_000) {
    return `${(sqMeters / 1_000_000).toFixed(2)} ${isArabic ? "كم²" : "km²"}`
  }
  return `${Math.round(sqMeters).toLocaleString()} ${isArabic ? "م²" : "m²"}`
}
