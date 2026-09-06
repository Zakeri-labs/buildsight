"use client"

import { useMemo } from "react"
import {
  Search,
  Filter,
  X,
  AlertTriangle,
  RotateCcw,
  Users,
  FolderKanban,
  Calendar,
  Activity,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type {
  ProjectComplianceTimelineRow,
  SupervisionComplianceType,
} from "@/lib/supervisor-performance/types"

export type ComplianceFilterState = {
  searchQuery: string
  selectedSupervisor: string
  selectedProject: string
  selectedFrequency: string
  selectedStatus: string
  showIssuesOnly: boolean
}

export type ComplianceFilterToolbarProps = {
  projects: ProjectComplianceTimelineRow[]
  supervisors: Array<{
    id: string
    name: string
    assignedProjectsCount?: number
  }>
  filters: ComplianceFilterState
  onFilterChange: <K extends keyof ComplianceFilterState>(
    key: K,
    value: ComplianceFilterState[K],
  ) => void
  onResetFilters: () => void
  totalProjectsCount: number
  filteredProjectsCount: number
  className?: string
}

export function ComplianceFilterToolbar({
  projects,
  supervisors,
  filters,
  onFilterChange,
  onResetFilters,
  totalProjectsCount,
  filteredProjectsCount,
  className,
}: ComplianceFilterToolbarProps) {
  const {
    searchQuery,
    selectedSupervisor,
    selectedProject,
    selectedFrequency,
    selectedStatus,
    showIssuesOnly,
  } = filters

  // Distinct supervisor options
  const supervisorOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const s of supervisors) {
      if (s.id && s.name) {
        map.set(s.id, { id: s.id, name: s.name })
      }
    }
    for (const p of projects) {
      for (const s of p.supervisors) {
        if (s.id && s.name) {
          map.set(s.id, { id: s.id, name: s.name })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [supervisors, projects])

  // Distinct project options
  const projectOptions = useMemo(() => {
    return [...projects].sort((a, b) => a.projectName.localeCompare(b.projectName))
  }, [projects])

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (searchQuery.trim()) count += 1
    if (selectedSupervisor !== "all") count += 1
    if (selectedProject !== "all") count += 1
    if (selectedFrequency !== "all") count += 1
    if (selectedStatus !== "all") count += 1
    if (showIssuesOnly) count += 1
    return count
  }, [
    searchQuery,
    selectedSupervisor,
    selectedProject,
    selectedFrequency,
    selectedStatus,
    showIssuesOnly,
  ])

  const isFiltered = activeFiltersCount > 0

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-2xs transition-all",
        className,
      )}
    >
      {/* Top Row: Search + Filter Selects + Quick Actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* 1. Quick Search Input */}
        <div className="relative min-w-[200px] flex-1 sm:max-w-[260px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onFilterChange("searchQuery", e.target.value)}
            placeholder="Search project or code..."
            className="h-8 pl-8 pr-7 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => onFilterChange("searchQuery", "")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* 2. Supervisor Filter */}
        <div className="w-[170px] sm:w-[185px]">
          <Select
            value={selectedSupervisor}
            onValueChange={(val) => onFilterChange("selectedSupervisor", val as string)}
          >
            <SelectTrigger size="sm" className="h-8 text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="All Supervisors">
                  {(value) => {
                    if (!value || value === "all") return "All Supervisors"
                    const sup = supervisorOptions.find((s) => s.id === value)
                    return sup?.name ?? "Supervisor"
                  }}
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectGroup>
                <SelectItem value="all">All Supervisors</SelectItem>
                {supervisorOptions.map((sup) => (
                  <SelectItem key={sup.id} value={sup.id}>
                    {sup.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* 3. Project Filter */}
        <div className="w-[170px] sm:w-[195px]">
          <Select
            value={selectedProject}
            onValueChange={(val) => onFilterChange("selectedProject", val as string)}
          >
            <SelectTrigger size="sm" className="h-8 text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="All Projects">
                  {(value) => {
                    if (!value || value === "all") return "All Projects"
                    const proj = projectOptions.find((p) => p.projectId === value)
                    return proj?.projectName ?? "Project"
                  }}
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectGroup>
                <SelectItem value="all">All Projects</SelectItem>
                {projectOptions.map((proj) => (
                  <SelectItem key={proj.projectId} value={proj.projectId}>
                    {proj.projectName}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* 4. Visit Frequency Filter */}
        <div className="w-[145px] sm:w-[155px]">
          <Select
            value={selectedFrequency}
            onValueChange={(val) => onFilterChange("selectedFrequency", val as string)}
          >
            <SelectTrigger size="sm" className="h-8 text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="All Frequencies">
                  {(value) => {
                    if (value === "monthly_2") return "Monthly 2"
                    if (value === "monthly_3") return "Monthly 3"
                    if (value === "monthly_4") return "Monthly 4"
                    if (value === "lump_sum") return "Lump Sum"
                    return "All Frequencies"
                  }}
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All Frequencies</SelectItem>
                <SelectItem value="monthly_2">Monthly 2</SelectItem>
                <SelectItem value="monthly_3">Monthly 3</SelectItem>
                <SelectItem value="monthly_4">Monthly 4</SelectItem>
                <SelectItem value="lump_sum">Lump Sum</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* 5. Compliance Status Filter */}
        <div className="w-[140px] sm:w-[150px]">
          <Select
            value={selectedStatus}
            onValueChange={(val) => onFilterChange("selectedStatus", val as string)}
          >
            <SelectTrigger size="sm" className="h-8 text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <Activity className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="All Status">
                  {(value) => {
                    if (value === "done") return "Completed"
                    if (value === "missing") return "Missing"
                    if (value === "upcoming") return "Upcoming"
                    if (value === "extra") return "Extra Visit"
                    return "All Status"
                  }}
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="done">Completed</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="extra">Extra Visit</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* 6. Quick Action: Show Issues Only */}
        <Button
          type="button"
          size="sm"
          variant={showIssuesOnly ? "destructive" : "outline"}
          onClick={() => onFilterChange("showIssuesOnly", !showIssuesOnly)}
          className={cn(
            "h-8 gap-1.5 text-xs transition-all",
            showIssuesOnly
              ? "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-800"
              : "border-dashed text-muted-foreground hover:text-foreground",
          )}
        >
          <AlertTriangle
            className={cn("h-3.5 w-3.5", showIssuesOnly ? "text-white" : "text-amber-500")}
          />
          <span>Show Issues Only</span>
        </Button>

        {/* 7. Reset Filters Button */}
        {isFiltered && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onResetFilters}
            className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            title="Reset all filters"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </Button>
        )}
      </div>

      {/* Bottom Sub-bar: Results Counter & Active Filter Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            Showing <strong className="font-semibold text-foreground">{filteredProjectsCount}</strong> of{" "}
            <span className="font-medium text-foreground">{totalProjectsCount}</span> project
            {totalProjectsCount === 1 ? "" : "s"}
          </span>

          {isFiltered && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
              {activeFiltersCount} active filter{activeFiltersCount === 1 ? "" : "s"}
            </Badge>
          )}
        </div>

        {isFiltered && filteredProjectsCount === 0 && (
          <span className="text-rose-600 dark:text-rose-400 font-medium">
            No projects match the current criteria.
          </span>
        )}
      </div>
    </div>
  )
}
