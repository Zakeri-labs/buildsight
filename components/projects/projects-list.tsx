"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
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
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type ProjectStatus = "In Progress" | "Planning" | "On Hold" | "Completed"
export type OrgRole = "Consultant" | "Contractor" | "Client" | "Government" | "Third Party"
export type ProjectType = "Residential" | "Commercial" | "Hospitality" | "Infrastructure" | "Industrial"

export interface ProjectRow {
  id: string
  code: string
  name: string
  ownerClient: string
  orgRole: OrgRole
  address: string
  projectType: ProjectType | "—"
  status: ProjectStatus
  startDate: string
  progress: number
  imageUrl: string
}

const mockProjects: ProjectRow[] = [
  {
    id: "1",
    code: "PRJ-001",
    name: "Sunset Residential Tower",
    ownerClient: "Sunset Development",
    orgRole: "Consultant",
    address: "Muscat, Al Khuwair",
    projectType: "Residential",
    status: "In Progress",
    startDate: "May 10, 2024",
    progress: 62,
    imageUrl: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "2",
    code: "PRJ-002",
    name: "Greenfield Office Complex",
    ownerClient: "Greenfield LLC",
    orgRole: "Consultant",
    address: "Muscat, Ghala",
    projectType: "Commercial",
    status: "In Progress",
    startDate: "Apr 02, 2024",
    progress: 45,
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "3",
    code: "PRJ-003",
    name: "Harbor View Hotel",
    ownerClient: "Harbor Hotels",
    orgRole: "Contractor",
    address: "Sohar, Corniche Road",
    projectType: "Hospitality",
    status: "In Progress",
    startDate: "Jun 01, 2024",
    progress: 58,
    imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "4",
    code: "PRJ-004",
    name: "City Center Mall",
    ownerClient: "City Center Holdings",
    orgRole: "Consultant",
    address: "Muscat, Seeb",
    projectType: "Commercial",
    status: "Planning",
    startDate: "Jul 01, 2024",
    progress: 18,
    imageUrl: "https://images.unsplash.com/photo-1519999482648-25049ddd37b1?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "5",
    code: "PRJ-005",
    name: "Airport Road Bridge",
    ownerClient: "Oman Transport Authority",
    orgRole: "Client",
    address: "Muscat, Airport Road",
    projectType: "Infrastructure",
    status: "On Hold",
    startDate: "Mar 14, 2024",
    progress: 35,
    imageUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "6",
    code: "PRJ-006",
    name: "Al Raha Beach Villas",
    ownerClient: "Al Raha Properties",
    orgRole: "Consultant",
    address: "Muscat, Qurum",
    projectType: "Residential",
    status: "In Progress",
    startDate: "Feb 09, 2024",
    progress: 71,
    imageUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "7",
    code: "PRJ-007",
    name: "Muscat Industrial Park",
    ownerClient: "Industrial Dev. Co.",
    orgRole: "Government",
    address: "Muscat, Rusayl",
    projectType: "Industrial",
    status: "Completed",
    startDate: "Sep 03, 2023",
    progress: 100,
    imageUrl: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "8",
    code: "PRJ-008",
    name: "Al Mouj Marina",
    ownerClient: "Al Mouj LLC",
    orgRole: "Third Party",
    address: "Muscat, Al Mouj",
    projectType: "Infrastructure",
    status: "Planning",
    startDate: "Aug 12, 2024",
    progress: 8,
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=120&q=80",
  },
]

