"use client"

import { CalendarCheck2, ChevronRight } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { supervisionTypeLabel } from "@/lib/projects/project-options"
import type { DashboardVisitCompliance } from "@/lib/db/domain"
import { cn } from "@/lib/utils"

function formatCalendarDate(value: string | null) {
  if (!value) return "None"
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}

function urgencyLabel(project: DashboardVisitCompliance["projects"][number]) {
  if (project.state === "overdue") {
    const days = project.daysOverdue ?? 0
    return `${days} ${days === 1 ? "day" : "days"} overdue`
  }
  if (project.state === "due_today") return "Due today"
  const days = project.daysRemaining ?? 0
  return `Due in ${days} ${days === 1 ? "day" : "days"}`
}

const urgencyClass = {
  overdue: "text-red-600 dark:text-red-400",
  due_today: "text-amber-600 dark:text-amber-400",
  due_soon: "text-yellow-700 dark:text-yellow-400",
} as const

export function VisitComplianceCard({ compliance }: { compliance: DashboardVisitCompliance }) {
  const hasAttention = compliance.overdueCount + compliance.dueTodayCount + compliance.dueSoonCount > 0

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="group w-full rounded-xl border border-border bg-card px-5 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        }
      >
        <div className="flex min-h-[3.5rem] flex-col justify-center gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
              <CalendarCheck2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Visit Compliance</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {hasAttention ? "Recurring visit deadlines requiring attention" : "All recurring site visits are on track"}
              </p>
            </div>
          </div>

          {hasAttention ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:justify-end">
              <span className="font-medium text-red-600 dark:text-red-400">
                <strong className="text-sm tabular-nums">{compliance.overdueCount}</strong> Overdue
              </span>
              <span className="font-medium text-amber-600 dark:text-amber-400">
                <strong className="text-sm tabular-nums">{compliance.dueTodayCount}</strong> Due Today
              </span>
              <span className="font-medium text-yellow-700 dark:text-yellow-400">
                <strong className="text-sm tabular-nums">{compliance.dueSoonCount}</strong> Due Soon
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-primary group-hover:underline">
                View Details <ChevronRight className="size-3.5" />
              </span>
            </div>
          ) : (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">On track</span>
          )}
        </div>
      </DialogTrigger>

      <DialogContent className="flex max-h-[min(82dvh,700px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[42rem]">
        <DialogHeader className="border-b px-5 py-4 pe-12">
          <DialogTitle className="text-base font-semibold">Visit Compliance</DialogTitle>
          <DialogDescription>
            Active Monthly 2, Monthly 3, and Monthly 4 projects requiring attention.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {compliance.projects.length ? (
            <ul className="divide-y divide-border/70">
              {compliance.projects.map((project) => (
                <li key={project.projectId} className="py-3 first:pt-2 last:pb-2">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={project.projectName}>
                      {project.projectName}
                    </p>
                    <span className={cn("shrink-0 text-xs font-semibold", urgencyClass[project.state])}>
                      {urgencyLabel(project)}
                    </span>
                  </div>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">{project.projectCode || "—"}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {supervisionTypeLabel(project.supervisionType)} • {project.supervisorName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Last Visit: {formatCalendarDate(project.lastCompletedVisitDate)} • Next Due: {formatCalendarDate(project.nextRequiredVisitDate)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-8 text-sm">
              <p className="font-medium text-emerald-600 dark:text-emerald-400">All recurring site visits are on track</p>
              <p className="mt-1 text-muted-foreground">No active recurring-supervision projects currently require attention.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
