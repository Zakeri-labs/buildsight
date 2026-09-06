"use client"

import { useMemo, useState } from "react"
import {
  CalendarDays,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  addCalendarDays,
  generateCalendarWeeks,
  getSundayForDateKey,
} from "@/lib/supervisor-performance/compliance-engine"
import type { SupervisorVisitComplianceDashboardData } from "@/lib/supervisor-performance/types"
import { ComplianceFilterToolbar, type ComplianceFilterState } from "./compliance-filter-toolbar"
import { ComplianceMatrix } from "./compliance-matrix"

export type SupervisorVisitComplianceDashboardProps = {
  data: SupervisorVisitComplianceDashboardData
  className?: string
}

const VISIBLE_WEEKS_COUNT = 8

const initialFilters: ComplianceFilterState = {
  searchQuery: "",
  selectedSupervisor: "all",
  selectedFrequency: "all",
  selectedStatus: "all",
  showIssuesOnly: false,
}

function formatVisibleTimelineRange(startDateKey: string, endDateKey: string): string {
  const [sYear, sMonth, sDay] = startDateKey.split("-").map(Number)
  const [eYear, eMonth, eDay] = endDateKey.split("-").map(Number)
  const sDate = new Date(Date.UTC(sYear, sMonth - 1, sDay))
  const eDate = new Date(Date.UTC(eYear, eMonth - 1, eDay))

  const sMonthName = sDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
  const eMonthName = eDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })

  return `${sMonthName} ${sDay}, ${sYear} – ${eMonthName} ${eDay}, ${eYear}`
}

function formatStartWeekLabel(sundayDateKey: string): string {
  const [year, month, day] = sundayDateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const monthName = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
  return `${monthName} ${day}, ${year}`
}

