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
