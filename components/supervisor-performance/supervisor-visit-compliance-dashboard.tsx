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
  getSaturdayForDateKey,
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
  selectedStatus: "active",
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

function formatStartWeekLabel(saturdayDateKey: string): string {
  const [year, month, day] = saturdayDateKey.split("-").map(Number)
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

  // Default Anchor Week: Saturday of the current reference date week
  const defaultAnchorSaturday = useMemo(() => {
    try {
      return getSaturdayForDateKey(referenceDate)
    } catch {
      return referenceDate.slice(0, 10)
    }
  }, [referenceDate])

  const [anchorSaturday, setAnchorSaturday] = useState<string>(defaultAnchorSaturday)

  // Generate 8 visible weeks: 6 weeks before anchor + anchor week (col 7) + 1 following week (col 8)
  const visibleWeeks = useMemo(() => {
    const startSaturday = addCalendarDays(anchorSaturday, -42)
    const endFriday = addCalendarDays(startSaturday, VISIBLE_WEEKS_COUNT * 7 - 1)
    return generateCalendarWeeks({
      rangeStart: startSaturday,
      rangeEnd: endFriday,
      referenceDate,
    })
  }, [anchorSaturday, referenceDate])

  const visibleRangeLabel = useMemo(() => {
    if (visibleWeeks.length === 0) return ""
    const first = visibleWeeks[0].startDate
    const last = visibleWeeks[visibleWeeks.length - 1].endDate
    return formatVisibleTimelineRange(first, last)
  }, [visibleWeeks])

  const isCurrentAnchorWeek = anchorSaturday === defaultAnchorSaturday

  const handlePrevWeek = () => {
    setAnchorSaturday((prev) => addCalendarDays(prev, -7))
  }

  const handleNextWeek = () => {
    setAnchorSaturday((prev) => addCalendarDays(prev, 7))
  }

  const handleSelectAnchorDate = (saturday: string) => {
    setAnchorSaturday(saturday)
  }

  const handleResetToCurrentWeek = () => {
    setAnchorSaturday(defaultAnchorSaturday)
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

    const filtered = projects.filter((project) => {
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
        if (selectedFrequency === "monthly") {
          const isMonthly =
            project.normalizedSupervisionType === "monthly_2" ||
            project.normalizedSupervisionType === "monthly_3" ||
            project.normalizedSupervisionType === "monthly_4"
          if (!isMonthly) return false
        } else if (selectedFrequency === "lump_sum") {
          if (project.normalizedSupervisionType !== null) return false
        }
      }

      // 4. Project Status Filter
      if (selectedStatus !== "all") {
        if (project.normalizedStatus !== selectedStatus && project.status !== selectedStatus) {
          return false
        }
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

    // Defensive deduplication by projectId to prevent duplicate matrix rows
    const seenIds = new Set<string>()
    return filtered.filter((project) => {
      if (seenIds.has(project.projectId)) return false
      seenIds.add(project.projectId)
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
              Operational compliance tracking required vs. completed inspection visits across calendar weeks (Saturday → Friday).
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
        {/* Filter Toolbar (with integrated View From anchor date picker) */}
        <ComplianceFilterToolbar
          projects={projects}
          supervisors={supervisors}
          filters={filters}
          onFilterChange={handleFilterChange}
          onResetFilters={handleResetFilters}
          totalProjectsCount={projects.length}
          filteredProjectsCount={filteredProjects.length}
          anchorWeekSaturday={anchorSaturday}
          onAnchorWeekChange={handleSelectAnchorDate}
          onResetToCurrentWeek={handleResetToCurrentWeek}
          isCurrentAnchorWeek={isCurrentAnchorWeek}
          visibleRangeLabel={visibleRangeLabel}
        />

        {/* Matrix Table (with circular Previous / Next week navigation buttons on table headers) */}
        <ComplianceMatrix
          weeks={visibleWeeks}
          projects={filteredProjects}
          isFiltered={isFiltered}
          onResetFilters={handleResetFilters}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
        />
      </CardContent>
    </Card>
  )
}
