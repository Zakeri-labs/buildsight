"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react"
import {
  Search,
  Plus,
  Upload,
  MoreVertical,
  Folder,
  PieChart,
  PauseCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  ArrowUpDown,
  Building2,
  MapPin,
  SlidersHorizontal,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { useCurrentUser } from "@/components/current-user-provider"
import { cn, capitalizeWords } from "@/lib/utils"
import { ProjectImageDisplay } from "@/components/projects/project-image-display"
import { ProjectLocationPreviewDialog } from "@/components/projects/project-location-preview-dialog"
import { ProjectEditDialog } from "@/components/projects/project-edit-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { supervisionTypeLabel, type ProjectTypeValue } from "@/lib/projects/project-options"
import type { ProjectSupervisorCandidate } from "@/lib/projects/supervisor-candidates"
import {
  deleteProject,
  getProjectDeletionImpact,
  type ProjectDeletionImpact,
} from "@/lib/actions/projects"
import {
  PROJECT_STATUS_BADGE_CLASS,
  PROJECT_STATUS_OPTIONS,
  normalizeProjectStatus,
  projectStatusLabel,
  type ProjectStatusValue,
} from "@/lib/projects/project-status"

export type ProjectStatus = ProjectStatusValue
export type ProjectType = "Residential" | "Commercial" | "Hospitality" | "Infrastructure" | "Industrial"

const PROJECT_TABLE_COLUMN_WIDTHS = [
  "16%",
  "11%",
  "10.5%",
  "10.5%",
  "13%",
  "9.5%",
  "7.5%",
  "8.5%",
  "9.5%",
  "4%",
] as const

export interface ProjectRow {
  id: string
  code: string
  name: string
  ownerClient: string
  supervisorName?: string | null
  address: string
  areaDistrict?: string | null
  projectType: ProjectType | "—"
  projectTypeValue?: ProjectTypeValue | null
  supervisionType?: string | null
  supervisionTypeOther?: string | null
  supervisionStartDate?: string | null
  description?: string
  status: ProjectStatus
  startDate: string
  progress: number
  imageUrl: string
  latitude?: number | null
  longitude?: number | null
  assignedSupervisorId?: string | null
  canEdit?: boolean
}

function TruncatedText({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className={cn("block min-w-0 truncate", className)} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-normal text-pretty">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

const mockProjects: ProjectRow[] = [
  {
    id: "1",
    code: "PRJ-001",
    name: "Sunset Residential Tower",
    ownerClient: "Sunset Development",
    address: "Muscat, Al Khuwair",
    supervisionType: "full_time",
    projectType: "Residential",
    status: "active",
    startDate: "May 10, 2024",
    progress: 62,
    imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "2",
    code: "PRJ-002",
    name: "Greenfield Office Complex",
    ownerClient: "Greenfield LLC",
    address: "Muscat, Ghala",
    supervisionType: "part_time",
    projectType: "Commercial",
    status: "active",
    startDate: "Apr 02, 2024",
    progress: 45,
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "3",
    code: "PRJ-003",
    name: "Harbor View Hotel",
    ownerClient: "Harbor Hotels",
    address: "Sohar, Corniche Road",
    supervisionType: "resident",
    projectType: "Hospitality",
    status: "active",
    startDate: "Jun 01, 2024",
    progress: 58,
    imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "4",
    code: "PRJ-004",
    name: "City Center Mall",
    ownerClient: "City Center Holdings",
    address: "Muscat, Seeb",
    supervisionType: "milestone_based",
    projectType: "Commercial",
    status: "not_started",
    startDate: "Jul 01, 2024",
    progress: 18,
    imageUrl: "https://images.unsplash.com/photo-1519999482648-25049ddd37b1?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "5",
    code: "PRJ-005",
    name: "Airport Road Bridge",
    ownerClient: "Oman Transport Authority",
    address: "Muscat, Airport Road",
    supervisionType: "periodic",
    projectType: "Infrastructure",
    status: "stopped",
    startDate: "Mar 14, 2024",
    progress: 35,
    imageUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "6",
    code: "PRJ-006",
    name: "Al Raha Beach Villas",
    ownerClient: "Al Raha Properties",
    address: "Muscat, Qurum",
    supervisionType: "full_time",
    projectType: "Residential",
    status: "active",
    startDate: "Feb 09, 2024",
    progress: 71,
    imageUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "7",
    code: "PRJ-007",
    name: "Muscat Industrial Park",
    ownerClient: "Industrial Dev. Co.",
    address: "Muscat, Rusayl",
    supervisionType: "consultancy_only",
    projectType: "Industrial",
    status: "completed",
    startDate: "Sep 03, 2023",
    progress: 100,
    imageUrl: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "8",
    code: "PRJ-008",
    name: "Al Mouj Marina",
    ownerClient: "Al Mouj LLC",
    address: "Muscat, Al Mouj",
    supervisionType: "on_call",
    projectType: "Infrastructure",
    status: "not_started",
    startDate: "Aug 12, 2024",
    progress: 8,
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=120&q=80",
  },
]

export function ProjectsList({
  projects = mockProjects,
  createdProjectId,
  canDeleteProjects = false,
  canCreateProjects = false,
  supervisorOptions = [],
}: {
  projects?: ProjectRow[]
  createdProjectId?: string
  canDeleteProjects?: boolean
  canCreateProjects?: boolean
  supervisorOptions?: ProjectSupervisorCandidate[]
}) {
  const { locale } = useI18n()
  const currentUser = useCurrentUser()
  const isMember = currentUser.role === "org_member"
  const router = useRouter()
  const [projectRows, setProjectRows] = useState(projects)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedType, setSelectedType] = useState("all")
  const [selectedSupervisor, setSelectedSupervisor] = useState("all")
  const [selectedAreaDistrict, setSelectedAreaDistrict] = useState("all")
  const [selectedOwner, setSelectedOwner] = useState("all")
  const [sortBy, setSortBy] = useState("default")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ProjectRow | null>(null)
  const [locationTarget, setLocationTarget] = useState<ProjectRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null)
  const [deletionImpact, setDeletionImpact] = useState<ProjectDeletionImpact | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [impactPending, startImpactTransition] = useTransition()
  const [deletePending, startDeleteTransition] = useTransition()

  useEffect(() => {
    setProjectRows(projects)
  }, [projects])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const filteredProjects = useMemo(() => {
    return projectRows.filter((p) => {
      if (
        searchQuery &&
        !p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !p.code.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !p.address.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false
      }
      if (selectedStatus !== "all" && p.status !== selectedStatus) return false
      if (selectedType !== "all" && p.projectType !== selectedType) return false
      if (selectedOwner !== "all" && p.ownerClient !== selectedOwner) return false
      return true
    })
  }, [projectRows, searchQuery, selectedStatus, selectedType, selectedOwner])

  const desktopFilteredProjects = useMemo(() => {
    return filteredProjects.filter((project) => {
      const supervisorName = project.assignedSupervisorId ? (project.supervisorName?.trim() || "Assigned Supervisor") : ""
      const areaDistrict = project.areaDistrict?.trim() || ""

      if (selectedSupervisor === "__unassigned__" && project.assignedSupervisorId) return false
      if (
        selectedSupervisor !== "all" &&
        selectedSupervisor !== "__unassigned__" &&
        supervisorName.toLocaleLowerCase() !== selectedSupervisor.toLocaleLowerCase()
      ) return false
      if (selectedAreaDistrict === "__unspecified__" && areaDistrict) return false
      if (
        selectedAreaDistrict !== "all" &&
        selectedAreaDistrict !== "__unspecified__" &&
        areaDistrict.toLocaleLowerCase() !== selectedAreaDistrict.toLocaleLowerCase()
      ) return false
      return true
    })
  }, [filteredProjects, selectedSupervisor, selectedAreaDistrict])

  const mobileProjects = useMemo(() => {
    const rows = [...filteredProjects]
    if (sortBy === "name-asc") rows.sort((left, right) => left.name.localeCompare(right.name))
    if (sortBy === "progress-desc") rows.sort((left, right) => right.progress - left.progress || left.name.localeCompare(right.name))
    if (sortBy === "date-desc") {
      rows.sort((left, right) => {
        const leftTime = Date.parse(left.startDate)
        const rightTime = Date.parse(right.startDate)
        const leftValue = Number.isNaN(leftTime) ? Number.NEGATIVE_INFINITY : leftTime
        const rightValue = Number.isNaN(rightTime) ? Number.NEGATIVE_INFINITY : rightTime
        return rightValue - leftValue || left.name.localeCompare(right.name)
      })
    }
    return rows
  }, [filteredProjects, sortBy])

  const desktopProjects = useMemo(() => {
    const rows = [...desktopFilteredProjects]
    const compareNullableText = (leftValue: string | null | undefined, rightValue: string | null | undefined, direction: "asc" | "desc") => {
      const left = leftValue?.trim() || ""
      const right = rightValue?.trim() || ""
      if (!left && !right) return 0
      if (!left) return 1
      if (!right) return -1
      return direction === "asc" ? left.localeCompare(right) : right.localeCompare(left)
    }

    if (sortBy === "name-asc") rows.sort((left, right) => left.name.localeCompare(right.name))
    if (sortBy === "progress-desc") rows.sort((left, right) => right.progress - left.progress || left.name.localeCompare(right.name))
    if (sortBy === "date-desc") {
      rows.sort((left, right) => {
        const leftTime = Date.parse(left.startDate)
        const rightTime = Date.parse(right.startDate)
        const leftValue = Number.isNaN(leftTime) ? Number.NEGATIVE_INFINITY : leftTime
        const rightValue = Number.isNaN(rightTime) ? Number.NEGATIVE_INFINITY : rightTime
        return rightValue - leftValue || left.name.localeCompare(right.name)
      })
    }
    if (sortBy === "supervisor-asc") rows.sort((left, right) => compareNullableText(left.supervisorName, right.supervisorName, "asc") || left.name.localeCompare(right.name))
    if (sortBy === "supervisor-desc") rows.sort((left, right) => compareNullableText(left.supervisorName, right.supervisorName, "desc") || left.name.localeCompare(right.name))
    if (sortBy === "area-asc") rows.sort((left, right) => compareNullableText(left.areaDistrict, right.areaDistrict, "asc") || left.name.localeCompare(right.name))
    if (sortBy === "area-desc") rows.sort((left, right) => compareNullableText(left.areaDistrict, right.areaDistrict, "desc") || left.name.localeCompare(right.name))
    return rows
  }, [desktopFilteredProjects, sortBy])

  const totalProjects = projectRows.length
  const activeProjects = projectRows.filter((project) => project.status === "active").length
  const stoppedProjects = projectRows.filter((project) => project.status === "stopped").length
  const completedProjects = projectRows.filter((project) => project.status === "completed").length
  const typeOptions = Array.from(new Set(projectRows.map((project) => project.projectType).filter((type) => type !== "—")))
  const ownerOptions = Array.from(new Set(projectRows.map((project) => project.ownerClient).filter((owner) => owner !== "—")))
  const supervisorOptionsForFilter = Array.from(
    new Map(
      projectRows
        .filter((project) => Boolean(project.assignedSupervisorId))
        .map((project) => project.supervisorName?.trim() || "Assigned Supervisor")
        .map((name) => [name.toLocaleLowerCase(), name] as const),
    ).values(),
  ).sort((left, right) => left.localeCompare(right))
  const areaDistrictOptions = Array.from(
    new Map(
      projectRows
        .map((project) => project.areaDistrict?.trim())
        .filter((area): area is string => Boolean(area))
        .map((area) => [area.toLocaleLowerCase(), area] as const),
    ).values(),
  ).sort((left, right) => left.localeCompare(right))
  const hasUnassignedSupervisor = projectRows.some((project) => !project.assignedSupervisorId)
  const hasUnspecifiedArea = projectRows.some((project) => !project.areaDistrict?.trim())
  const activeFilterCount = [selectedStatus, selectedType, selectedOwner].filter((value) => value !== "all").length
  const desktopActiveFilterCount = activeFilterCount + [selectedSupervisor, selectedAreaDistrict].filter((value) => value !== "all").length
  const hasSearchOrFilters = Boolean(searchQuery.trim()) || desktopActiveFilterCount > 0 || sortBy !== "default"
  const desktopPageCount = Math.max(1, Math.ceil(desktopProjects.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, desktopPageCount)
  const desktopPageStart = (safeCurrentPage - 1) * pageSize
  const paginatedDesktopProjects = desktopProjects.slice(desktopPageStart, desktopPageStart + pageSize)
  const desktopPageWindowStart = Math.max(1, Math.min(safeCurrentPage - 2, Math.max(1, desktopPageCount - 4)))
  const desktopPageNumbers = Array.from(
    { length: Math.min(5, desktopPageCount - desktopPageWindowStart + 1) },
    (_, index) => desktopPageWindowStart + index,
  )
  const createdProject = createdProjectId ? projectRows.find((project) => project.id === createdProjectId) : undefined

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedStatus, selectedType, selectedSupervisor, selectedAreaDistrict, selectedOwner, sortBy, pageSize])

  function clearAllProjectListFilters() {
    setSearchQuery("")
    setSelectedStatus("all")
    setSelectedType("all")
    setSelectedSupervisor("all")
    setSelectedAreaDistrict("all")
    setSelectedOwner("all")
    setSortBy("default")
    setCurrentPage(1)
  }

  function openDeleteDialog(project: ProjectRow) {
    setDeleteTarget(project)
    setDeletionImpact(null)
    setDeleteError(null)
    startImpactTransition(async () => {
      const result = await getProjectDeletionImpact({ projectId: project.id })
      if (!result.ok) {
        setDeleteError(result.error)
        return
      }
      setDeletionImpact(result.data ?? null)
    })
  }

  function confirmDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    startDeleteTransition(async () => {
      const result = await deleteProject({ projectId: deleteTarget.id })
      if (!result.ok) {
        setDeleteError(result.error)
        return
      }
      setProjectRows((current) => current.filter((project) => project.id !== deleteTarget.id))
      setDeleteTarget(null)
      setDeletionImpact(null)
      setNotice(locale === "ar" ? "تم حذف المشروع بنجاح." : "Project deleted successfully.")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6 font-sans">
      {notice ? (
        <div
          role="status"
          className="fixed end-5 top-5 z-[70] rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 shadow-lg dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-300"
        >
          {notice}
        </div>
      ) : null}
      {createdProjectId && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {locale === "ar"
            ? `تم إنشاء المشروع ${createdProject?.name ?? ""} بنجاح.`
            : `Project ${createdProject?.name ?? ""} was created successfully.`}
        </div>
      )}

      {isMember ? (
        <section className="flex min-w-0 flex-col gap-3 md:hidden" aria-label="Projects under your supervision">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">
                {locale === "ar" ? "المشاريع" : "Projects"}
              </h1>
              <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                {locale === "ar" ? "المشاريع تحت إشرافك" : "Projects under your supervision"}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={locale === "ar" ? "إجراءات المشاريع" : "Project actions"}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <MoreVertical className="size-4" />
                  </button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Upload className="size-4" />
                  {locale === "ar" ? "تصدير" : "Export"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <MobileProjectMetric label={locale === "ar" ? "الإجمالي" : "Total"} value={totalProjects} tone="blue" />
            <MobileProjectMetric label={locale === "ar" ? "نشط" : "Active"} value={activeProjects} tone="green" />
            <MobileProjectMetric label={locale === "ar" ? "متوقف" : "Stopped"} value={stoppedProjects} tone="red" />
            <MobileProjectMetric label={locale === "ar" ? "مكتمل" : "Completed"} value={completedProjects} tone="violet" />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={locale === "ar" ? "بحث في المشاريع..." : "Search projects..."}
                className="h-10 w-full rounded-lg border-slate-200 bg-white ps-9 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              title={locale === "ar" ? "الفلاتر" : "Filters"}
              aria-label={locale === "ar" ? "الفلاتر" : "Filters"}
              className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <SlidersHorizontal className="size-4 shrink-0" />
              {activeFilterCount ? (
                <span className="absolute -end-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    title={locale === "ar" ? "ترتيب" : "Sort"}
                    aria-label={locale === "ar" ? "ترتيب" : "Sort"}
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <ArrowUpDown className="size-4 shrink-0 text-slate-600 dark:text-slate-400" />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                {[
                  { label: locale === "ar" ? "الترتيب الافتراضي" : "Default Sort", value: "default" },
                  { label: locale === "ar" ? "الاسم (أ-ي)" : "Name (A-Z)", value: "name-asc" },
                  { label: locale === "ar" ? "التقدم (الأعلى أولاً)" : "Progress (High to Low)", value: "progress-desc" },
                  { label: locale === "ar" ? "تاريخ البدء (الأحدث)" : "Start Date (Newest)", value: "date-desc" },
                ].map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={cn(sortBy === opt.value && "font-semibold text-primary")}
                  >
                    {opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-muted-foreground">
            <span>{mobileProjects.length} {mobileProjects.length === 1 ? (locale === "ar" ? "مشروع" : "Project") : (locale === "ar" ? "مشاريع" : "Projects")}</span>
            {hasSearchOrFilters ? (
              <button type="button" onClick={clearAllProjectListFilters} className="font-semibold text-primary hover:underline">
                {locale === "ar" ? "مسح الفلاتر" : "Clear Filters"}
              </button>
            ) : null}
          </div>

          {totalProjects === 0 ? (
            <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800"><Folder className="size-5" /></span>
              <h2 className="mt-3 text-sm font-semibold">{locale === "ar" ? "لا توجد مشاريع متاحة" : "No projects available"}</h2>
              <p className="mx-auto mt-1 max-w-[17rem] text-xs leading-4 text-muted-foreground">
                {locale === "ar" ? "لا توجد حالياً مشاريع تحت إشراف حسابك." : "No supervised projects are currently available for your account."}
              </p>
            </div>
          ) : mobileProjects.length === 0 ? (
            <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <Search className="mx-auto size-6 text-slate-400" />
              <h2 className="mt-3 text-sm font-semibold">{locale === "ar" ? "لا توجد مشاريع مطابقة للفلاتر" : "No projects match your filters."}</h2>
              <button type="button" onClick={clearAllProjectListFilters} className="mt-3 inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-primary shadow-xs dark:border-slate-800 dark:bg-slate-900">
                {locale === "ar" ? "مسح الفلاتر" : "Clear Filters"}
              </button>
            </div>
          ) : (
            <div className="grid min-w-0 gap-2">
              {mobileProjects.map((row) => (
                <MobileProjectCard
                  key={row.id}
                  row={row}
                  locale={locale}
                  canDeleteProjects={canDeleteProjects}
                  onLocation={() => setLocationTarget(row)}
                  onEdit={() => setEditTarget(row)}
                  onDelete={() => openDeleteDialog(row)}
                />
              ))}
            </div>
          )}

          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden">
              <SheetHeader className="pb-2">
                <SheetTitle>{locale === "ar" ? "الفلاتر" : "Filters"}</SheetTitle>
              </SheetHeader>
              <div className="grid gap-4 overflow-y-auto px-4 pb-2">
                <MobileFilterField label={locale === "ar" ? "الحالة" : "Status"}>
                  <DropdownFilter
                    label={locale === "ar" ? "كل الحالات" : "All Statuses"}
                    value={selectedStatus}
                    onChange={setSelectedStatus}
                    className="w-full"
                    options={[
                      { label: locale === "ar" ? "جميع الحالات" : "All Statuses", value: "all" },
                      ...PROJECT_STATUS_OPTIONS.map((status) => ({
                        label: locale === "ar" ? status.labelAr : status.label,
                        value: status.value,
                      })),
                    ]}
                  />
                </MobileFilterField>
                <MobileFilterField label={locale === "ar" ? "نوع المشروع" : "Project Type"}>
                  <DropdownFilter
                    label={locale === "ar" ? "كل الأنواع" : "All Types"}
                    value={selectedType}
                    onChange={setSelectedType}
                    className="w-full"
                    options={[
                      { label: locale === "ar" ? "كل الأنواع" : "All Types", value: "all" },
                      ...typeOptions.map((type) => ({ label: type, value: type })),
                    ]}
                  />
                </MobileFilterField>
                <MobileFilterField label={locale === "ar" ? "المالك / العميل" : "Owner / Client"}>
                  <DropdownFilter
                    label={locale === "ar" ? "كل العملاء" : "All Clients"}
                    value={selectedOwner}
                    onChange={setSelectedOwner}
                    className="w-full"
                    options={[
                      { label: locale === "ar" ? "كل العملاء" : "All Clients", value: "all" },
                      ...ownerOptions.map((owner) => ({ label: owner, value: owner })),
                    ]}
                  />
                </MobileFilterField>
              </div>
              <SheetFooter className="grid grid-cols-2 border-t pt-3">
                <Button type="button" variant="outline" className="h-10" onClick={clearAllProjectListFilters}>
                  {locale === "ar" ? "مسح" : "Clear"}
                </Button>
                <Button type="button" className="h-10" onClick={() => setFiltersOpen(false)}>
                  {locale === "ar" ? "تطبيق" : "Apply"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </section>
      ) : null}

      <div className={isMember ? "hidden md:flex md:flex-col md:gap-6" : "flex flex-col gap-6"}>
      {/* 4 Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Projects */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Folder className="size-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {locale === "ar" ? "إجمالي المشاريع" : "Total Projects"}
            </span>
            <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">{totalProjects}</span>
          </div>
        </div>

        {/* Card 2: Active Projects */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <PieChart className="size-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {locale === "ar" ? "المشاريع النشطة" : "Active Projects"}
            </span>
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{activeProjects}</span>
          </div>
        </div>

        {/* Card 3: Stopped */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <PauseCircle className="size-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {locale === "ar" ? "المتوقفة" : "Stopped"}
            </span>
            <span className="text-2xl font-extrabold text-red-600 dark:text-red-400">{stoppedProjects}</span>
          </div>
        </div>

        {/* Card 4: Completed */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {locale === "ar" ? "المكتملة" : "Completed"}
            </span>
            <span className="text-2xl font-extrabold text-purple-600 dark:text-purple-400">{completedProjects}</span>
          </div>
        </div>
      </div>

      {/* Header Row: All Projects & Action Buttons */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {locale === "ar" ? "جميع المشاريع" : "All Projects"}
        </h2>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Upload className="size-4 text-slate-500" />
            <span>{locale === "ar" ? "تصدير" : "Export"}</span>
          </button>

          {canCreateProjects ? (
            <Link
              href="/projects/new"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-blue-950 px-4 text-xs font-semibold text-white shadow-xs hover:bg-blue-900 active:bg-blue-950 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Plus className="size-4" />
              <span>{locale === "ar" ? "+ مشروع جديد" : "+ New Project"}</span>
            </Link>
          ) : null}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute inset-inline-start-3 start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={locale === "ar" ? "بحث في المشاريع..." : "Search projects..."}
            className="h-10 rounded-xl border-slate-200 bg-white ps-9 text-xs font-medium text-slate-900 placeholder:text-slate-400 shadow-2xs focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {/* Dropdown 1: Status */}
        <DropdownFilter
          label="Status"
          value={selectedStatus}
          onChange={setSelectedStatus}
          options={[
            { label: locale === "ar" ? "جميع الحالات" : "All Statuses", value: "all" },
            ...PROJECT_STATUS_OPTIONS.map((status) => ({
              label: locale === "ar" ? status.labelAr : status.label,
              value: status.value,
            })),
          ]}
        />

        {/* Dropdown 2: Project Type */}
        <DropdownFilter
          label="Project Type"
          value={selectedType}
          onChange={setSelectedType}
          options={[
            { label: "All Types", value: "all" },
            ...typeOptions.map((type) => ({ label: type, value: type })),
          ]}
        />

        {/* Dropdown 3: Supervisor */}
        <DropdownFilter
          label="Supervisor"
          value={selectedSupervisor}
          onChange={setSelectedSupervisor}
          options={[
            { label: "All Supervisors", value: "all" },
            ...supervisorOptionsForFilter.map((supervisor) => ({ label: supervisor, value: supervisor })),
            ...(hasUnassignedSupervisor ? [{ label: "Unassigned", value: "__unassigned__" }] : []),
          ]}
        />

        {/* Dropdown 4: Area / District */}
        <DropdownFilter
          label="Area / District"
          value={selectedAreaDistrict}
          onChange={setSelectedAreaDistrict}
          options={[
            { label: "All Areas", value: "all" },
            ...areaDistrictOptions.map((area) => ({ label: area, value: area })),
            ...(hasUnspecifiedArea ? [{ label: "Unspecified", value: "__unspecified__" }] : []),
          ]}
        />

        {/* Dropdown 5: Owner / Client */}
        <DropdownFilter
          label="Owner / Client"
          value={selectedOwner}
          onChange={setSelectedOwner}
          options={[
            { label: "All Clients", value: "all" },
            ...ownerOptions.map((owner) => ({ label: owner, value: owner })),
          ]}
        />

        {/* Dropdown 6: Sort By */}
        <DropdownFilter
          label="Sort By"
          value={sortBy}
          onChange={setSortBy}
          options={[
            { label: "Default Sort", value: "default" },
            { label: "Name (A-Z)", value: "name-asc" },
            { label: "Progress (High to Low)", value: "progress-desc" },
            { label: "Start Date (Newest)", value: "date-desc" },
            { label: "Supervisor A–Z", value: "supervisor-asc" },
            { label: "Supervisor Z–A", value: "supervisor-desc" },
            { label: "Area / District A–Z", value: "area-asc" },
            { label: "Area / District Z–A", value: "area-desc" },
          ]}
        />

        <Button
          type="button"
          variant="outline"
          onClick={clearAllProjectListFilters}
          disabled={!hasSearchOrFilters}
          className="h-10 rounded-xl border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 disabled:cursor-default disabled:opacity-45 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          {locale === "ar" ? "مسح الفلاتر" : "Clear Filters"}
        </Button>
      </div>

      {/* Main Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1040px] table-fixed text-start text-sm">
            <colgroup>
              {PROJECT_TABLE_COLUMN_WIDTHS.map((width, index) => (
                <col key={`${width}-${index}`} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="truncate px-3 py-3.5 text-start align-middle font-semibold">Project</th>
                <th className="truncate px-2.5 py-3.5 text-start align-middle font-semibold">Owner / Client</th>
                <th className="truncate px-2.5 py-3.5 text-start align-middle font-semibold">Supervisor</th>
                <th className="truncate px-2.5 py-3.5 text-start align-middle font-semibold" title="Supervision Type">Supervision Type</th>
                <th className="truncate px-2.5 py-3.5 text-start align-middle font-semibold">Area / District</th>
                <th className="truncate px-2.5 py-3.5 text-start align-middle font-semibold">Project Type</th>
                <th className="truncate px-2 py-3.5 text-center align-middle font-semibold">Status</th>
                <th className="truncate px-2 py-3.5 text-center align-middle font-semibold">Start Date</th>
                <th className="truncate px-2.5 py-3.5 text-start align-middle font-semibold">Progress</th>
                <th className="truncate px-1.5 py-3.5 text-end align-middle font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {desktopProjects.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    {locale === "ar" ? "لا توجد مشاريع مطابقة." : "No matching projects found."}
                  </td>
                </tr>
              )}
              {paginatedDesktopProjects.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  {/* Project info with thumbnail */}
                  <td className="min-w-0 overflow-hidden px-3 py-4 align-middle">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ProjectImageDisplay
                        src={row.imageUrl}
                        projectId={row.id}
                        alt={row.name}
                        className="size-10 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700"
                        iconClassName="size-4"
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <Link
                          href={`/projects/${encodeURIComponent(row.id)}`}
                          className="block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                          <TruncatedText className="cursor-pointer text-sm font-bold text-slate-900 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
                            {row.name}
                          </TruncatedText>
                        </Link>
                        <span className="block truncate font-mono text-xs text-slate-400" title={row.code}>{row.code}</span>
                      </div>
                    </div>
                  </td>

                  {/* Owner / Client */}
                  <td className="min-w-0 overflow-hidden px-2.5 py-4 align-middle text-xs font-medium text-slate-700 dark:text-slate-300">
                    <TruncatedText>{row.ownerClient}</TruncatedText>
                  </td>

                  {/* Supervisor */}
                  <td className="min-w-0 overflow-hidden px-2.5 py-4 align-middle text-xs font-medium text-slate-700 dark:text-slate-300">
                    <TruncatedText className={row.assignedSupervisorId ? undefined : "text-slate-400 dark:text-slate-500"}>
                      {row.assignedSupervisorId ? (row.supervisorName?.trim() || "Assigned Supervisor") : "Unassigned"}
                    </TruncatedText>
                  </td>

                  {/* Supervision Type */}
                  <td className="min-w-0 overflow-hidden px-2.5 py-4 align-middle text-xs font-medium text-slate-700 dark:text-slate-300">
                    <TruncatedText>
                      {row.supervisionType?.trim()
                        ? supervisionTypeLabel(row.supervisionType, row.supervisionTypeOther)
                        : "Not set"}
                    </TruncatedText>
                  </td>

                  {/* Area / District + Location */}
                  <td className="min-w-0 overflow-hidden px-2.5 py-4 align-middle">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className="min-w-0 shrink">
                        <TruncatedText className={cn("text-xs font-medium text-slate-700 dark:text-slate-300", !row.areaDistrict?.trim() && "text-slate-400 dark:text-slate-500")}>
                          {row.areaDistrict?.trim() || "—"}
                        </TruncatedText>
                      </div>
                      {(() => {
                        const hasAddress = row.address.trim().length > 0 && row.address.trim() !== "—"
                        const hasCoordinates =
                          Number.isFinite(row.latitude) &&
                          Number.isFinite(row.longitude) &&
                          Number(row.latitude) >= -90 &&
                          Number(row.latitude) <= 90 &&
                          Number(row.longitude) >= -180 &&
                          Number(row.longitude) <= 180
                        const hasLocation = hasAddress || hasCoordinates
                        const locationLabel = locale === "ar" ? "عرض موقع المشروع" : "View project location"

                        return (
                          <Tooltip>
                            <TooltipTrigger render={<span className="inline-flex shrink-0 rounded-lg" />}>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="outline"
                                disabled={!hasLocation}
                                onClick={() => hasLocation && setLocationTarget(row)}
                                aria-label={locationLabel}
                                className="size-7 shrink-0 rounded-lg border-slate-200 text-slate-500 shadow-2xs hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
                              >
                                <MapPin className="size-3.5" aria-hidden="true" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {hasLocation
                                ? locationLabel
                                : locale === "ar"
                                  ? "موقع المشروع غير متاح"
                                  : "Project location unavailable"}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })()}
                    </div>
                  </td>

                  {/* Project Type */}
                  <td className="min-w-0 overflow-hidden px-2.5 py-4 align-middle text-xs text-slate-600 dark:text-slate-400">
                    <TruncatedText>{row.projectType}</TruncatedText>
                  </td>

                  {/* Status Badge */}
                  <td className="min-w-0 overflow-hidden px-2 py-4 text-center align-middle">
                    <div className="flex min-w-0 items-center justify-center overflow-hidden">
                      <ProjectStatusBadge status={row.status} />
                    </div>
                  </td>

                  {/* Start Date */}
                  <td className="min-w-0 overflow-hidden px-2 py-4 text-center align-middle text-xs text-slate-600 dark:text-slate-400">
                    <TruncatedText className="text-center">{row.startDate}</TruncatedText>
                  </td>

                  {/* Progress bar */}
                  <td className="min-w-0 overflow-hidden px-2.5 py-4 align-middle">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {row.progress}%
                      </span>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-1.5 rounded-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${row.progress}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="overflow-hidden px-2 py-4 text-end align-middle">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            type="button"
                            aria-label={`Actions for ${row.name}`}
                            className="inline-flex size-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          render={
                            <Link href={`/projects/${row.id}`}>
                              <Eye className="size-4" />
                              {locale === "ar" ? "عرض المشروع" : "View Project"}
                            </Link>
                          }
                        />
                        {row.canEdit ? (
                          <DropdownMenuItem onClick={() => setEditTarget(row)}>
                            <Pencil className="size-4" />
                            {locale === "ar" ? "تعديل المشروع" : "Edit Project"}
                          </DropdownMenuItem>
                        ) : null}
                        {canDeleteProjects ? (
                          <DropdownMenuItem variant="destructive" onClick={() => openDeleteDialog(row)}>
                            <Trash2 className="size-4" />
                            {locale === "ar" ? "حذف المشروع" : "Delete Project"}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="flex flex-col gap-3 border-t border-slate-200/80 px-5 py-3.5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Showing {desktopProjects.length === 0 ? 0 : desktopPageStart + 1} to {Math.min(desktopPageStart + pageSize, desktopProjects.length)} of {desktopProjects.length} projects
          </span>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-default disabled:opacity-40 dark:border-slate-800 dark:hover:bg-slate-800"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </button>

              {desktopPageNumbers.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  aria-current={safeCurrentPage === page ? "page" : undefined}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-lg text-xs font-medium",
                    safeCurrentPage === page
                      ? "bg-blue-950 font-bold text-white dark:bg-blue-600"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                  )}
                >
                  {page}
                </button>
              ))}

              <button
                type="button"
                disabled={safeCurrentPage >= desktopPageCount}
                onClick={() => setCurrentPage((page) => Math.min(desktopPageCount, page + 1))}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-default disabled:opacity-40 dark:border-slate-800 dark:hover:bg-slate-800"
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <span>{pageSize} / page</span>
                    <ChevronDown className="size-3 text-slate-400" />
                  </button>
                }
              />
              <DropdownMenuContent align="end">
                {[10, 20, 50].map((size) => (
                  <DropdownMenuItem key={size} onClick={() => setPageSize(size)}>{size} / page</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      </div>

      {locationTarget ? (
        <ProjectLocationPreviewDialog
          key={locationTarget.id}
          project={locationTarget}
          onOpenChange={(open) => {
            if (!open) setLocationTarget(null)
          }}
        />
      ) : null}

      {editTarget ? (
        <ProjectEditDialog
          key={editTarget.id}
          project={{ ...editTarget, projectTypeLabel: editTarget.projectType }}
          locale={locale}
          supervisorOptions={supervisorOptions}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setProjectRows((current) => current.map((project) => (
              project.id === updated.id
                ? {
                    ...project,
                    name: updated.name,
                    code: updated.code,
                    address: updated.address,
                    areaDistrict: updated.areaDistrict,
                    projectType: updated.projectTypeLabel as ProjectType | "—",
                    projectTypeValue: updated.projectTypeValue,
                    supervisionType: updated.supervisionType,
                    supervisionTypeOther: updated.supervisionTypeOther,
                    supervisionStartDate: updated.supervisionStartDate,
                    status: normalizeProjectStatus(updated.status),
                    description: updated.description,
                    latitude: updated.latitude,
                    longitude: updated.longitude,
                    assignedSupervisorId: updated.assignedSupervisorId,
                    supervisorName: updated.assignedSupervisorId
                      ? supervisorOptions.find((candidate) => candidate.id === updated.assignedSupervisorId)?.name ?? "Assigned Supervisor"
                      : null,
                  }
                : project
            )))
            setEditTarget(null)
            setNotice(locale === "ar" ? "تم تحديث المشروع بنجاح." : "Project updated successfully.")
            router.refresh()
          }}
        />
      ) : null}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletePending) {
            setDeleteTarget(null)
            setDeletionImpact(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!deletePending}>
          <DialogHeader>
            <div className="flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <AlertTriangle className="size-5" />
            </div>
            <DialogTitle>
              {locale === "ar" ? "حذف المشروع" : "Delete Project"}
            </DialogTitle>
            <DialogDescription className="text-pretty">
              {locale === "ar"
                ? `هل أنت متأكد من رغبتك في حذف مشروع ${deleteTarget?.name ?? ""}؟ لا يمكن التراجع عن هذا الإجراء.`
                : `Are you sure you want to delete ${deleteTarget?.name ?? "this project"}? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            {impactPending ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="size-4 animate-spin" />
                {locale === "ar" ? "جارٍ فحص البيانات المرتبطة..." : "Checking related project data..."}
              </div>
            ) : deletionImpact ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {locale === "ar" ? "البيانات التي سيتم حذفها" : "Related records to be deleted"}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <ImpactRow label={locale === "ar" ? "المراحل" : "Stages"} value={deletionImpact.stages} />
                  <ImpactRow label={locale === "ar" ? "البنود" : "Terms"} value={deletionImpact.terms} />
                  <ImpactRow label={locale === "ar" ? "الفحوصات" : "Inspections"} value={deletionImpact.inspections} />
                  <ImpactRow label={locale === "ar" ? "المراسلات" : "Letters"} value={deletionImpact.documents} />
                  <ImpactRow label={locale === "ar" ? "المستندات" : "Documents"} value={deletionImpact.initialDocuments} />
                  <ImpactRow label={locale === "ar" ? "الترجمات" : "Translations"} value={deletionImpact.translations} />
                  <ImpactRow label={locale === "ar" ? "المشاركون" : "Participants"} value={deletionImpact.participants} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {locale === "ar"
                  ? "تعذر تحميل ملخص البيانات المرتبطة. لن يتم الحذف دون تحقق الخادم مرة أخرى."
                  : "The related-data summary could not be loaded. The server will verify it again before deletion."}
              </p>
            )}
          </div>

          {deleteError ? <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="bg-transparent"
              disabled={deletePending}
              onClick={() => {
                setDeleteTarget(null)
                setDeletionImpact(null)
                setDeleteError(null)
              }}
            >
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" variant="destructive" disabled={deletePending || impactPending} onClick={confirmDelete}>
              {deletePending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Trash2 className="size-4" data-icon="inline-start" />}
              {locale === "ar" ? "حذف المشروع" : "Delete Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MobileProjectMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "blue" | "green" | "red" | "violet"
}) {
  const tones = {
    blue: "border-blue-100 bg-blue-50/70 dark:border-blue-950 dark:bg-blue-950/25",
    green: "border-emerald-100 bg-emerald-50/70 dark:border-emerald-950 dark:bg-emerald-950/25",
    red: "border-red-100 bg-red-50/70 dark:border-red-950 dark:bg-red-950/25",
    violet: "border-violet-100 bg-violet-50/70 dark:border-violet-950 dark:bg-violet-950/25",
  }

  return (
    <div className={cn("min-w-0 rounded-lg border px-1 py-2 text-center", tones[tone])}>
      <span className="block truncate text-[9px] font-medium leading-3 text-muted-foreground">{label}</span>
      <span className="mt-0.5 block text-base font-extrabold leading-5 tabular-nums text-slate-950 dark:text-white">{value}</span>
    </div>
  )
}

function MobileFilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </div>
  )
}

function MobileProjectCard({
  row,
  locale,
  canDeleteProjects,
  onLocation,
  onEdit,
  onDelete,
}: {
  row: ProjectRow
  locale: string
  canDeleteProjects: boolean
  onLocation?: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const supervision = row.supervisionType?.trim()
    ? supervisionTypeLabel(row.supervisionType, row.supervisionTypeOther)
    : locale === "ar" ? "غير محدد" : "Not set"

  const formattedName = capitalizeWords(row.name)

  return (
    <article className="relative min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card p-3 shadow-2xs transition-colors hover:border-primary/40">
      <div className="flex items-center gap-3">
        {/* Left: Building icon / Image container */}
        <Link
          href={`/projects/${encodeURIComponent(row.id)}`}
          className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/40 text-primary transition-opacity hover:opacity-90"
        >
          {row.imageUrl ? (
            <img src={row.imageUrl} alt={formattedName} className="size-full object-cover" />
          ) : (
            <Building2 className="size-6 text-primary" aria-hidden="true" />
          )}
        </Link>

        {/* Center: Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/projects/${encodeURIComponent(row.id)}`}
              className="group min-w-0 flex-1"
            >
              <h2 className="truncate text-sm font-bold leading-tight text-foreground group-hover:text-primary">
                {formattedName}
              </h2>
            </Link>
            <div className="flex items-center gap-1 shrink-0">
              <ProjectStatusBadge status={row.status} />

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`${locale === "ar" ? "إجراءات" : "Actions for"} ${formattedName}`}
                      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>
                  }
                />
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    render={
                      <Link href={`/projects/${row.id}`}>
                        <Eye className="size-4" />
                        {locale === "ar" ? "عرض المشروع" : "View Project"}
                      </Link>
                    }
                  />
                  <DropdownMenuItem
                    render={
                      <Link href={`/projects/${row.id}/stages`}>
                        <Plus className="size-4" />
                        {locale === "ar" ? "إضافة تقرير" : "Add Report"}
                      </Link>
                    }
                  />
                  {row.canEdit ? (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="size-4" />
                      {locale === "ar" ? "تعديل المشروع" : "Edit Project"}
                    </DropdownMenuItem>
                  ) : null}
                  {canDeleteProjects ? (
                    <DropdownMenuItem variant="destructive" onClick={onDelete}>
                      <Trash2 className="size-4" />
                      {locale === "ar" ? "حذف المشروع" : "Delete Project"}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {row.code ? (
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {row.code}
            </p>
          ) : null}
      </div>

      {/* Action Row: Add Report button */}
      <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-2.5 dark:border-slate-800/80">
        <Link
          href={`/projects/${encodeURIComponent(row.id)}/stages`}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 active:scale-[0.98]"
        >
          <Plus className="size-3.5" />
          <span>{locale === "ar" ? "إضافة تقرير" : "Add Report"}</span>
        </Link>
      </div>
    </article>
  )
}

function ImpactRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function DropdownFilter({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (val: string) => void
  options: { label: string; value: string }[]
  className?: string
}) {
  const selectedObj = options.find((o) => o.value === value)
  const displayLabel = value === "all" ? label : selectedObj?.label ?? label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn("inline-flex h-10 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300", className)}
          >
            <span className="min-w-0 truncate">{displayLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="w-44">
        {options.map((opt) => (
          <DropdownMenuItem key={opt.value} onClick={() => onChange(opt.value)}>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { locale } = useI18n()

  return (
    <Badge
      variant="outline"
      className={cn("h-6 rounded-md px-2 text-[11px] font-medium shadow-none", PROJECT_STATUS_BADGE_CLASS[status])}
    >
      {projectStatusLabel(status, locale === "ar")}
    </Badge>
  )
}
