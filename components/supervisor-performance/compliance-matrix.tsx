"use client"

import { Calendar, FolderKanban, FilterX, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  ComplianceCalendarWeek,
  ProjectComplianceTimelineRow,
} from "@/lib/supervisor-performance/types"
import { ComplianceProjectRow } from "./compliance-project-row"

export type ComplianceMatrixProps = {
  weeks: ComplianceCalendarWeek[]
  projects: ProjectComplianceTimelineRow[]
  isFiltered?: boolean
  onResetFilters?: () => void
  onPrevWeek?: () => void
  onNextWeek?: () => void
  className?: string
}

export function ComplianceMatrix({
  weeks,
  projects,
  isFiltered = false,
  onResetFilters,
  onPrevWeek,
  onNextWeek,
  className,
}: ComplianceMatrixProps) {
  if (projects.length === 0) {
    if (isFiltered) {
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center bg-card">
          <FilterX className="h-10 w-10 text-muted-foreground/40" />
          <h3 className="mt-3 text-sm font-semibold text-foreground">No Matching Projects Found</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            No projects match the active filter criteria. Try adjusting your supervisor, frequency, or compliance status selection.
          </p>
          {onResetFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResetFilters}
              className="mt-4 h-8 gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Filters</span>
            </Button>
          )}
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <FolderKanban className="h-10 w-10 text-muted-foreground/40" />
        <h3 className="mt-3 text-sm font-semibold text-foreground">No Supervised Projects Found</h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          There are no projects matching the current organization or tracking criteria.
        </p>
      </div>
    )
  }

  return (
    <div className={cn("relative w-full overflow-hidden rounded-lg border bg-card shadow-xs", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          {/* Matrix Header */}
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-semibold text-muted-foreground">
              {/* Sticky Left Column Header */}
              <th className="sticky left-0 z-20 min-w-[280px] max-w-[320px] border-r bg-muted/80 p-3.5 backdrop-blur-xs">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-foreground/70" />
                  <span>Project / Supervisor</span>
                </div>
              </th>

              {/* Sunday -> Saturday Week Headers with Circular Navigation Arrows */}
              {weeks.map((week, idx) => (
                <th
                  key={week.weekKey}
                  className={cn(
                    "min-w-[140px] max-w-[180px] border-r p-2.5 text-center transition-colors",
                    week.isCurrentWeek && "bg-primary/10 text-primary font-bold dark:bg-primary/20",
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    {idx === 0 && onPrevWeek ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          onPrevWeek()
                        }}
                        className="h-6 w-6 rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-2xs hover:bg-muted hover:text-foreground shrink-0 transition-transform active:scale-95"
                        title="Shift timeline 1 week backward"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      idx === 0 && <span className="w-6 shrink-0" />
                    )}

                    <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1 truncate">
                        <Calendar className="h-3 w-3 shrink-0 opacity-60" />
                        <span className="whitespace-nowrap">{week.label}</span>
                      </div>
                      {week.isCurrentWeek && (
                        <span className="rounded-full bg-primary px-1.5 py-0.2 text-[9px] font-semibold text-primary-foreground">
                          Current Week
                        </span>
                      )}
                    </div>

                    {idx === weeks.length - 1 && onNextWeek ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          onNextWeek()
                        }}
                        className="h-6 w-6 rounded-full border border-border/80 bg-background/90 text-muted-foreground shadow-2xs hover:bg-muted hover:text-foreground shrink-0 transition-transform active:scale-95"
                        title="Shift timeline 1 week forward"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      idx === weeks.length - 1 && <span className="w-6 shrink-0" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Matrix Body */}
          <tbody className="divide-y">
            {/* Summary Row */}
            <tr className="border-b-2 border-border/80 bg-muted/30 font-medium transition-colors hover:bg-muted/40">
              {/* Sticky Summary Label */}
              <td className="sticky left-0 z-10 min-w-[280px] max-w-[320px] border-r bg-muted/60 p-3 shadow-xs backdrop-blur-xs">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                    <span>Week Summary</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Aggregated for {projects.length} project{projects.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </td>

              {/* Weekly Aggregated Totals */}
              {weeks.map((week) => {
                let totalRequired = 0
                let totalCompleted = 0
                let totalMissing = 0
                let totalExtra = 0

                for (const project of projects) {
                  const cell = project.weeklyCells[week.weekKey]
                  if (cell) {
                    totalRequired += cell.requiredVisits || 0
                    totalCompleted += cell.completedVisits || 0
                    if (cell.status === "missing") {
                      totalMissing += Math.max(1, (cell.requiredVisits || 1) - (cell.completedVisits || 0))
                    } else if (cell.status === "extra") {
                      totalExtra += Math.max(1, (cell.completedVisits || 0) - (cell.requiredVisits || 0))
                    }
                  }
                }

                return (
                  <td
                    key={week.weekKey}
                    className={cn(
                      "min-w-[140px] max-w-[180px] border-r p-2.5 text-xs align-top transition-colors",
                      week.isCurrentWeek && "bg-primary/5 dark:bg-primary/10",
                    )}
                  >
                    <div className="flex flex-col gap-1 rounded bg-background/60 p-1.5 ring-1 ring-border/50 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Required</span>
                        <strong className="font-mono text-foreground font-semibold">
                          {totalRequired}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">Done</span>
                        <strong className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                          {totalCompleted}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          totalMissing > 0 ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-muted-foreground",
                        )}>
                          Missing
                        </span>
                        <strong className={cn(
                          "font-mono font-semibold",
                          totalMissing > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
                        )}>
                          {totalMissing}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          totalExtra > 0 ? "text-amber-700 dark:text-amber-400 font-semibold" : "text-muted-foreground",
                        )}>
                          Extra
                        </span>
                        <strong className={cn(
                          "font-mono font-semibold",
                          totalExtra > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                        )}>
                          {totalExtra}
                        </strong>
                      </div>
                    </div>
                  </td>
                )
              })}
            </tr>

            {projects.map((projectRow) => (
              <ComplianceProjectRow
                key={projectRow.projectId}
                row={projectRow}
                weeks={weeks}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