export function ProjectsList({
  projects = mockProjects,
  createdProjectId,
}: {
  projects?: ProjectRow[]
  createdProjectId?: string
}) {
  const { locale } = useI18n()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedType, setSelectedType] = useState("all")
  const [selectedOwner, setSelectedOwner] = useState("all")
  const [sortBy, setSortBy] = useState("default")

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
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
  }, [projects, searchQuery, selectedStatus, selectedType, selectedOwner])

  const totalProjects = projects.length
  const activeProjects = projects.filter((project) => project.status === "In Progress").length
  const onHoldProjects = projects.filter((project) => project.status === "On Hold").length
  const completedProjects = projects.filter((project) => project.status === "Completed").length
  const typeOptions = Array.from(new Set(projects.map((project) => project.projectType).filter((type) => type !== "—")))
  const ownerOptions = Array.from(new Set(projects.map((project) => project.ownerClient).filter((owner) => owner !== "—")))
  const createdProject = createdProjectId ? projects.find((project) => project.id === createdProjectId) : undefined

  return (
    <div className="flex flex-col gap-6 font-sans">
      {createdProjectId && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          {locale === "ar"
            ? `تم إنشاء المشروع ${createdProject?.name ?? ""} بنجاح.`
            : `Project ${createdProject?.name ?? ""} was created successfully.`}
        </div>
      )}

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

        {/* Card 3: On Hold */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <PauseCircle className="size-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {locale === "ar" ? "المتوقفة مؤقتاً" : "On Hold"}
            </span>
            <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{onHoldProjects}</span>
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

          <Link
            href="/projects/new"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-blue-950 px-4 text-xs font-semibold text-white shadow-xs hover:bg-blue-900 active:bg-blue-950 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <Plus className="size-4" />
            <span>{locale === "ar" ? "+ مشروع جديد" : "+ New Project"}</span>
          </Link>
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
            { label: "All Statuses", value: "all" },
            { label: "In Progress", value: "In Progress" },
            { label: "Planning", value: "Planning" },
            { label: "On Hold", value: "On Hold" },
            { label: "Completed", value: "Completed" },
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

        {/* Dropdown 3: Owner / Client */}
        <DropdownFilter
          label="Owner / Client"
          value={selectedOwner}
          onChange={setSelectedOwner}
          options={[
            { label: "All Clients", value: "all" },
            ...ownerOptions.map((owner) => ({ label: owner, value: owner })),
          ]}
        />

        {/* Dropdown 4: Sort By */}
        <DropdownFilter
          label="Sort By"
          value={sortBy}
          onChange={setSortBy}
          options={[
            { label: "Default Sort", value: "default" },
            { label: "Name (A-Z)", value: "name-asc" },
            { label: "Progress (High to Low)", value: "progress-desc" },
            { label: "Start Date (Newest)", value: "date-desc" },
          ]}
        />
      </div>

      {/* Main Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="px-5 py-3.5 text-start font-semibold">Project</th>
                <th className="px-4 py-3.5 text-start font-semibold">Owner / Client</th>
                <th className="px-4 py-3.5 text-start font-semibold">Organization Role</th>
                <th className="px-4 py-3.5 text-start font-semibold">Address</th>
                <th className="px-4 py-3.5 text-start font-semibold">Project Type</th>
                <th className="px-4 py-3.5 text-start font-semibold">Status</th>
                <th className="px-4 py-3.5 text-start font-semibold">Start Date</th>
                <th className="px-4 py-3.5 text-start font-semibold">Progress</th>
                <th className="px-4 py-3.5 text-end font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    {locale === "ar" ? "لا توجد مشاريع مطابقة." : "No matching projects found."}
                  </td>
                </tr>
              )}
              {filteredProjects.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  {/* Project info with thumbnail */}
                  <td className="whitespace-nowrap px-5 py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={row.imageUrl}
                        alt={row.name}
                        className="size-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white text-sm hover:text-blue-600 cursor-pointer">
                          {row.name}
                        </span>
                        <span className="font-mono text-xs text-slate-400">{row.code}</span>
                      </div>
                    </div>
                  </td>

                  {/* Owner / Client */}
                  <td className="whitespace-nowrap px-4 py-4 text-xs font-medium text-slate-700 dark:text-slate-300">
                    {row.ownerClient}
                  </td>

                  {/* Organization Role */}
                  <td className="whitespace-nowrap px-4 py-4">
                    <OrgRoleBadge role={row.orgRole} />
                  </td>

                  {/* Address */}
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600 dark:text-slate-400">
                    {row.address}
                  </td>

                  {/* Project Type */}
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600 dark:text-slate-400">
                    {row.projectType}
                  </td>

                  {/* Status Badge */}
                  <td className="whitespace-nowrap px-4 py-4">
                    <ProjectStatusBadge status={row.status} />
                  </td>

                  {/* Start Date */}
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600 dark:text-slate-400">
                    {row.startDate}
                  </td>

                  {/* Progress bar */}
                  <td className="whitespace-nowrap px-4 py-4">
                    <div className="flex flex-col gap-1.5 min-w-[100px]">
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
                  <td className="whitespace-nowrap px-4 py-4 text-end">
                    <button
                      type="button"
                      className="inline-flex size-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="flex flex-col gap-3 border-t border-slate-200/80 px-5 py-3.5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Showing {filteredProjects.length === 0 ? 0 : 1} to {filteredProjects.length} of {totalProjects} projects
          </span>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="size-4" />
              </button>

              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-lg bg-blue-950 text-xs font-bold text-white dark:bg-blue-600"
              >
                1
              </button>

              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                2
              </button>

              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:hover:bg-slate-800"
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
                    <span>10 / page</span>
                    <ChevronDown className="size-3 text-slate-400" />
                  </button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem>10 / page</DropdownMenuItem>
                <DropdownMenuItem>20 / page</DropdownMenuItem>
                <DropdownMenuItem>50 / page</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}

function DropdownFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (val: string) => void
  options: { label: string; value: string }[]
}) {
  const selectedObj = options.find((o) => o.value === value)
  const displayLabel = value === "all" ? label : selectedObj?.label ?? label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex h-10 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span>{displayLabel}</span>
            <ChevronDown className="size-3.5 text-slate-400" />
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

function OrgRoleBadge({ role }: { role: OrgRole }) {
  const styles: Record<OrgRole, string> = {
    Consultant: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
    Contractor: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
    Client: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
    Government: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400",
    "Third Party": "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400",
  }

  return (
    <span className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium", styles[role])}>
      {role}
    </span>
  )
}

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const styles: Record<ProjectStatus, string> = {
    "In Progress": "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
    Planning: "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400",
    "On Hold": "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
    Completed: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
  }

  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium", styles[status])}>
      {status}
    </span>
  )
}
