"use client"

import { FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ProjectWeeklyCell } from "@/lib/supervisor-performance/types"
import { ComplianceStatusBadge } from "./compliance-status-badge"

function formatShortDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr
  const [, monthStr, dayStr] = dateStr.slice(0, 10).split("-")
  const monthIndex = parseInt(monthStr, 10) - 1
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[monthIndex]} ${parseInt(dayStr, 10)}`
}

export type ComplianceWeekCellProps = {
  cell: ProjectWeeklyCell | undefined
  isCurrentWeek?: boolean
  className?: string
}

export function ComplianceWeekCell({
  cell,
  isCurrentWeek = false,
  className,
}: ComplianceWeekCellProps) {
  if (!cell) {
    return (
      <td
        className={cn(
          "h-20 min-w-[140px] border-b border-r p-2 text-center text-xs text-muted-foreground/50",
          isCurrentWeek && "bg-primary/5",
          className,
        )}
      >
        —
      </td>
    )
  }

  const { overlappingPeriods, actualReports, primaryStatus } = cell
  const hasVisits = actualReports.length > 0

  return (
    <td
      className={cn(
        "h-20 min-w-[140px] max-w-[180px] border-b border-r p-2 align-top transition-colors hover:bg-muted/40",
        isCurrentWeek && "bg-primary/5 dark:bg-primary/10",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        {/* Period Requirement Status */}
        {overlappingPeriods.length === 0 ? (
          <span className="text-xs text-muted-foreground/40">—</span>
        ) : overlappingPeriods.length === 1 ? (
          <div className="flex items-center justify-start">
            <ComplianceStatusBadge
              status={overlappingPeriods[0].status}
              requiredVisits={overlappingPeriods[0].requiredVisits}
              actualVisits={overlappingPeriods[0].actualVisits}
              compact
            />
          </div>
        ) : (
          // Multi-period boundary crossing week: show each overlapping period badge
          <div className="flex flex-col gap-1">
            {overlappingPeriods.map((period) => (
              <div key={period.id} className="flex items-center justify-between gap-1 text-[10px]">
                <span className="font-medium text-muted-foreground">P{period.periodIndex}:</span>
                <ComplianceStatusBadge
                  status={period.status}
                  requiredVisits={period.requiredVisits}
                  actualVisits={period.actualVisits}
                  compact
                />
              </div>
            ))}
          </div>
        )}

        {/* Actual Visits conducted during this Sunday -> Saturday week */}
        {hasVisits && (
          <div className="mt-0.5 flex flex-col gap-1 rounded bg-muted/60 p-1 text-[11px] text-foreground dark:bg-muted/30">
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
                  title={`${report.reportTitle || "Inspection Report"}${report.creatorName ? ` by ${report.creatorName}` : ""}`}
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
  )
}
