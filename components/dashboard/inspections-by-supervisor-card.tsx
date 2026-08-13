"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { APPLICATION_TIME_ZONE } from "@/lib/calendar/date"
import { DonutChart } from "@/components/dashboard/donut-chart"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export type SupervisorCompletedVisitDetail = {
  id: string
  projectId: string
  projectName: string
  projectCode: string | null
  visitNumber: number | null
  stageName: string | null
  completedAt: string
}

export type SupervisorCompletedVisitSummary = {
  supervisorId: string
  name: string
  completedVisitCount: number
  totalVisitCount?: number
  projectCount: number
  visits: SupervisorCompletedVisitDetail[]
}

function formatCompletedAt(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { date: "—", time: "—" }

  return {
    date: new Intl.DateTimeFormat("en-GB", {
      timeZone: APPLICATION_TIME_ZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("en-US", {
      timeZone: APPLICATION_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date),
  }
}

function visitNumberLabel(value: number | null) {
  return value && value > 0 ? `Visit ${String(value).padStart(3, "0")}` : "Completed Visit"
}

function SupervisorVisitDialog({
  supervisor,
  dateRangeLabel,
}: {
  supervisor: SupervisorCompletedVisitSummary
  dateRangeLabel: string
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="min-w-0 truncate text-left font-medium text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        }
      >
        {supervisor.name}
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(82dvh,680px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[38rem]">
        <DialogHeader className="border-b px-5 py-4 pe-12">
          <DialogTitle className="text-base font-semibold">
            Completed Visits — {supervisor.name}
          </DialogTitle>
          <DialogDescription className="space-y-0.5">
            <span className="block">
              {supervisor.completedVisitCount} {supervisor.completedVisitCount === 1 ? "Completed Visit" : "Completed Visits"}
              {" • "}
              {supervisor.projectCount} {supervisor.projectCount === 1 ? "Project" : "Projects"}
            </span>
            <span className="block">{dateRangeLabel}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {supervisor.visits.length ? (
            <ul className="divide-y divide-border/70">
              {supervisor.visits.map((visit) => {
                const completed = formatCompletedAt(visit.completedAt)
                const secondary = [
                  visit.projectCode,
                  visit.stageName,
                  completed.date,
                  completed.time,
                ].filter(Boolean).join(" • ")

                return (
                  <li key={visit.id} className="py-3 first:pt-2 last:pb-2">
                    <div className="flex min-w-0 items-baseline gap-3">
                      <p
                        className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
                        title={visit.projectName}
                      >
                        {visit.projectName}
                      </p>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
                        {visitNumberLabel(visit.visitNumber)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={secondary}>
                      {secondary || "Completed visit"}
                    </p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="py-8 text-sm text-muted-foreground">
              No completed visits found for this Supervisor in the selected scope.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CompletedVisitsBySupervisorCard({
  supervisors,
  completion,
  dateRangeLabel,
}: {
  supervisors: SupervisorCompletedVisitSummary[]
  completion: { completed: number; scheduled: number }
  dateRangeLabel: string
}) {
  const completed = Math.max(0, completion.completed)
  const scheduled = Math.max(0, completion.scheduled)
  const total = completed + scheduled
  const completionPercent = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-[33%_minmax(0,1fr)] sm:gap-4">
        <section className="border-b border-border/70 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
          <h2 className="text-base font-semibold text-foreground">Visit Completion</h2>

          <div className="mt-4 flex flex-col items-center">
            <div className="flex size-[136px] items-center justify-center rounded-full bg-muted/20 ring-1 ring-border/45">
              <DonutChart
                size={112}
                strokeWidth={15}
                total={total}
                segments={[
                  { value: completed, color: "var(--success)" },
                  { value: scheduled, color: "var(--info)" },
                ]}
                centerTop={
                  <span className="text-[17px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                    {completed} of {total}
                  </span>
                }
                centerBottom={
                  <span className="mt-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                    {completionPercent}%
                  </span>
                }
              />
            </div>

            <div className="mt-4 w-full max-w-[172px] space-y-1.5 text-xs">
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-muted-foreground">Completed</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{completed}</span>
              </div>
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                <span className="size-2.5 shrink-0 rounded-full bg-info" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-muted-foreground">Scheduled</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{scheduled}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <h2 className="text-base font-semibold text-foreground">Completed Visits by Supervisor</h2>

          <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center">
            {completed === 0 ? (
              <div className="py-6 text-sm">
                <p className="font-medium text-foreground">No completed visits</p>
                <p className="mt-1 text-muted-foreground">
                  No completed site visits were recorded for the selected scope.
                </p>
              </div>
            ) : supervisors.length ? (
              <ul className="divide-y divide-border/70">
                {supervisors.map((supervisor) => {
                  const supervisorTotal =
                    supervisor.totalVisitCount && supervisor.totalVisitCount > 0
                      ? supervisor.totalVisitCount
                      : supervisor.completedVisitCount
                  const relativeWidth =
                    supervisorTotal > 0
                      ? Math.max(
                          0,
                          Math.min(
                            100,
                            Math.round((supervisor.completedVisitCount / supervisorTotal) * 100),
                          ),
                        )
                      : 0

                  return (
                    <li key={supervisor.supervisorId} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <SupervisorVisitDialog supervisor={supervisor} dateRangeLabel={dateRangeLabel} />
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                          {supervisor.completedVisitCount} of {supervisorTotal}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="w-[66px] shrink-0 text-xs text-muted-foreground">
                          {supervisor.projectCount} {supervisor.projectCount === 1 ? "Project" : "Projects"}
                        </span>
                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/70">
                          <div
                            className="h-full rounded-full bg-primary transition-[width]"
                            style={{ width: `${relativeWidth}%` }}
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="py-6 text-sm">
                <p className="font-medium text-foreground">Completed visits found</p>
                <p className="mt-1 text-muted-foreground">
                  No assigned Supervisor data is available for the completed visits in this scope.
                </p>
              </div>
            )}
          </div>
        </section>
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
