import Link from "next/link"
import { CalendarDays, ChevronRight } from "lucide-react"
import type { DashboardUpcomingSiteVisits } from "@/lib/db/domain"

function formatCalendarDate(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return dateKey
  const [, year, month, day] = match
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)))
}

type UpcomingPreferredTime = NonNullable<DashboardUpcomingSiteVisits["nextVisit"]>["preferredTime"]

function formatScheduledTime(
  scheduledTime: string | null,
  preferredTime: UpcomingPreferredTime,
) {
  if (scheduledTime) {
    const match = /^(\d{1,2}):(\d{2})/.exec(scheduledTime.trim())
    if (match) {
      const hour = Number(match[1])
      const minute = Number(match[2])
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const period = hour >= 12 ? "PM" : "AM"
        const displayHour = hour % 12 || 12
        return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`
      }
    }
  }

  if (preferredTime === "morning") return "Morning"
  if (preferredTime === "afternoon") return "Afternoon"
  if (preferredTime === "any_time") return "Any Time"
  return "Time not set"
}

export function UpcomingSiteVisitsCard({ data }: { data: DashboardUpcomingSiteVisits }) {
  const nextVisit = data.nextVisit

  return (
    <div className="flex h-full min-h-[17rem] flex-col rounded-xl border border-border bg-card p-5 lg:min-h-0">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
          <CalendarDays className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Upcoming Site Visits</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Scheduled visits from today onward</p>
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col justify-center">
        <div>
          <p className="text-3xl font-semibold leading-none tabular-nums text-foreground">{data.count}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">Upcoming Visits</p>
        </div>

        {nextVisit ? (
          <div className="mt-5 border-t border-border/70 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next Visit</p>
            <p className="mt-2 truncate text-sm font-semibold text-foreground" title={nextVisit.projectName}>
              {nextVisit.projectName}
            </p>
            {nextVisit.projectCode ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={nextVisit.projectCode}>
                {nextVisit.projectCode}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-foreground">
              {formatCalendarDate(nextVisit.scheduledDate)}
              <span className="px-1.5 text-muted-foreground">•</span>
              {formatScheduledTime(nextVisit.scheduledTime, nextVisit.preferredTime)}
            </p>
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">No upcoming site visits scheduled.</p>
        )}
      </div>

      <Link
        href="/site-visits"
        className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-primary hover:underline"
      >
        View all Site Visits
        <ChevronRight className="size-4 flip-rtl" />
      </Link>
    </div>
  )
}
