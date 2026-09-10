"use client"

import Link from "next/link"
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  FileText,
  User,
  Users,
  ExternalLink,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type {
  ComplianceCalendarWeek,
  CompliancePeriodStatus,
  ComplianceReportItem,
  ProjectComplianceTimelineRow,
  ProjectWeeklyCell,
} from "@/lib/supervisor-performance/types"
import { ComplianceStatusBadge } from "./compliance-status-badge"

function formatFrequencyLabel(type: string | null): string {
  if (!type) return "Not Set"
  const clean = type.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
  if (clean === "monthly2") return "Monthly 2 (2 visits/month)"
  if (clean === "monthly3") return "Monthly 3 (3 visits/month)"
  if (clean === "monthly4") return "Monthly 4 (4 visits/month)"
  return type
}

function formatShortDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr
  const [, monthStr, dayStr] = dateStr.slice(0, 10).split("-")
  const monthIndex = parseInt(monthStr, 10) - 1
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[monthIndex]} ${parseInt(dayStr, 10)}`
}

export type ComplianceCellDetailDialogProps = {
  isOpen: boolean
  onClose: () => void
  project: ProjectComplianceTimelineRow
  week: ComplianceCalendarWeek
  cell: ProjectWeeklyCell | undefined
}

export function ComplianceCellDetailDialog({
  isOpen,
  onClose,
  project,
  week,
  cell,
}: ComplianceCellDetailDialogProps) {
  const reports = cell?.actualReports || []
  const requiredVisits = cell?.requiredVisits ?? 0
  const completedVisits = cell?.completedVisits ?? reports.length
  const status: CompliancePeriodStatus = cell?.status ?? "not_applicable"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-5">
        {/* Header: Weekly Visit Compliance */}
        <DialogHeader className="gap-1.5 border-b pb-3.5 text-left">
          {/* Row 1: Frequency badge (with right padding to prevent close button overlap) */}
          <div className="flex items-center justify-between pr-8">
            <Badge variant="secondary" className="text-xs font-medium">
              {formatFrequencyLabel(project.normalizedSupervisionType || project.supervisionType)}
            </Badge>
          </div>

          {/* Row 2: Project Name */}
          <DialogTitle className="text-base font-bold text-foreground leading-snug">
            {project.projectName}
          </DialogTitle>

          {/* Row 3: Week Date Range */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono">{week.label}</span>
          </div>
          <DialogDescription className="sr-only">
            Weekly Visit Compliance for {project.projectName} during {week.label}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2 text-sm">
          {/* Section 1: Weekly Compliance Summary */}
          <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-3.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Week Compliance
              </span>
              <ComplianceStatusBadge
                status={status}
                requiredVisits={requiredVisits}
                actualVisits={completedVisits}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 border-t pt-2.5 text-xs">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Required visits</span>
                <span className="text-sm font-bold text-foreground">
                  {requiredVisits} visit{requiredVisits !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Completed visits</span>
                <span className="text-sm font-bold text-foreground">
                  {completedVisits} visit{completedVisits !== 1 ? "s" : ""}
                  {completedVisits > requiredVisits && requiredVisits > 0 && (
                    <span className="ml-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      (+{completedVisits - requiredVisits} extra)
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Assigned Supervisors */}
          <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span>Assigned Supervisors</span>
            </div>
            {project.supervisors.length === 0 ? (
              <span className="text-xs italic text-amber-600 dark:text-amber-400">
                No supervisor assigned
              </span>
            ) : (
              <div className="flex flex-wrap gap-2 pt-0.5">
                {project.supervisors.map((sup) => (
                  <span
                    key={sup.id}
                    className="inline-flex items-center gap-1.5 rounded bg-background px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-border"
                  >
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span>{sup.name}</span>
                    {sup.isPrimary && (
                      <span className="text-[10px] text-muted-foreground font-normal">(Primary)</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Inspection Reports Conducted During This Week */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Inspection Reports ({reports.length})
              </span>
            </div>

            {reports.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                {status === "missing" ? (
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    No inspection report was submitted for this week.
                  </span>
                ) : status === "upcoming" ? (
                  <span className="text-sky-600 dark:text-sky-400">
                    Inspection visit is due during this week.
                  </span>
                ) : (
                  "No inspection reports recorded for this week."
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {reports.map((report, idx) => {
                  const reportHref =
                    report.href ||
                    (report.stageId
                      ? `/projects/${report.projectId}/stages/${report.stageId}/reports/${report.id}`
                      : `/projects/${report.projectId}`)
                  return (
                    <Link
                      key={report.id}
                      href={reportHref}
                      className="group flex flex-col gap-1 rounded-lg border bg-muted/20 p-2.5 text-xs transition-all hover:bg-muted/50 hover:border-primary/40 hover:shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-semibold text-foreground group-hover:text-primary transition-colors min-w-0">
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">{report.reportTitle || `Inspection Report #${idx + 1}`}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                        {report.visitNumber && (
                          <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                            Visit #{report.visitNumber}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-border/50 pt-1 text-[11px] text-muted-foreground">
                        <span>
                          Report Date: <strong className="font-mono text-foreground">{report.visitDate}</strong>
                        </span>
                        {report.creatorName && (
                          <span>By {report.creatorName}</span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
