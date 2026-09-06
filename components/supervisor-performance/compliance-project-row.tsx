"use client"

import { Building2, User, Users, Check, AlertTriangle, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  ComplianceCalendarWeek,
  ProjectComplianceTimelineRow,
} from "@/lib/supervisor-performance/types"
import { ComplianceWeekCell } from "./compliance-week-cell"

function formatFrequencyLabel(type: string | null): string {
  if (!type) return "Not Set"
  const clean = type.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
  if (clean === "monthly2") return "Monthly 2 (2/mo)"
  if (clean === "monthly3") return "Monthly 3 (3/mo)"
  if (clean === "monthly4") return "Monthly 4 (4/mo)"
  return type
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || "SV"
}

export type ComplianceProjectRowProps = {
  row: ProjectComplianceTimelineRow
  weeks: ComplianceCalendarWeek[]
  className?: string
}

export function ComplianceProjectRow({
  row,
  weeks,
  className,
}: ComplianceProjectRowProps) {
  const {
    projectName,
    projectCode,
    normalizedSupervisionType,
    supervisionType,
    supervisors,
    periods,
    weeklyCells,
  } = row

  // Calculate high-level compliance summary across the active periods
  const applicablePeriods = periods.filter((p) => p.status !== "not_applicable")
  const doneCount = applicablePeriods.filter((p) => p.status === "done" || p.status === "extra").length
  const missedCount = applicablePeriods.filter((p) => p.status === "missing").length
  const upcomingCount = applicablePeriods.filter((p) => p.status === "upcoming").length

  return (
    <tr className={cn("group transition-colors hover:bg-muted/20", className)}>
      {/* Left Sticky Column: Project & Supervisor Info + Executive Summary */}
      <td className="sticky left-0 z-10 min-w-[280px] max-w-[320px] border-b border-r bg-background p-3.5 shadow-xs transition-colors group-hover:bg-muted/10">
        <div className="flex flex-col gap-2">
          {/* Project Title & Code & Frequency Badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="font-semibold text-sm text-foreground line-clamp-1" title={projectName}>
                {projectName}
              </span>
              {projectCode && projectCode !== "N/A" && (
                <span className="font-mono text-[11px] text-muted-foreground">{projectCode}</span>
              )}
            </div>

            {/* Frequency Badge */}
            {normalizedSupervisionType ? (
              <Badge variant="secondary" className="shrink-0 text-[10px] font-medium">
                {formatFrequencyLabel(normalizedSupervisionType)}
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                {supervisionType || "Untracked"}
              </Badge>
            )}
          </div>

          {/* Assigned Supervisors List */}
          <div className="flex flex-col gap-1">
            {supervisors.length === 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span className="italic">No supervisor assigned</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {supervisors.map((sup) => {
                  const initials = getInitials(sup.name)
                  return (
                    <div key={sup.id} className="flex items-center gap-2">
                      {sup.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={sup.avatarUrl}
                          alt={sup.name}
                          className="h-5 w-5 rounded-full object-cover ring-1 ring-border"
                        />
                      ) : (
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                          {initials}
                        </div>
                      )}
                      <span
                        className="text-xs text-foreground line-clamp-1"
                        title={`${sup.name}${sup.isPrimary ? " (Primary)" : ""}`}
                      >
                        {sup.name}
                        {sup.isPrimary && (
                          <span className="ml-1 text-[10px] text-muted-foreground font-normal">(Primary)</span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Project Management Status Summary */}
          {applicablePeriods.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t pt-1.5 text-[11px]">
              {doneCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 font-medium">
                  <Check className="h-3 w-3 stroke-[2.5]" />
                  <span>{doneCount} Done</span>
                </span>
              )}
              {missedCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-rose-700 dark:text-rose-400 font-bold">
                  <AlertTriangle className="h-3 w-3 stroke-[2.5]" />
                  <span>{missedCount} Missed</span>
                </span>
              )}
              {upcomingCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-sky-700 dark:text-sky-400 font-medium">
                  <Clock className="h-3 w-3" />
                  <span>{upcomingCount} Due</span>
                </span>
              )}
            </div>
          )}
        </div>
      </td>

      {/* Right Matrix Columns: Calendar Weeks */}
      {weeks.map((week) => {
        const cell = weeklyCells[week.weekKey]
        return (
          <ComplianceWeekCell
            key={week.weekKey}
            project={row}
            week={week}
            cell={cell}
            isCurrentWeek={week.isCurrentWeek}
          />
        )
      })}
    </tr>
  )
}
