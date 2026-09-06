"use client"

import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  FileText,
  User,
  Users,
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
  CompliancePeriod,
  ComplianceReportItem,
  ProjectComplianceTimelineRow,
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

function formatPeriodDateRange(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return ""
  const [sYear, sMonth, sDay] = startDate.split("-").map(Number)
  const [eYear, eMonth, eDay] = endDate.split("-").map(Number)

  const sDate = new Date(Date.UTC(sYear, sMonth - 1, sDay))
  const eDate = new Date(Date.UTC(eYear, eMonth - 1, eDay))

  const sMonthName = sDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
  const eMonthName = eDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })

  if (sMonthName === eMonthName) {
    return `${sMonthName} ${sDay} – ${eDay}, ${sYear}`
  }
  return `${sMonthName} ${sDay} – ${eMonthName} ${eDay}, ${sYear}`
}

export type ComplianceCellDetailDialogProps = {
  isOpen: boolean
  onClose: () => void
  project: ProjectComplianceTimelineRow
  week: ComplianceCalendarWeek
  overlappingPeriods: CompliancePeriod[]
  actualReports: ComplianceReportItem[]
}

export function ComplianceCellDetailDialog({
  isOpen,
  onClose,
  project,
  week,
  overlappingPeriods,
  actualReports,
}: ComplianceCellDetailDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-5">
        <DialogHeader className="gap-1 border-b pb-3">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary" className="text-xs font-medium">
              {formatFrequencyLabel(project.normalizedSupervisionType || project.supervisionType)}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">{week.label}</span>
          </div>
          <DialogTitle className="text-base font-bold text-foreground">
            {project.projectName}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Visit Compliance &amp; Period Breakdown
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2 text-sm">
          {/* Assigned Supervisors */}
          <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span>Assigned Supervisors</span>
            </div>
            {project.supervisors.length === 0 ? (
              <span className="text-xs italic text-amber-600 dark:text-amber-400">
                No supervisor assigned
              </span>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {project.supervisors.map((sup) => (
                  <span
                    key={sup.id}
                    className="inline-flex items-center gap-1 rounded bg-background px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-border"
                  >
                    <User className="h-3 w-3 text-muted-foreground" />
                    {sup.name}
                    {sup.isPrimary && (
                      <span className="text-[10px] text-muted-foreground font-normal">(Primary)</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Active Requirement Periods */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Active Requirement Period{overlappingPeriods.length > 1 ? "s" : ""}
            </span>

            {overlappingPeriods.length === 0 ? (
              <div className="rounded-md border p-3 text-center text-xs text-muted-foreground">
                No requirement period applies to this week.
              </div>
            ) : (
              overlappingPeriods.map((period) => (
                <div
                  key={period.id}
                  className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-foreground">
                        Period {period.periodIndex} ({period.monthKey})
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatPeriodDateRange(period.startDate, period.endDate)}
                      </span>
                    </div>

                    <ComplianceStatusBadge
                      status={period.status}
                      requiredVisits={period.requiredVisits}
                      actualVisits={period.actualVisits}
                    />
                  </div>

                  <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                    <span>Required: {period.requiredVisits} visit</span>
                    <span className="font-semibold text-foreground">
                      Completed: {period.actualVisits} visit{period.actualVisits !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Actual Reports Conducted During Week */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Actual Inspection Reports ({actualReports.length})
            </span>

            {actualReports.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                No inspection reports submitted during this week.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {actualReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 p-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {report.reportTitle || "Inspection Report"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Date: <strong className="font-mono text-foreground">{report.visitDate}</strong>
                          {report.creatorName ? ` • By ${report.creatorName}` : ""}
                        </span>
                      </div>
                    </div>

                    {report.visitNumber && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        Visit #{report.visitNumber}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
