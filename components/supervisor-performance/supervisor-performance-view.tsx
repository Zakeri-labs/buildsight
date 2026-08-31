"useClient"
"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  Info,
  TrendingUp,
  UserCheck,
  Users,
  AlertCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { SupervisorPerformanceData } from "@/lib/supervisor-performance/types"

function formatMonthLabel(monthStr: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthStr)) return monthStr
  const [yearStr, monthNumStr] = monthStr.split("-")
  const year = parseInt(yearStr, 10)
  const monthIndex = parseInt(monthNumStr, 10) - 1
  const date = new Date(year, monthIndex, 1)
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

function getAdjacentMonth(monthStr: string, delta: number): string {
  if (!/^\d{4}-\d{2}$/.test(monthStr)) return monthStr
  const [yearStr, monthNumStr] = monthStr.split("-")
  let year = parseInt(yearStr, 10)
  let monthNum = parseInt(monthNumStr, 10) + delta

  if (monthNum < 1) {
    monthNum = 12
    year -= 1
  } else if (monthNum > 12) {
    monthNum = 1
    year += 1
  }
  return `${year}-${String(monthNum).padStart(2, "0")}`
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || "SV"
}

export function SupervisorPerformanceView({
  data,
  selectedMonth,
}: {
  data: SupervisorPerformanceData
  selectedMonth: string
}) {
  const router = useRouter()
  const { organizationSummary, supervisors } = data

  const formattedMonth = formatMonthLabel(selectedMonth)
  const prevMonth = getAdjacentMonth(selectedMonth, -1)
  const nextMonth = getAdjacentMonth(selectedMonth, 1)

  const handleMonthChange = (targetMonth: string) => {
    router.push(`/supervisor-performance?month=${encodeURIComponent(targetMonth)}`)
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
    <div className="space-y-6">
      {/* Header & Month Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Supervisor Performance
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor supervisor workload, visit activity, and monthly project compliance.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border bg-card p-1 shadow-xs">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleMonthChange(prevMonth)}
            title="Previous Month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 px-3 text-sm font-semibold">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{formattedMonth}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleMonthChange(nextMonth)}
            title="Next Month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

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

      {/* Section A — Organization Overview (KPI Cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Card 1: Active Projects */}
        <Card size="sm">
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
        <Card size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Active Supervisors
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{organizationSummary.activeSupervisorsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Current active project supervisors</p>
          </CardContent>
        </Card>

        {/* Card 3: Required Visits */}
        <Card size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Required Visits
            </CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{organizationSummary.requiredVisits}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {organizationSummary.complianceEligibleProjectsCount} Monthly 2/3/4 projects
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Total Visits */}
        <Card size="sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Visits
            </CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{organizationSummary.completedVisits}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All visit reports in {formattedMonth}
            </p>
          </CardContent>
        </Card>

        {/* Card 5: Missed Visits */}
        <Card size="sm">
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
            <p className="text-xs text-muted-foreground mt-1">Unfulfilled Monthly 2/3/4 requirements</p>
          </CardContent>
        </Card>

        {/* Card 6: Visit Compliance */}
        <Card size="sm">
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
            <p className="text-xs text-muted-foreground mt-1">
              {organizationSummary.extraVisits > 0
                ? `${organizationSummary.extraVisits} extra visits on tracked projects`
                : "Monthly 2/3/4 project compliance"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Section B — Supervisor Workload & Activity Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Supervisor Workload &amp; Activity</CardTitle>
              <CardDescription className="text-xs">
                Project workload reflects current active assignments. Total Visits reflects reports authored in the selected month.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sortedSupervisors.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium text-foreground">No supervisor activity found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No active projects or submitted site visit reports match this month.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Supervisor</TableHead>
                  <TableHead className="text-center">Active Projects</TableHead>
                  <TableHead className="text-center">
                    <div className="inline-flex items-center gap-1">
                      <span>Tracked Projects</span>
                      <span
                        title="Active projects tracked under Monthly 2, 3, or 4 supervision."
                        className="cursor-help text-muted-foreground"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </TableHead>
                  <TableHead className="text-center">Total Visits</TableHead>
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
                        {supervisor.completedVisits > 0 ? (
                          <Badge
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800"
                          >
                            {supervisor.completedVisits} visit{supervisor.completedVisits > 1 ? "s" : ""}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
