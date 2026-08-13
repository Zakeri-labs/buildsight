import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { APPLICATION_TIME_ZONE } from "@/lib/calendar/date"
import type { RecentSupervisorReportRow } from "@/lib/db/domain"

function formatSubmission(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { date: "—", time: "—" }

  return {
    date: new Intl.DateTimeFormat("en-GB", {
      timeZone: APPLICATION_TIME_ZONE,
      day: "2-digit",
      month: "short",
    }).format(date),
    time: new Intl.DateTimeFormat("en-US", {
      timeZone: APPLICATION_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date),
  }
}

export function RecentSupervisorReportsCard({
  reports,
}: {
  reports: RecentSupervisorReportRow[]
}) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Recent Supervisor Reports</h2>

      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-start overflow-y-auto">
        {reports.length ? (
          <ul className="divide-y divide-border/70">
            {reports.map((report) => {
              const submitted = formatSubmission(report.submittedAt)
              return (
                <li key={report.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <Link
                      href={report.href}
                      title={report.reportTitle}
                      className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
                    >
                      {report.reportTitle}
                    </Link>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {submitted.time}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 truncate text-xs text-muted-foreground"
                    title={`${report.projectName} • ${report.supervisorName} • ${submitted.date}`}
                  >
                    {report.projectName} • {report.supervisorName} • {submitted.date}
                  </p>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="py-6 text-sm">
            <p className="font-medium text-foreground">No recent supervisor reports</p>
            <p className="mt-1 text-muted-foreground">No reports were submitted in the selected period.</p>
          </div>
        )}
      </div>

      <Link
        href="/reports"
        className="mt-3 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-primary hover:underline"
      >
        View all reports
        <ChevronRight className="size-4 flip-rtl" />
      </Link>
    </div>
  )
}
