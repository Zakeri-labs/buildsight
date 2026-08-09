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
  const hasEligibleProjects = compliance.eligibleProjectCount > 0
  const attentionCount = compliance.overdueCount + compliance.dueTodayCount + compliance.dueSoonCount
  const hasAttention = attentionCount > 0

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="group flex h-full min-h-[17rem] w-full flex-col rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:min-h-0"
          />
        }
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <CalendarCheck2 className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Visit Compliance</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Recurring site visit deadlines</p>
          </div>
        </div>

        <div className="mt-5 flex flex-1 flex-col justify-center">
          {hasAttention ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-red-600 dark:text-red-400">Overdue</span>
                <strong className="tabular-nums text-red-600 dark:text-red-400">{compliance.overdueCount}</strong>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-amber-600 dark:text-amber-400">Due Today</span>
                <strong className="tabular-nums text-amber-600 dark:text-amber-400">{compliance.dueTodayCount}</strong>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-yellow-700 dark:text-yellow-400">Due Soon</span>
                <strong className="tabular-nums text-yellow-700 dark:text-yellow-400">{compliance.dueSoonCount}</strong>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                {attentionCount} {attentionCount === 1 ? "project requires" : "projects require"} attention
              </p>
            </div>
          ) : hasEligibleProjects ? (
            <div className="py-4">
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                All recurring site visits are on track
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                No recurring-supervision projects currently require attention.
              </p>
            </div>
          ) : (
            <div className="py-4">
              <p className="text-sm font-medium text-foreground">No recurring supervision projects found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No active Monthly 2, Monthly 3, or Monthly 4 projects are available in the current Project scope.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-primary">
          <span>View Details</span>
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 flip-rtl" />
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
              {hasEligibleProjects ? (
                <>
                  <p className="font-medium text-emerald-600 dark:text-emerald-400">All recurring site visits are on track</p>
                  <p className="mt-1 text-muted-foreground">No active recurring-supervision projects currently require attention.</p>
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">No recurring supervision projects found</p>
                  <p className="mt-1 text-muted-foreground">No active Monthly 2, Monthly 3, or Monthly 4 projects are available in the current Project scope.</p>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
