import { currentCalendarDateKey } from "@/lib/calendar/date"
import type { SiteVisitPreferredTime } from "@/lib/site-visits/types"

export function preferredTimeLabel(value: SiteVisitPreferredTime) {
  if (value === "morning") return "Morning"
  if (value === "afternoon") return "Afternoon"
  return "Any Time"
}

export function preferredVisitLabel(input: {
  isAsap: boolean
  preferredDate: string | null
  preferredTime?: SiteVisitPreferredTime
}) {
  const visit = input.isAsap ? "ASAP" : input.preferredDate || "Date not set"
  return input.preferredTime ? `${visit} · ${preferredTimeLabel(input.preferredTime)}` : visit
}

export function siteVisitRequestCode(id: string) {
  return `SV-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

export function localDateInputValue(date = new Date()) {
  return currentCalendarDateKey(date)
}