export function SupervisorVisitComplianceDashboard({
  data,
  className,
}: SupervisorVisitComplianceDashboardProps) {
  const { projects, supervisors, referenceDate } = data
  const [filters, setFilters] = useState<ComplianceFilterState>(initialFilters)

  // Default starting week: Sunday of the current reference date week
  const defaultStartSunday = useMemo(() => {
    try {
      return getSundayForDateKey(referenceDate)
    } catch {
      return referenceDate.slice(0, 10)
    }
  }, [referenceDate])

  const [startWeekSunday, setStartWeekSunday] = useState<string>(defaultStartSunday)

  // Generate the fixed 8 visible calendar weeks (Sunday -> Saturday)
  const visibleWeeks = useMemo(() => {
    const endSaturday = addCalendarDays(startWeekSunday, VISIBLE_WEEKS_COUNT * 7 - 1)
    return generateCalendarWeeks({
      rangeStart: startWeekSunday,
      rangeEnd: endSaturday,
      referenceDate,
    })
  }, [startWeekSunday, referenceDate])

  const visibleRangeLabel = useMemo(() => {
    if (visibleWeeks.length === 0) return ""
    const first = visibleWeeks[0].startDate
    const last = visibleWeeks[visibleWeeks.length - 1].endDate
    return formatVisibleTimelineRange(first, last)
  }, [visibleWeeks])

  const startWeekLabel = useMemo(() => {
    return formatStartWeekLabel(startWeekSunday)
  }, [startWeekSunday])

  const isCurrentStartWeek = startWeekSunday === defaultStartSunday

  const handlePrevWeek = () => {
    setStartWeekSunday((prev) => addCalendarDays(prev, -7))
  }

  const handleNextWeek = () => {
    setStartWeekSunday((prev) => addCalendarDays(prev, 7))
  }

  const handleSelectDate = (dateKey: string) => {
    try {
      const sunday = getSundayForDateKey(dateKey)
      setStartWeekSunday(sunday)
    } catch {
      // Ignore invalid date strings
    }
  }

  const handleResetToCurrentWeek = () => {
    setStartWeekSunday(defaultStartSunday)
  }

  const handleFilterChange = <K extends keyof ComplianceFilterState>(
    key: K,
    value: ComplianceFilterState[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleResetFilters = () => {
    setFilters(initialFilters)
  }

  // Filter projects purely client-side
  const filteredProjects = useMemo(() => {
    const {
      searchQuery,
      selectedSupervisor,
      selectedFrequency,
      selectedStatus,
      showIssuesOnly,
    } = filters

    return projects.filter((project) => {
      // 1. Text Search query (Project Name, Code, or Supervisor Name)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = project.projectName.toLowerCase().includes(q)
        const matchCode = project.projectCode.toLowerCase().includes(q)
        const matchSup = project.supervisors.some((s) => s.name.toLowerCase().includes(q))
        if (!matchName && !matchCode && !matchSup) {
          return false
        }
      }

      // 2. Supervisor Filter
      if (selectedSupervisor !== "all") {
        const isAssigned =
          project.assignedSupervisorId === selectedSupervisor ||
          project.supervisorIds.includes(selectedSupervisor)
        if (!isAssigned) return false
      }

      // 3. Visit Frequency Filter
      if (selectedFrequency !== "all") {
        if (selectedFrequency === "lump_sum") {
          if (project.normalizedSupervisionType !== null) return false
        } else {
          if (project.normalizedSupervisionType !== selectedFrequency) return false
        }
      }

      // 4. Compliance Status Filter
      if (selectedStatus !== "all") {
        const hasStatusInVisibleWeeks = Object.values(project.weeklyCells).some(
          (cell) => cell.status === selectedStatus,
        )
        if (!hasStatusInVisibleWeeks) return false
      }

      // 5. Quick Action: Show Issues Only
      if (showIssuesOnly) {
        const hasIssues = Object.values(project.weeklyCells).some(
          (cell) => cell.status === "missing" || cell.status === "extra",
        )
        if (!hasIssues) return false
      }

      return true
    })
  }, [projects, filters])

  const isFiltered =
    filters.searchQuery.trim() !== "" ||
    filters.selectedSupervisor !== "all" ||
    filters.selectedFrequency !== "all" ||
    filters.selectedStatus !== "all" ||
    filters.showIssuesOnly

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-semibold">
                Supervisor Visit Compliance Matrix
              </CardTitle>
            </div>
            <CardDescription className="mt-1 text-xs">
              Operational compliance tracking required vs. completed inspection visits across calendar weeks (Sunday → Saturday).
            </CardDescription>
          </div>

          {/* Compliance Status Legend */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-1.5 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-medium text-foreground">Completed</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-rose-500" />
              <span className="font-medium text-foreground">Missing</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-sky-500" />
              <span className="font-medium text-foreground">Upcoming</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-medium text-foreground">Extra Visit</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Timeline Start Week Navigation & Range Banner */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-muted/20 p-2.5">
          {/* Controls: [ Previous ] [ Select Start Week ] [ Next ] */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-1 shadow-2xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePrevWeek}
                className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                title="Move timeline 1 week backward"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Previous</span>
              </Button>

              {/* Select Start Week Calendar Picker */}
              <div className="relative inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer">
                <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>
                  Start Week: <strong className="font-semibold text-foreground">{startWeekLabel}</strong>
                </span>
                <input
                  type="date"
                  value={startWeekSunday}
                  onChange={(e) => {
                    if (e.target.value) handleSelectDate(e.target.value)
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0 w-full h-full"
                  title="Click to select start week"
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNextWeek}
                className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                title="Move timeline 1 week forward"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Jump to Current Week button if navigated away */}
            {!isCurrentStartWeek && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetToCurrentWeek}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Jump to current week"
              >
                <Clock className="h-3 w-3" />
                <span>This Week</span>
              </Button>
            )}
          </div>

          {/* Current Visible Range Display */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>
              Showing: <strong className="font-semibold text-foreground">{visibleRangeLabel}</strong>
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <ComplianceFilterToolbar
          projects={projects}
          supervisors={supervisors}
          filters={filters}
          onFilterChange={handleFilterChange}
          onResetFilters={handleResetFilters}
          totalProjectsCount={projects.length}
          filteredProjectsCount={filteredProjects.length}
        />

        {/* Matrix Table */}
        <ComplianceMatrix
          weeks={visibleWeeks}
          projects={filteredProjects}
          isFiltered={isFiltered}
          onResetFilters={handleResetFilters}
        />
      </CardContent>
    </Card>
  )
}
