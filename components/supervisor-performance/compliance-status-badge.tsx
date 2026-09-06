"use client"

import { Check, AlertCircle, Clock, AlertTriangle, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CompliancePeriodStatus } from "@/lib/supervisor-performance/types"

export type ComplianceStatusBadgeProps = {
  status: CompliancePeriodStatus
  requiredVisits?: number
  actualVisits?: number
  compact?: boolean
  className?: string
}

export function ComplianceStatusBadge({
  status,
  requiredVisits = 1,
  actualVisits = 0,
  compact = false,
  className,
}: ComplianceStatusBadgeProps) {
  switch (status) {
    case "done":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300",
            compact && "px-1.5 py-0.5 text-[11px]",
            className,
          )}
          title={`Done (${actualVisits}/${requiredVisits} visits completed)`}
        >
          <Check className="h-3 w-3 shrink-0 stroke-[2.5]" />
          <span>{compact ? `${actualVisits}/${requiredVisits}` : "Completed"}</span>
        </span>
      )

    case "missing":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
            compact && "px-1.5 py-0.5 text-[11px]",
            className,
          )}
          title={`Missing requirement: 0 of ${requiredVisits} visits conducted before period ended`}
        >
          <AlertTriangle className="h-3 w-3 shrink-0 stroke-[2.5]" />
          <span>{compact ? "Missing" : "Missing (0/1)"}</span>
        </span>
      )

    case "upcoming":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300",
            compact && "px-1.5 py-0.5 text-[11px]",
            className,
          )}
          title={`Upcoming requirement: ${requiredVisits} visit required before period ends`}
        >
          <Clock className="h-3 w-3 shrink-0" />
          <span>{compact ? "Upcoming" : "Upcoming (Due)"}</span>
        </span>
      )

    case "extra":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
            compact && "px-1.5 py-0.5 text-[11px]",
            className,
          )}
          title={`Extra visits: ${actualVisits} visits conducted (${requiredVisits} required)`}
        >
          <AlertCircle className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{compact ? `${actualVisits}/${requiredVisits}` : `Extra (${actualVisits}/${requiredVisits})`}</span>
        </span>
      )

    case "not_applicable":
    default:
      return (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs text-muted-foreground/60",
            compact && "text-[11px]",
            className,
          )}
          title="Not applicable / exempt for this period"
        >
          <Minus className="h-3 w-3" />
        </span>
      )
  }
}
