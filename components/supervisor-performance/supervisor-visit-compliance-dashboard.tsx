"use client"

import { useMemo, useState } from "react"
import {
  CalendarDays,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { SupervisorVisitComplianceDashboardData } from "@/lib/supervisor-performance/types"
import { ComplianceFilterToolbar, type ComplianceFilterState } from "./compliance-filter-toolbar"
import { ComplianceMatrix } from "./compliance-matrix"

export type SupervisorVisitComplianceDashboardProps = {
  data: SupervisorVisitComplianceDashboardData
  className?: string
}

const initialFilters: ComplianceFilterState = {
  searchQuery: "",
  selectedSupervisor: "all",
  selectedProject: "all",
  selectedFrequency: "all",
  showIssuesOnly: false,
}

export function SupervisorVisitComplianceDashboard({
  data,
  className,
}: SupervisorVisitComplianceDashboardProps) {
  const { weeks, projects, supervisors } = data
  const [filters, setFilters] = useState<ComplianceFilterState>(initialFilters)

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
      selectedProject,
      selectedFrequency,
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

      // 3. Project Filter
      if (selectedProject !== "all") {
        if (project.projectId !== selectedProject) return false
      }

      // 4. Visit Frequency Filter
      if (selectedFrequency !== "all") {
        if (selectedFrequency === "lump_sum") {
          if (project.normalizedSupervisionType !== null) return false
        } else {
          if (project.normalizedSupervisionType !== selectedFrequency) return false
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
  }, [projects, filters])

  const isFiltered =
    filters.searchQuery.trim() !== "" ||
    filters.selectedSupervisor !== "all" ||
    filters.selectedProject !== "all" ||
    filters.selectedFrequency !== "all" ||
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
          weeks={weeks}
          projects={filteredProjects}
          isFiltered={isFiltered}
          onResetFilters={handleResetFilters}
        />
      </CardContent>
    </Card>
  )
}
