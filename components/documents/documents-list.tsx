"use client"

import { useMemo, useState } from "react"
import {
  Search,
  Plus,
  Download,
  MoreVertical,
  ClipboardList,
  Clock,
  FilePlus2,
  Timer,
  ArrowUpRight,
  ArrowDownRight,
  Calendar as CalendarIcon,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {locale === "ar" ? "المستندات" : "Documents"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {locale === "ar"
            ? "إدارة جميع سجلات المشروع وسير عمل المستندات"
            : "Manage all project records and document workflows"}
        </p>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Pending Approvals */}
        <Card className="border border-border/60 bg-card p-5 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <ClipboardList className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">
                {locale === "ar" ? "الموافقات المعلقة" : "Pending Approvals"}
              </span>
              <span className="text-2xl font-bold tracking-tight text-foreground">24</span>
              <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="size-3.5" />
                12% {locale === "ar" ? "مقارنة بالأسبوع الماضي" : "vs last week"}
              </span>
            </div>
          </div>
        </Card>

        {/* Card 2: Overdue Records */}
        <Card className="border border-border/60 bg-card p-5 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <Clock className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">
                {locale === "ar" ? "السجلات المتأخرة" : "Overdue Records"}
              </span>
              <span className="text-2xl font-bold tracking-tight text-foreground">8</span>
              <span className="flex items-center gap-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                <ArrowUpRight className="size-3.5" />
                33% {locale === "ar" ? "مقارنة بالأسبوع الماضي" : "vs last week"}
              </span>
            </div>
          </div>
        </Card>

        {/* Card 3: New This Week */}
        <Card className="border border-border/60 bg-card p-5 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <FilePlus2 className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">
                {locale === "ar" ? "الجديد هذا الأسبوع" : "New This Week"}
              </span>
              <span className="text-2xl font-bold tracking-tight text-foreground">32</span>
              <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="size-3.5" />
                18% {locale === "ar" ? "مقارنة بالأسبوع الماضي" : "vs last week"}
              </span>
            </div>
          </div>
        </Card>

        {/* Card 4: Avg Response Time */}
        <Card className="border border-border/60 bg-card p-5 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
              <Timer className="size-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">
                {locale === "ar" ? "متوسط وقت الاستجابة" : "Avg Response Time"}
              </span>
              <span className="text-2xl font-bold tracking-tight text-foreground">1.8 days</span>
              <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <ArrowDownRight className="size-3.5" />
                0.3 days {locale === "ar" ? "مقارنة بالأسبوع الماضي" : "vs last week"}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs and Primary Action Buttons */}
      <div className="flex flex-col gap-4 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Scrollable Tabs List */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
          {tabList.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "text-primary font-semibold border-b-2 border-primary -mb-[13px]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl border-border">
            <Download className="size-4" />
            <span>{locale === "ar" ? "تصدير" : "Export"}</span>
          </Button>
          <Button size="sm" className="h-9 gap-1.5 rounded-xl bg-primary text-primary-foreground">
            <Plus className="size-4" />
            <span>{locale === "ar" ? "إنشاء مستند" : "Create Document"}</span>
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search documents */}
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute inset-inline-start-3 start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={locale === "ar" ? "بحث في المستندات..." : "Search documents"}
            className="h-10 rounded-xl ps-9 text-sm"
          />
        </div>

        {/* Status Dropdown */}
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="h-10 w-[130px] rounded-xl border-border bg-card text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in review">In Review</SelectItem>
            <SelectItem value="waiting response">Waiting Response</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>

        {/* Organization Dropdown */}
        <Select value={selectedOrg} onValueChange={setSelectedOrg}>
          <SelectTrigger className="h-10 w-[160px] rounded-xl border-border bg-card text-sm">
            <SelectValue placeholder="Organization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Organizations</SelectItem>
            <SelectItem value="BuildCore Engineering">BuildCore Engineering</SelectItem>
            <SelectItem value="Prime Inspectors">Prime Inspectors</SelectItem>
            <SelectItem value="Design Axis LLC">Design Axis LLC</SelectItem>
            <SelectItem value="ConstructPro">ConstructPro</SelectItem>
            <SelectItem value="MEP Solutions Co.">MEP Solutions Co.</SelectItem>
          </SelectContent>
        </Select>

        {/* Assigned User Dropdown */}
        <Select value={selectedUser} onValueChange={setSelectedUser}>
          <SelectTrigger className="h-10 w-[150px] rounded-xl border-border bg-card text-sm">
            <SelectValue placeholder="Assigned User" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            <SelectItem value="Arman H.">Arman H.</SelectItem>
            <SelectItem value="Leena K.">Leena K.</SelectItem>
            <SelectItem value="Mohammed S.">Mohammed S.</SelectItem>
            <SelectItem value="Nadine R.">Nadine R.</SelectItem>
          </SelectContent>
        </Select>

        {/* Date Range Button */}
        <Button variant="outline" size="sm" className="h-10 gap-2 rounded-xl border-border bg-card px-3 text-sm font-normal">
          <CalendarIcon className="size-4 text-muted-foreground" />
          <span>May 18, 2025 - May 24, 2025</span>
        </Button>

        {/* Overdue Only Switch */}
        <div className="flex items-center gap-2 ms-auto">
          <span className="text-xs font-medium text-muted-foreground">Overdue Only</span>
          <button
            type="button"
            role="switch"
            aria-checked={overdueOnly}
            onClick={() => setOverdueOnly(!overdueOnly)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-hidden",
              overdueOnly ? "bg-primary" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out my-0.5",
                overdueOnly ? "translate-x-4.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
      </div>

      {/* Main Table */}
      <Card className="overflow-hidden border border-border/60 bg-card p-0 shadow-xs">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-border">
              <TableHead className="py-3 text-xs font-semibold text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span>Reference</span>
                  <ChevronsUpDown className="size-3" />
                </div>
              </TableHead>
              <TableHead className="py-3 text-xs font-semibold text-muted-foreground">Title</TableHead>
              <TableHead className="py-3 text-xs font-semibold text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span>Type</span>
                  <ChevronsUpDown className="size-3" />
                </div>
              </TableHead>
              <TableHead className="py-3 text-xs font-semibold text-muted-foreground">Originating Organization</TableHead>
              <TableHead className="py-3 text-xs font-semibold text-muted-foreground">Assigned To</TableHead>
              <TableHead className="py-3 text-xs font-semibold text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span>Status</span>
                  <ChevronsUpDown className="size-3" />
                </div>
              </TableHead>
              <TableHead className="py-3 text-xs font-semibold text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span>Due Date</span>
                  <ChevronsUpDown className="size-3" />
                </div>
              </TableHead>
              <TableHead className="py-3 text-xs font-semibold text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span>Last Update</span>
                  <ChevronsUpDown className="size-3" />
                </div>
              </TableHead>
              <TableHead className="py-3 text-end text-xs font-semibold text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredData.map((row) => (
              <TableRow key={row.id} className="border-border/60 hover:bg-muted/30">
                {/* Reference Link */}
                <TableCell className="py-3.5 font-semibold text-primary">
                  <span className="hover:underline cursor-pointer">{row.reference}</span>
                </TableCell>

                {/* Title */}
                <TableCell className="py-3.5 font-medium text-foreground">{row.title}</TableCell>

                {/* Type Badge */}
                <TableCell className="py-3.5">
                  <TypeBadge type={row.type} />
                </TableCell>

                {/* Originating Org */}
                <TableCell className="py-3.5 text-sm text-muted-foreground">{row.originatingOrg}</TableCell>

                {/* Assigned User */}
                <TableCell className="py-3.5">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarImage src={row.assignedTo.avatar} alt={row.assignedTo.name} />
                      <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                        {row.assignedTo.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium text-foreground">{row.assignedTo.name}</span>
                  </div>
                </TableCell>

                {/* Status Badge */}
                <TableCell className="py-3.5">
                  <StatusBadge status={row.status} />
                </TableCell>

                {/* Due Date */}
                <TableCell className="py-3.5 text-sm text-muted-foreground">{row.dueDate}</TableCell>

                {/* Last Update */}
                <TableCell className="py-3.5 text-xs text-muted-foreground">{row.lastUpdate}</TableCell>

                {/* Actions */}
                <TableCell className="py-3.5 text-end">
                  <Button variant="ghost" size="icon-sm" className="size-8 text-muted-foreground hover:text-foreground">
                    <MoreVertical className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Footer / Pagination */}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Showing 1 to {filteredData.length} of 1,248 results
          </span>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" className="size-8">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 min-w-8 border-primary text-primary font-bold bg-primary/5">
              1
            </Button>
            <Button variant="ghost" size="sm" className="h-8 min-w-8 text-muted-foreground">
              2
            </Button>
            <Button variant="ghost" size="sm" className="h-8 min-w-8 text-muted-foreground">
              3
            </Button>
            <span className="px-1 text-xs text-muted-foreground">...</span>
            <Button variant="ghost" size="sm" className="h-8 min-w-8 text-muted-foreground">
              156
            </Button>
            <Button variant="ghost" size="icon-sm" className="size-8">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function TypeBadge({ type }: { type: DocumentRow["type"] }) {
  const styles: Record<DocumentRow["type"], string> = {
    NCR: "bg-rose-500/10 text-rose-600 border-rose-200/50 dark:bg-rose-500/20 dark:text-rose-400",
    Inspection: "bg-blue-500/10 text-blue-600 border-blue-200/50 dark:bg-blue-500/20 dark:text-blue-400",
    RFI: "bg-purple-500/10 text-purple-600 border-purple-200/50 dark:bg-purple-500/20 dark:text-purple-400",
    VO: "bg-teal-500/10 text-teal-600 border-teal-200/50 dark:bg-teal-500/20 dark:text-teal-400",
    Submittal: "bg-sky-500/10 text-sky-600 border-sky-200/50 dark:bg-sky-500/20 dark:text-sky-400",
    Drawing: "bg-amber-500/10 text-amber-600 border-amber-200/50 dark:bg-amber-500/20 dark:text-amber-400",
    "General Document": "bg-slate-500/10 text-slate-600 border-slate-200/50 dark:bg-slate-500/20 dark:text-slate-400",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border",
        styles[type],
      )}
    >
      {type}
    </span>
  )
}

function StatusBadge({ status }: { status: DocumentRow["status"] }) {
  const styles: Record<DocumentRow["status"], string> = {
    Open: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
    "In Review": "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
    "Waiting Response": "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
    Approved: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
    Closed: "bg-slate-500/10 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400",
    Overdue: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        styles[status],
      )}
    >
      {status}
    </span>
  )
}
