"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { APPLICATION_TIME_ZONE } from "@/lib/calendar/date"
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

export function CompletedVisitsBySupervisorCard({
  supervisors,
  dateRangeLabel,
}: {
  supervisors: SupervisorCompletedVisitSummary[]
  dateRangeLabel: string
}) {
  const maxCompletedVisitCount = supervisors.reduce(
    (max, item) => Math.max(max, item.completedVisitCount),
    0,
  )

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Completed Visits by Supervisor</h2>

      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center">
        {supervisors.length ? (
          <ul className="divide-y divide-border/70">
            {supervisors.map((supervisor) => {
              const relativeWidth =
                maxCompletedVisitCount > 0
                  ? Math.max(0, Math.min(100, (supervisor.completedVisitCount / maxCompletedVisitCount) * 100))
                  : 0

              return (
                <li key={supervisor.supervisorId} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline gap-3 text-sm">
                    <Dialog>
                      <DialogTrigger
                        render={
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left font-medium text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                                const metadata = [visit.stageName, completed.date, completed.time]
                                  .filter(Boolean)
                                  .join(" • ")

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
                                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={metadata}>
                                      {metadata}
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
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">
                      {supervisor.completedVisitCount}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="w-[74px] shrink-0 text-xs text-muted-foreground">
                      {supervisor.projectCount} {supervisor.projectCount === 1 ? "Project" : "Projects"}
                    </span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
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
            <p className="font-medium text-foreground">No completed visits</p>
            <p className="mt-1 text-muted-foreground">
              No completed site visits were recorded for the selected scope.
            </p>
          </div>
        )}
      </div>

      <Link
        href="/site-visits"
        className="mt-3 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-primary hover:underline"
      >
        View all Site Visits
        <ChevronRight className="size-4 flip-rtl" />
      </Link>
    </div>
  )
}
