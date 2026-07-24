"use client"

import { useMemo, useState } from "react"
import {
  Search,
  Plus,
  Upload,
  MoreVertical,
  ClipboardCheck,
  Clock,
  FilePlus,
  Timer,
  ArrowUpRight,
  ArrowDownRight,
  Calendar as CalendarIcon,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export type DocumentCategory =
  | "all"
  | "ncr"
  | "inspections"
  | "rfi"
  | "vo"
  | "submittals"
  | "drawings"
  | "general"

interface DocumentRow {
  id: string
  reference: string
  title: string
  type: "NCR" | "Inspection" | "RFI" | "VO" | "Submittal" | "Drawing" | "General Document"
  categoryKey: DocumentCategory
  originatingOrg: string
  assignedTo: {
    name: string
    avatar: string
    initials: string
  }
  status: "Open" | "In Review" | "Waiting Response" | "Approved" | "Closed" | "Overdue"
  dueDate: string
  lastUpdate: string
}

const documentData: DocumentRow[] = [
  {
    id: "1",
    reference: "NCR-1021",
    title: "Concrete cover deficiency",
    type: "NCR",
    categoryKey: "ncr",
    originatingOrg: "BuildCore Engineering",
    assignedTo: { name: "Arman H.", avatar: "/avatars/arman.png", initials: "AH" },
    status: "Open",
    dueDate: "May 28, 2025",
    lastUpdate: "May 23, 2025 10:15 AM",
  },
  {
    id: "2",
    reference: "INS-2048",
    title: "Rebar installation check",
    type: "Inspection",
    categoryKey: "inspections",
    originatingOrg: "Prime Inspectors",
    assignedTo: { name: "Leena K.", avatar: "/avatars/leena.png", initials: "LK" },
    status: "In Review",
    dueDate: "May 30, 2025",
    lastUpdate: "May 23, 2025 09:45 AM",
  },
  {
    id: "3",
    reference: "RFI-3095",
    title: "Ceiling detail clarification",
    type: "RFI",
    categoryKey: "rfi",
    originatingOrg: "Design Axis LLC",
    assignedTo: { name: "Mohammed S.", avatar: "/avatars/mohammed.png", initials: "MS" },
    status: "Waiting Response",
    dueDate: "May 26, 2025",
    lastUpdate: "May 22, 2025 04:20 PM",
  },
  {
    id: "4",
    reference: "VO-0105",
    title: "Additional waterproofing works",
    type: "VO",
    categoryKey: "vo",
    originatingOrg: "ConstructPro",
    assignedTo: { name: "Arman H.", avatar: "/avatars/arman.png", initials: "AH" },
    status: "In Review",
    dueDate: "Jun 01, 2025",
    lastUpdate: "May 22, 2025 11:30 AM",
  },
  {
    id: "5",
    reference: "SUB-0771",
    title: "MEP shop drawing package",
    type: "Submittal",
    categoryKey: "submittals",
    originatingOrg: "MEP Solutions Co.",
    assignedTo: { name: "Nadine R.", avatar: "/avatars/nadine.png", initials: "NR" },
    status: "Approved",
    dueDate: "May 20, 2025",
    lastUpdate: "May 21, 2025 03:10 PM",
  },
  {
    id: "6",
    reference: "DRW-0208",
    title: "Structural slab drawing revision",
    type: "Drawing",
    categoryKey: "drawings",
    originatingOrg: "Design Axis LLC",
    assignedTo: { name: "Leena K.", avatar: "/avatars/leena.png", initials: "LK" },
    status: "Approved",
    dueDate: "May 18, 2025",
    lastUpdate: "May 20, 2025 02:05 PM",
  },
  {
    id: "7",
    reference: "DOC-1104",
    title: "Site progress photos",
    type: "General Document",
    categoryKey: "general",
    originatingOrg: "BuildCore Engineering",
    assignedTo: { name: "Arman H.", avatar: "/avatars/arman.png", initials: "AH" },
    status: "Closed",
    dueDate: "May 15, 2025",
    lastUpdate: "May 19, 2025 05:40 PM",
  },
  {
    id: "8",
    reference: "NCR-1033",
    title: "Waterproofing membrane issue",
    type: "NCR",
    categoryKey: "ncr",
    originatingOrg: "Prime Inspectors",
    assignedTo: { name: "Mohammed S.", avatar: "/avatars/mohammed.png", initials: "MS" },
    status: "Overdue",
    dueDate: "May 16, 2025",
    lastUpdate: "May 18, 2025 11:25 AM",
  },
]

const tabList: { key: DocumentCategory; label: string; count: number }[] = [
  { key: "all", label: "All", count: 1248 },
  { key: "ncr", label: "NCR", count: 186 },
  { key: "inspections", label: "Inspections", count: 214 },
  { key: "rfi", label: "RFI", count: 152 },
  { key: "vo", label: "VO", count: 89 },
  { key: "submittals", label: "Submittals", count: 198 },
  { key: "drawings", label: "Drawings", count: 163 },
  { key: "general", label: "General Docs", count: 246 },
]

export function DocumentsList() {
  const { locale } = useI18n()
  const [activeTab, setActiveTab] = useState<DocumentCategory>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedOrg, setSelectedOrg] = useState("all")
  const [selectedUser, setSelectedUser] = useState("all")
  const [overdueOnly, setOverdueOnly] = useState(false)

  const filteredData = useMemo(() => {
    return documentData.filter((item) => {
      if (activeTab !== "all" && item.categoryKey !== activeTab) return false
      if (
        searchQuery &&
        !item.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !item.reference.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false
      }
      if (selectedStatus !== "all" && item.status.toLowerCase() !== selectedStatus.toLowerCase()) return false
      if (selectedOrg !== "all" && item.originatingOrg !== selectedOrg) return false
      if (selectedUser !== "all" && item.assignedTo.name !== selectedUser) return false
      if (overdueOnly && item.status !== "Overdue") return false
      return true
    })
  }, [activeTab, searchQuery, selectedStatus, selectedOrg, selectedUser, overdueOnly])

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* 4 Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Pending Approvals */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            <ClipboardCheck className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {locale === "ar" ? "الموافقات المعلقة" : "Pending Approvals"}
            </span>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">24</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="size-3.5" />
              12% {locale === "ar" ? "مقارنة بالأسبوع الماضي" : "vs last week"}
            </span>
          </div>
        </div>

        {/* Card 2: Overdue Records */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <Clock className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {locale === "ar" ? "السجلات المتأخرة" : "Overdue Records"}
            </span>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">8</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
              <ArrowUpRight className="size-3.5" />
              33% {locale === "ar" ? "مقارنة بالأسبوع الماضي" : "vs last week"}
            </span>
          </div>
        </div>

        {/* Card 3: New This Week */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <FilePlus className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {locale === "ar" ? "الجديد هذا الأسبوع" : "New This Week"}
            </span>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">32</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <ArrowUpRight className="size-3.5" />
              18% {locale === "ar" ? "مقارنة بالأسبوع الماضي" : "vs last week"}
            </span>
          </div>
        </div>

        {/* Card 4: Avg Response Time */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
            <Timer className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {locale === "ar" ? "متوسط وقت الاستجابة" : "Avg Response Time"}
            </span>
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">1.8 days</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <ArrowDownRight className="size-3.5" />
              0.3 days {locale === "ar" ? "مقارنة بالأسبوع الماضي" : "vs last week"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs and Action Buttons Row */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-0.5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        {/* Tabs Bar */}
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          {tabList.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap pb-3 text-sm transition-colors",
                  isActive
                    ? "font-bold text-blue-600 dark:text-blue-400"
                    : "font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                  )}
                >
                  {tab.count}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                )}
              </button>
            )
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pb-3 sm:pb-0 shrink-0">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Upload className="size-4 text-slate-500" />
            <span>{locale === "ar" ? "تصدير" : "Export"}</span>
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 active:bg-blue-800"
          >
            <Plus className="size-4" />
            <span>{locale === "ar" ? "إنشاء مستند" : "Create Document"}</span>
          </button>
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
            placeholder={locale === "ar" ? "بحث در اسناد..." : "Search documents"}
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
            { label: "Open", value: "open" },
            { label: "In Review", value: "in review" },
            { label: "Waiting Response", value: "waiting response" },
            { label: "Approved", value: "approved" },
            { label: "Closed", value: "closed" },
            { label: "Overdue", value: "overdue" },
          ]}
        />

        {/* Dropdown 2: Organization */}
        <DropdownFilter
          label="Organization"
          value={selectedOrg}
          onChange={setSelectedOrg}
          options={[
            { label: "All Organizations", value: "all" },
            { label: "BuildCore Engineering", value: "BuildCore Engineering" },
            { label: "Prime Inspectors", value: "Prime Inspectors" },
            { label: "Design Axis LLC", value: "Design Axis LLC" },
            { label: "ConstructPro", value: "ConstructPro" },
            { label: "MEP Solutions Co.", value: "MEP Solutions Co." },
          ]}
        />

        {/* Dropdown 3: Assigned User */}
        <DropdownFilter
          label="Assigned User"
          value={selectedUser}
          onChange={setSelectedUser}
          options={[
            { label: "All Users", value: "all" },
            { label: "Arman H.", value: "Arman H." },
            { label: "Leena K.", value: "Leena K." },
            { label: "Mohammed S.", value: "Mohammed S." },
            { label: "Nadine R.", value: "Nadine R." },
          ]}
        />

        {/* Date Selector */}
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          <CalendarIcon className="size-4 text-slate-400" />
          <span>May 18, 2025 - May 24, 2025</span>
          <ChevronDown className="size-3.5 text-slate-400 ms-1" />
        </button>

        {/* Overdue Switch */}
        <div className="flex items-center gap-2.5 ms-auto">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Overdue Only</span>
          <button
            type="button"
            role="switch"
            aria-checked={overdueOnly}
            onClick={() => setOverdueOnly(!overdueOnly)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-hidden",
              overdueOnly ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out my-0.5",
                overdueOnly ? "translate-x-4.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="px-5 py-3.5 text-start font-semibold">
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    <span>Reference</span>
                    <ChevronsUpDown className="size-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5 text-start font-semibold">Title</th>
                <th className="px-4 py-3.5 text-start font-semibold">
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    <span>Type</span>
                    <ChevronsUpDown className="size-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5 text-start font-semibold">Originating Organization</th>
                <th className="px-4 py-3.5 text-start font-semibold">Assigned To</th>
                <th className="px-4 py-3.5 text-start font-semibold">
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    <span>Status</span>
                    <ChevronsUpDown className="size-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5 text-start font-semibold">
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    <span>Due Date</span>
                    <ChevronsUpDown className="size-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5 text-start font-semibold">
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    <span>Last Update</span>
                    <ChevronsUpDown className="size-3.5 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5 text-end font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredData.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  {/* Reference Link */}
                  <td className="whitespace-nowrap px-5 py-4 font-semibold text-blue-600 dark:text-blue-400">
                    <span className="hover:underline cursor-pointer">{row.reference}</span>
                  </td>

                  {/* Title */}
                  <td className="px-4 py-4 font-medium text-slate-900 dark:text-slate-100">{row.title}</td>

                  {/* Type Badge */}
                  <td className="whitespace-nowrap px-4 py-4">
                    <TypeBadge type={row.type} />
                  </td>

                  {/* Originating Org */}
                  <td className="whitespace-nowrap px-4 py-4 text-xs font-normal text-slate-600 dark:text-slate-400">
                    {row.originatingOrg}
                  </td>

                  {/* Assigned User */}
                  <td className="whitespace-nowrap px-4 py-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-6 border border-slate-200 dark:border-slate-700">
                        <AvatarImage src={row.assignedTo.avatar} alt={row.assignedTo.name} />
                        <AvatarFallback className="bg-blue-100 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          {row.assignedTo.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                        {row.assignedTo.name}
                      </span>
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="whitespace-nowrap px-4 py-4">
                    <StatusBadge status={row.status} />
                  </td>

                  {/* Due Date */}
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600 dark:text-slate-400">
                    {row.dueDate}
                  </td>

                  {/* Last Update */}
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500 dark:text-slate-500">
                    {row.lastUpdate}
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
            Showing 1 to {filteredData.length} of 1,248 results
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="size-4" />
            </button>

            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-lg border border-blue-500 bg-blue-50 text-xs font-bold text-blue-600 dark:bg-blue-950/60 dark:text-blue-400"
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
              className="inline-flex size-8 items-center justify-center rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              3
            </button>

            <span className="px-1 text-xs text-slate-400">...</span>

            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              156
            </button>

            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              <ChevronRight className="size-4" />
            </button>
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

function TypeBadge({ type }: { type: DocumentRow["type"] }) {
  const styles: Record<DocumentRow["type"], string> = {
    NCR: "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400",
    Inspection: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
    RFI: "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400",
    VO: "bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400",
    Submittal: "bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400",
    Drawing: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
    "General Document": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium",
        styles[type],
      )}
    >
      {type}
    </span>
  )
}

function StatusBadge({ status }: { status: DocumentRow["status"] }) {
  const styles: Record<DocumentRow["status"], string> = {
    Open: "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400",
    "In Review": "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
    "Waiting Response": "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400",
    Approved: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
    Closed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    Overdue: "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {status}
    </span>
  )
}
