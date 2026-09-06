"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardCheck,
  FolderKanban,
  Info,
  TrendingUp,
  UserCheck,
  Users,
  AlertCircle,
  Check,
  AlertTriangle,
  Plus,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  SupervisorPerformanceData,
  SupervisorVisitComplianceDashboardData,
  PerformancePeriod,
} from "@/lib/supervisor-performance/types"
import {
  formatMonthLabel,
  getAdjacentMonth,
  getAdjacentDateRange,
} from "@/lib/supervisor-performance/compliance"
import { SupervisorVisitComplianceDashboard } from "./supervisor-visit-compliance-dashboard"

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || "SV"
}

export function SupervisorPerformanceView({
  data,
  complianceData,
  selectedMonth,
}: {
  data: SupervisorPerformanceData
  complianceData?: SupervisorVisitComplianceDashboardData
  selectedMonth?: string
}) {
  const router = useRouter()
  const { organizationSummary, supervisors } = data

  const period: PerformancePeriod = useMemo(() => {
    if (data.period) return data.period
    const m = selectedMonth || data.month || new Date().toISOString().slice(0, 7)
    return {
      mode: "month",
      month: m,
      startDate: `${m}-01`,
      endDate: `${m}-31`,
      label: formatMonthLabel(m),
    }
  }, [data.period, data.month, selectedMonth])

  // Custom date range dialog state
  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(period.startDate || "")
  const [customTo, setCustomTo] = useState(period.endDate || "")
  const [customError, setCustomError] = useState<string | null>(null)

  useEffect(() => {
    setCustomFrom(period.startDate || "")
    setCustomTo(period.endDate || "")
  }, [period.startDate, period.endDate])

  const handlePrevPeriod = () => {
    if (period.mode === "month") {
      const targetMonth = period.month || selectedMonth || data.month
      const prev = getAdjacentMonth(targetMonth, -1)
      router.push(`/supervisor-performance?month=${encodeURIComponent(prev)}`)
    } else {
      const { startDate: prevStart, endDate: prevEnd } = getAdjacentDateRange(
        period.startDate,
        period.endDate,
        -1,
      )
      router.push(
        `/supervisor-performance?from=${encodeURIComponent(prevStart)}&to=${encodeURIComponent(prevEnd)}`,
      )
    }
  }

  const handleNextPeriod = () => {
    if (period.mode === "month") {
      const targetMonth = period.month || selectedMonth || data.month
      const next = getAdjacentMonth(targetMonth, 1)
      router.push(`/supervisor-performance?month=${encodeURIComponent(next)}`)
    } else {
      const { startDate: nextStart, endDate: nextEnd } = getAdjacentDateRange(
        period.startDate,
        period.endDate,
        1,
      )
      router.push(
        `/supervisor-performance?from=${encodeURIComponent(nextStart)}&to=${encodeURIComponent(nextEnd)}`,
      )
    }
  }

  const handleSelectMonth = (targetMonth: string) => {
    router.push(`/supervisor-performance?month=${encodeURIComponent(targetMonth)}`)
  }

  const handleApplyCustomRange = () => {
    if (!customFrom || !customTo) {
      setCustomError("Choose both From and To dates.")
      return
    }
    if (customFrom > customTo) {
      setCustomError("From date must be on or before To date.")
      return
    }
    setCustomError(null)
    setCustomOpen(false)
    router.push(
      `/supervisor-performance?from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`,
    )
  }

  // Sorted supervisors: Active Projects DESC, Completed Visits DESC, Supervisor Name ASC
  const sortedSupervisors = useMemo(() => {
    return [...supervisors].sort((a, b) => {
      if (b.activeProjectsCount !== a.activeProjectsCount) {
        return b.activeProjectsCount - a.activeProjectsCount
      }
      if (b.completedVisits !== a.completedVisits) {
        return b.completedVisits - a.completedVisits
      }
      return a.supervisorName.localeCompare(b.supervisorName)
    })
  }, [supervisors])

  return (
    <div className="space-y-8">
      {/* Section A: Monthly Supervisor Performance Container */}
      <Card className="overflow-hidden border shadow-xs">
        {/* Container Header: Title & Month / Custom Period Selector */}
        <CardHeader className="border-b bg-muted/15 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Supervisor Performance
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-0.5 text-muted-foreground">
                Monitor supervisor workload, visit activity, and monthly project compliance.
              </CardDescription>
            </div>

            {/* Date Selector in Header */}
            <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xs">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={handlePrevPeriod}
                title="Previous Period"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Performance period: ${period.label}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-semibold text-foreground hover:bg-muted/80 rounded-lg transition-colors cursor-pointer"
                    >
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{period.label}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  }
                />
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={() => {
                      const curMonth = new Date().toISOString().slice(0, 7)
                      handleSelectMonth(curMonth)
                    }}
                    className="cursor-pointer justify-between"
                  >
                    <span>Current Month</span>
                    {period.mode === "month" &&
                      period.month === new Date().toISOString().slice(0, 7) && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => {
                      const curMonth = new Date().toISOString().slice(0, 7)
                      handleSelectMonth(getAdjacentMonth(curMonth, -1))
                    }}
                    className="cursor-pointer justify-between"
                  >
                    <span>Previous Month</span>
                    {period.mode === "month" &&
                      period.month ===
                        getAdjacentMonth(new Date().toISOString().slice(0, 7), -1) && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => {
                      setCustomFrom(period.startDate || "")
                      setCustomTo(period.endDate || "")
                      setCustomError(null)
                      setCustomOpen(true)
                    }}
                    className="cursor-pointer justify-between"
                  >
                    <span>Custom Date Range</span>
                    {period.mode === "custom" && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={handleNextPeriod}
                title="Next Period"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Custom Date Range Dialog */}
        <Dialog open={customOpen} onOpenChange={setCustomOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Custom Date Range</DialogTitle>
              <DialogDescription>
                Evaluate supervisor performance and visit activity between specific dates.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="perf-custom-from" className="text-xs font-semibold">
                  From Date
                </Label>
                <Input
                  id="perf-custom-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value)
                    setCustomError(null)
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="perf-custom-to" className="text-xs font-semibold">
                  To Date
                </Label>
                <Input
                  id="perf-custom-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value)
                    setCustomError(null)
                  }}
                />
              </div>
            </div>
            {customError && (
              <p className="text-xs text-destructive font-medium">{customError}</p>
            )}
            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCustomOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleApplyCustomRange}
              >
                Apply Filter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CardContent className="space-y-6 pt-6">
          {/* Unassigned Projects Notice if applicable */}
          {organizationSummary.unassignedActiveProjectsCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong className="font-semibold">
                  {organizationSummary.unassignedActiveProjectsCount} active project
                  {organizationSummary.unassignedActiveProjectsCount > 1 ? "s have" : " has"} no
                  supervisor assigned.
                </strong>{" "}
                {organizationSummary.unassignedComplianceProjectsCount > 0 && (
                  <span>
                    ({organizationSummary.unassignedComplianceProjectsCount} tracked under monthly compliance).
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Section A.1 — Organization Overview (KPI Cards) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* Card 1: Active Projects */}
            <Card size="sm" className="bg-card shadow-2xs border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Active Projects
                </CardTitle>
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{organizationSummary.totalActiveProjects}</div>
                <p className="text-xs text-muted-foreground mt-1">Current active workload</p>
              </CardContent>
            </Card>

            {/* Card 2: Active Supervisors */}
            <Card size="sm" className="bg-card shadow-2xs border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Active Supervisors
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{organizationSummary.activeSupervisorsCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Assigned or active authors</p>
              </CardContent>
            </Card>

            {/* Card 3: Required Visits */}
            <Card size="sm" className="bg-card shadow-2xs border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Required Visits
                </CardTitle>
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{organizationSummary.requiredVisits}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {organizationSummary.complianceEligibleProjectsCount} tracked projects
                </p>
              </CardContent>
            </Card>

            {/* Card 4: Completed Visits */}
            <Card size="sm" className="bg-card shadow-2xs border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Completed Visits
                </CardTitle>
                <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{organizationSummary.completedVisits}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {organizationSummary.extraVisits > 0
                    ? `${organizationSummary.extraVisits} extra visits`
                    : "Valid submitted reports"}
                </p>
              </CardContent>
            </Card>

            {/* Card 5: Missed Visits */}
            <Card size="sm" className="bg-card shadow-2xs border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Missed Visits
                </CardTitle>
                <Building2 className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    organizationSummary.missedVisits > 0 ? "text-rose-600 dark:text-rose-400" : ""
                  }`}
                >
                  {organizationSummary.missedVisits}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Unfulfilled required visits</p>
              </CardContent>
            </Card>

            {/* Card 6: Visit Compliance */}
            <Card size="sm" className="bg-card shadow-2xs border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Visit Compliance
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {organizationSummary.visitCompliancePercentage !== null
                    ? `${organizationSummary.visitCompliancePercentage}%`
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Credited completed / required</p>
              </CardContent>
            </Card>
          </div>

          {/* Section A.2 — Supervisor Workload & Activity Table */}
          <div className="space-y-3 pt-2">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Supervisor Workload &amp; Activity
              </h3>
              <p className="text-xs text-muted-foreground">
                Project workload reflects current active assignments. Visit activity reflects the selected month.
              </p>
            </div>

            {sortedSupervisors.length === 0 ? (
              <div className="rounded-lg border border-dashed py-12 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm font-medium text-foreground">No supervisor activity found</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No active projects or submitted site visit reports match this month.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <TooltipProvider delay={100}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[300px]">Supervisor</TableHead>
                        <TableHead className="text-center">Active Projects</TableHead>
                        <TableHead className="text-center">
                          <div className="inline-flex items-center gap-1">
                            <span>Tracked Projects</span>
                            <Tooltip>
                              <TooltipTrigger render={<span className="cursor-help text-muted-foreground" />}>
                                <Info className="h-3.5 w-3.5" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                Active projects tracked under Monthly 2, 3, or 4 supervision.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableHead>
                        <TableHead className="text-center">
                          <div className="inline-flex items-center justify-center gap-1">
                            <span>Visit Compliance</span>
                            <Tooltip>
                              <TooltipTrigger render={<span className="cursor-help text-muted-foreground" />}>
                                <Info className="h-3.5 w-3.5" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                Breakdown of completed required visits, missing visits, and extra visits.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedSupervisors.map((supervisor) => {
                        const initials = getInitials(supervisor.supervisorName)
                        return (
                          <TableRow key={supervisor.supervisorId}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {supervisor.supervisorAvatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={supervisor.supervisorAvatarUrl}
                                    alt={supervisor.supervisorName}
                                    className="h-8 w-8 rounded-full object-cover ring-1 ring-border"
                                  />
                                ) : (
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                    {initials}
                                  </div>
                                )}
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">
                                    {supervisor.supervisorName}
                                  </span>
                                  {supervisor.supervisorEmail && (
                                    <span className="text-xs text-muted-foreground">
                                      {supervisor.supervisorEmail}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="text-center font-medium">
                              {supervisor.activeProjectsCount}
                            </TableCell>

                            <TableCell className="text-center font-medium">
                              {supervisor.complianceProjectsCount > 0 ? (
                                <Badge variant="secondary" className="font-normal">
                                  {supervisor.complianceProjectsCount}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>

                            <TableCell className="text-center">
                              <Tooltip>
                                <TooltipTrigger render={<div className="inline-flex items-center justify-center gap-1.5 cursor-help rounded-md px-2 py-1 transition-colors hover:bg-muted/80" />}>
                                  {/* Completed Required Visits */}
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded border",
                                      supervisor.creditedCompletedVisits > 0
                                        ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800"
                                        : "text-muted-foreground/60 bg-muted/40 border-border/40"
                                    )}
                                  >
                                    <Check className="h-3 w-3 stroke-[2.5]" />
                                    {supervisor.creditedCompletedVisits}
                                  </span>

                                  {/* Missing Required Visits */}
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded border",
                                      supervisor.missedVisits > 0
                                        ? "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800"
                                        : "text-muted-foreground/60 bg-muted/40 border-border/40"
                                    )}
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    {supervisor.missedVisits}
                                  </span>

                                  {/* Extra Visits */}
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded border",
                                      supervisor.extraVisits > 0
                                        ? "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800"
                                        : "text-muted-foreground/60 bg-muted/40 border-border/40"
                                    )}
                                  >
                                    +{supervisor.extraVisits}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="p-3 text-xs w-64 space-y-2 border shadow-md">
                                  <div className="font-semibold border-b border-border/40 pb-1 flex items-center justify-between">
                                    <span>Visit Compliance</span>
                                    <span className="text-[11px] font-normal opacity-80">
                                      {supervisor.complianceProjectsCount} tracked {supervisor.complianceProjectsCount === 1 ? "project" : "projects"}
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-[12px]">
                                    <div className="flex items-center justify-between text-emerald-400 font-medium">
                                      <span className="flex items-center gap-1.5">
                                        <Check className="h-3.5 w-3.5 stroke-[2.5]" /> Completed:
                                      </span>
                                      <span>{supervisor.creditedCompletedVisits} {supervisor.creditedCompletedVisits === 1 ? "visit" : "visits"}</span>
                                    </div>
                                    <div className="flex items-center justify-between opacity-80">
                                      <span>Required visits:</span>
                                      <span className="font-medium">{supervisor.requiredVisits}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-rose-400 font-medium">
                                      <span className="flex items-center gap-1.5">
                                        <AlertTriangle className="h-3.5 w-3.5" /> Missing:
                                      </span>
                                      <span>{supervisor.missedVisits} {supervisor.missedVisits === 1 ? "visit" : "visits"}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-amber-400 font-medium">
                                      <span className="flex items-center gap-1.5">
                                        <Plus className="h-3.5 w-3.5" /> Extra:
                                      </span>
                                      <span>{supervisor.extraVisits} {supervisor.extraVisits === 1 ? "visit" : "visits"}</span>
                                    </div>
                                  </div>
                                  <div className="border-t border-border/40 pt-1.5 text-[10px] opacity-75 italic leading-tight">
                                    Extra visits do not compensate for missing required visits.
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TooltipProvider>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section Separator */}
      {complianceData && (
        <div className="py-2" aria-hidden="true">
          <div className="w-full border-t border-border" />
        </div>
      )}

      {/* Section B: Supervisor Visit Compliance Matrix Dashboard */}
      {complianceData && (
        <SupervisorVisitComplianceDashboard data={complianceData} />
      )}
    </div>
  )
}
