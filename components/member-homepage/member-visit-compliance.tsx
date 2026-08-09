"use client"

import Link from "next/link"
import { AlertTriangle, CalendarCheck2, ChevronRight } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { MemberHomepageVisitCompliance, MemberHomepageVisitComplianceProject } from "@/lib/member-homepage/types"
import { supervisionTypeLabel } from "@/lib/projects/project-options"
import { cn } from "@/lib/utils"

const urgencyTextClass = {
  overdue: "text-red-600 dark:text-red-400",
  due_today: "text-amber-600 dark:text-amber-400",
  due_soon: "text-yellow-700 dark:text-yellow-400",
} as const

const urgencyDotClass = {
  overdue: "bg-red-500",
  due_today: "bg-amber-500",
  due_soon: "bg-yellow-500",
} as const

function formatCalendarDate(value: string | null, includeYear = false) {
  if (!value) return "None"
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(date)
}

function urgencyLabel(project: MemberHomepageVisitComplianceProject) {
  if (project.state === "overdue") {
    const days = project.daysOverdue ?? 0
    return `${days} ${days === 1 ? "day" : "days"} overdue`
  }
  if (project.state === "due_today") return "Due today"
  const days = project.daysRemaining ?? 0
  return `Due in ${days} ${days === 1 ? "day" : "days"}`
}

function ComplianceRow({ project, detailed = false }: { project: MemberHomepageVisitComplianceProject; detailed?: boolean }) {
  return (
    <Link
      href={`/projects/${encodeURIComponent(project.projectId)}`}
      className="group block min-w-0 px-3 py-2 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-3.5"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", urgencyDotClass[project.state])} aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-4 text-foreground sm:text-sm" title={project.projectName}>
          {project.projectName}
        </p>
        <span className={cn("shrink-0 text-[10px] font-semibold leading-4 sm:text-xs", urgencyTextClass[project.state])}>
          {urgencyLabel(project)}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>

      <p className="mt-0.5 min-w-0 truncate pl-4 text-[10px] leading-4 text-muted-foreground sm:text-xs">
        {supervisionTypeLabel(project.supervisionType)} • Next visit due {formatCalendarDate(project.nextRequiredVisitDate)}
      </p>

      {detailed ? (
        <div className="mt-1 space-y-0.5 pl-4 text-[10px] leading-4 text-muted-foreground sm:text-xs">
          {project.projectCode ? (
            <p className="break-words [overflow-wrap:anywhere]">{project.projectCode}</p>
          ) : null}
          <p>
            Last visit: {formatCalendarDate(project.lastCompletedVisitDate, true)} • Next required: {formatCalendarDate(project.nextRequiredVisitDate, true)}
          </p>
        </div>
      ) : null}
    </Link>
  )
}

export function MemberVisitCompliance({
  compliance,
  hasError = false,
}: {
  compliance: MemberHomepageVisitCompliance
  hasError?: boolean
}) {
  if (!hasError && compliance.eligibleProjectCount === 0) return null

  const visibleProjects = compliance.projects.slice(0, 3)
  const hiddenCount = Math.max(0, compliance.projects.length - visibleProjects.length)

  return (
    <section className="space-y-2.5" aria-labelledby="member-visit-compliance-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarCheck2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <h2 id="member-visit-compliance-title" className="text-base font-semibold tracking-tight sm:text-lg">Visit Compliance</h2>
        </div>

        {hiddenCount > 0 ? (
          <Dialog>
            <DialogTrigger
              render={
                <button
                  type="button"
                  className="shrink-0 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-xs"
                />
              }
            >
              + {hiddenCount} more
            </DialogTrigger>
            <DialogContent className="flex max-h-[min(82dvh,680px)] w-[calc(100%_-_1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
              <DialogHeader className="border-b px-4 py-3.5 pe-12">
                <DialogTitle className="text-base font-semibold">Visit Compliance</DialogTitle>
                <DialogDescription>Recurring site visits requiring your attention.</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="divide-y divide-border/70">
                  {compliance.projects.map((project) => (
                    <ComplianceRow key={project.projectId} project={project} detailed />
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {hasError ? (
        <div className="flex min-h-14 items-center gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-destructive">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-medium sm:text-sm">Unable to load visit compliance</p>
            <p className="text-[10px] leading-4 text-destructive/80 sm:text-xs">Please refresh and try again.</p>
          </div>
        </div>
      ) : compliance.projects.length ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="divide-y divide-border/70">
            {visibleProjects.map((project) => (
              <ComplianceRow key={project.projectId} project={project} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-12 items-center gap-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-3 py-2.5 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
          <CalendarCheck2 className="size-4 shrink-0" aria-hidden="true" />
          <p className="text-xs font-medium sm:text-sm">All recurring site visits are on track</p>
        </div>
      )}
    </section>
  )
}
