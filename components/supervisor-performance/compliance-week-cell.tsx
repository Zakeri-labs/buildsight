"use client"

import { useState } from "react"
import { Check, AlertTriangle, Clock, AlertCircle, FileText, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  ComplianceCalendarWeek,
  ProjectComplianceTimelineRow,
  ProjectWeeklyCell,
} from "@/lib/supervisor-performance/types"
import { ComplianceCellDetailDialog } from "./compliance-cell-detail-dialog"

function formatShortDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr
  const [, monthStr, dayStr] = dateStr.slice(0, 10).split("-")
  const monthIndex = parseInt(monthStr, 10) - 1
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[monthIndex]} ${parseInt(dayStr, 10)}`
}

export type ComplianceWeekCellProps = {
  project: ProjectComplianceTimelineRow
  week: ComplianceCalendarWeek
  cell: ProjectWeeklyCell | undefined
  isCurrentWeek?: boolean
  className?: string
}

export function ComplianceWeekCell({
  project,
  week,
  cell,
  isCurrentWeek = false,
  className,
}: ComplianceWeekCellProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  if (!cell) {
    return (
      <td
        className={cn(
          "h-24 min-w-[150px] border-b border-r p-2.5 text-center text-xs text-muted-foreground/50",
          isCurrentWeek && "bg-primary/5",
          className,
        )}
      >
        —
      </td>
    )
  }

  const { status, requiredVisits, completedVisits, actualReports } = cell
  const hasVisits = actualReports.length > 0

  return (
    <>
      <td
        onClick={() => setIsDialogOpen(true)}
        className={cn(
          "group relative h-24 min-w-[150px] max-w-[190px] cursor-pointer border-b border-r p-2.5 align-top transition-all hover:ring-2 hover:ring-primary/40 hover:z-10",
          isCurrentWeek && "bg-primary/5 dark:bg-primary/10",
          status === "missing" && "bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50",
          className,
        )}
        title="Click to view weekly visit compliance details"
      >
        <div className="flex flex-col gap-1.5">
          {/* Main Weekly Compliance State */}
          {status === "done" && (
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex w-fit items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Check className="h-3 w-3 stroke-[2.5]" />
                <span>Completed</span>
              </span>
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                Required: {requiredVisits} • Done: {completedVisits}
              </span>
            </div>
          )}

          {status === "missing" && (
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex w-fit items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
                <AlertTriangle className="h-3 w-3 stroke-[2.5]" />
                <span>Missing</span>
              </span>
              <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                Required: {requiredVisits} • Done: {completedVisits}
              </span>
              <span className="text-[10px] font-medium text-rose-600/80 dark:text-rose-400/80">
                Action required
              </span>
            </div>
          )}

          {status === "upcoming" && (
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex w-fit items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300">
                <Clock className="h-3 w-3" />
                <span>Upcoming</span>
              </span>
              <span className="text-[11px] font-medium text-sky-700 dark:text-sky-300">
                {requiredVisits} visit required
              </span>
              <span className="text-[10px] text-muted-foreground">
                Due this week
              </span>
            </div>
          )}

          {status === "extra" && (
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex w-fit items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <span>Extra</span>
              </span>
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Required: {requiredVisits} • Done: {completedVisits}
              </span>
            </div>
          )}

          {status === "not_applicable" && (
            <div className="flex items-center justify-center py-2 text-muted-foreground/40">
              <Minus className="h-4 w-4" />
            </div>
          )}

          {/* Actual Visit Chips with Dates */}
          {hasVisits && (
            <div className="mt-0.5 flex flex-col gap-1 rounded bg-muted/60 p-1.5 text-[11px] text-foreground dark:bg-muted/30">
              <div className="flex items-center gap-1 font-semibold text-muted-foreground">
                <FileText className="h-3 w-3 text-primary shrink-0" />
                <span>
                  {actualReports.length} visit{actualReports.length > 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                {actualReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground"
                  >
                    <span className="font-mono text-foreground font-medium">
                      {formatShortDate(report.visitDate)}
                    </span>
                    {report.visitNumber && (
                      <span className="rounded bg-background px-1 py-0.2 text-[9px] font-medium text-muted-foreground ring-1 ring-border">
                        #{report.visitNumber}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </td>

      {/* Weekly Compliance Detail Dialog on Click */}
      <ComplianceCellDetailDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        project={project}
        week={week}
        cell={cell}
      />
    </>
  )
}
