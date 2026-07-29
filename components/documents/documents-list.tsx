"use client"

import { useMemo, useState, type ComponentType } from "react"
import Link from "next/link"
import {
  Archive,
  CheckCircle2,
  CheckSquare2,
  ChevronDown,
  ClipboardCheck,
  Download,
  Eye,
  FileCheck2,
  FileClock,
  FileImage,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Files,
  MessageSquareText,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldAlert,
} from "lucide-react"
import { CreateDocumentDialog } from "@/components/documents/create-document-dialog"
import { DocumentTypeSelect } from "@/components/documents/document-type-select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  getDocumentTypeDefinition,
  type DocumentTypeGroup,
  type DocumentTypeIconKey,
  type DocumentTypeValue,
} from "@/lib/documents/document-types"
import { getSimpleUploadCategory, type SimpleUploadCategoryValue } from "@/lib/documents/simple-upload"
import { cn } from "@/lib/utils"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"

export type DocumentListItem = {
  id: string
  reference: string
  title: string
  documentType: DocumentTypeValue
  projectName: string
  createdBy: {
    name: string
    avatar: string | null
    initials: string
  }
  status: "draft" | "published"
  createdAt: string
  updatedAt: string
  fileStoragePath: string | null
  originalFilename: string | null
  simpleUploadCategory: SimpleUploadCategoryValue | null
}

type Category = "all" | DocumentTypeGroup

const categoryLabels: Record<Category, string> = {
  all: "All",
  inspection: "Inspections",
  quality: "Quality",
  safety: "Safety",
  report: "Reports",
  drawing: "Drawings",
  submittal: "Submittals",
  commercial: "Commercial",
  communication: "Communication",
  management: "Management",
  other: "Other",
}

const categoryOrder: Category[] = [
  "all",
  "inspection",
  "quality",
  "safety",
  "report",
  "drawing",
  "submittal",
  "commercial",
  "communication",
  "management",
  "other",
]

export function DocumentsList({
  documents,
  selectedProjectId,
  uploadedCount = 0,
}: {
  documents: DocumentListItem[]
  selectedProjectId: string | null
  uploadedCount?: number
}) {
  const [activeTab, setActiveTab] = useState<Category>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | DocumentListItem["status"]>("all")
  const [typeFilter, setTypeFilter] = useState<DocumentTypeValue | "">("")
  const [projectFilter, setProjectFilter] = useState("all")

  const projects = useMemo(
    () => Array.from(new Set(documents.map((document) => document.projectName))).sort(),
    [documents],
  )

  const categoryCounts = useMemo(() => {
    const counts = new Map<DocumentTypeGroup, number>()
    for (const document of documents) {
      const group = getDocumentTypeDefinition(document.documentType).group
      counts.set(group, (counts.get(group) ?? 0) + 1)
    }
    return counts
  }, [documents])

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return documents.filter((document) => {
      const type = getDocumentTypeDefinition(document.documentType)
      const simpleCategory = getSimpleUploadCategory(document.simpleUploadCategory)
      if (activeTab !== "all" && type.group !== activeTab) return false
      if (typeFilter && document.documentType !== typeFilter) return false
      if (statusFilter !== "all" && document.status !== statusFilter) return false
      if (projectFilter !== "all" && document.projectName !== projectFilter) return false
      if (
        query &&
        !document.title.toLowerCase().includes(query) &&
        !document.reference.toLowerCase().includes(query) &&
        !type.label.toLowerCase().includes(query) &&
        !type.shortLabel.toLowerCase().includes(query) &&
        !(simpleCategory?.label.toLowerCase().includes(query) ?? false)
      ) return false
      return true
    })
  }, [activeTab, documents, projectFilter, searchQuery, statusFilter, typeFilter])

  const draftCount = documents.filter((document) => document.status === "draft").length
  const publishedCount = documents.filter((document) => document.status === "published").length
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const newThisWeek = documents.filter((document) => new Date(document.createdAt).getTime() >= weekAgo).length

  const tabs = categoryOrder.map((key) => ({
    key,
    label: categoryLabels[key],
    count: key === "all" ? documents.length : categoryCounts.get(key) ?? 0,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
              <Files className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Documents</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Create and manage construction documents, details, files and site images.</p>
            </div>
          </div>
        </div>
        {selectedProjectId ? (
          <CreateDocumentDialog projectId={selectedProjectId} />
        ) : (
          <button type="button" disabled title="Select a project first" className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-300 px-4 text-sm font-semibold text-white dark:bg-slate-700">
            <Plus className="size-4" />
            Create Document
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Files} label="Total Documents" value={documents.length} tone="blue" />
        <MetricCard icon={FileClock} label="Drafts" value={draftCount} tone="amber" />
        <MetricCard icon={FileCheck2} label="Published" value={publishedCount} tone="green" />
        <MetricCard icon={FilePlus2} label="New This Week" value={newThisWeek} tone="violet" />
      </div>

      <div className="border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const active = tab.key === activeTab
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key)
                  setTypeFilter("")
                }}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap pb-3 text-sm transition-colors",
                  active ? "font-bold text-blue-600 dark:text-blue-400" : "font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400",
                )}
              >
                {tab.label}
                <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", active ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400")}>{tab.count}</span>
                {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" /> : null}
              </button>
            )
          })}
        </div>
      </div>

      {!selectedProjectId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Select a specific project from the Projects menu to create a document. The list can still show documents across your accessible projects.
        </div>
      ) : null}

      {uploadedCount > 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="size-5 shrink-0" />
          {uploadedCount} document{uploadedCount === 1 ? "" : "s"} uploaded successfully.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search documents" className="h-10 rounded-xl bg-white ps-9 dark:bg-slate-900" />
        </div>
        <DocumentTypeSelect
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value)
            if (value) setActiveTab(getDocumentTypeDefinition(value).group)
          }}
          allowClear
          clearLabel="All document types"
          placeholder="Document Type"
          className="w-full sm:w-[310px]"
        />
        <FilterMenu
          label="Status"
          value={statusFilter}
          options={[
            { label: "All statuses", value: "all" },
            { label: "Draft", value: "draft" },
            { label: "Published", value: "published" },
          ]}
          onChange={(value) => setStatusFilter(value as typeof statusFilter)}
        />
        {projects.length > 1 ? (
          <FilterMenu
            label="Project"
            value={projectFilter}
            options={[{ label: "All projects", value: "all" }, ...projects.map((project) => ({ label: project, value: project }))]}
            onChange={setProjectFilter}
          />
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <th className="px-5 py-3.5 text-start">Reference</th>
                <th className="px-4 py-3.5 text-start">Title</th>
                <th className="px-4 py-3.5 text-start">Type</th>
                <th className="px-4 py-3.5 text-start">Project</th>
                <th className="px-4 py-3.5 text-start">Created By</th>
                <th className="px-4 py-3.5 text-start">Status</th>
                <th className="px-4 py-3.5 text-start">Last Updated</th>
                <th className="px-5 py-3.5 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredDocuments.map((document) => {
                const type = getDocumentTypeDefinition(document.documentType)
                const simpleCategory = getSimpleUploadCategory(document.simpleUploadCategory)
                const displayType = simpleCategory?.label ?? type.shortLabel
                return (
                  <tr key={document.id} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="whitespace-nowrap px-5 py-4">
                      <Link href={`/documents/${document.id}`} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">{document.reference}</Link>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <DocumentTypeIcon icon={type.icon} />
                        <Link href={`/documents/${document.id}`} className="font-medium text-slate-900 hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400">{document.title}</Link>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <span title={simpleCategory ? `${simpleCategory.label} · ${type.label}` : type.label} className={cn("inline-flex rounded-md px-2.5 py-1 text-xs font-medium", type.badgeClassName)}>{displayType}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600 dark:text-slate-400">{document.projectName}</td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-7 border border-slate-200 dark:border-slate-700">
                          {document.createdBy.avatar ? <AvatarImage src={profileAvatarDisplayUrl(document.createdBy.avatar)} alt={document.createdBy.name} /> : null}
                          <AvatarFallback className="bg-blue-100 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{document.createdBy.initials}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{document.createdBy.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4"><DocumentStatus status={document.status} /></td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">{formatDateTime(document.updatedAt)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${document.title}`} className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><MoreVertical className="size-4" /></button>} />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/documents/${document.id}`}><Eye className="size-4" />View document</Link>} />
                          {document.fileStoragePath ? (
                            <DropdownMenuItem
                              render={
                                <a href={`/api/document-files?path=${encodeURIComponent(document.fileStoragePath)}&download=1&filename=${encodeURIComponent(document.originalFilename ?? document.title)}`}>
                                  <Download className="size-4" />Download file
                                </a>
                              }
                            />
                          ) : (
                            <DropdownMenuItem render={<Link href={`/documents/${document.id}/edit`}><Pencil className="size-4" />Edit document</Link>} />
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filteredDocuments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800"><Archive className="size-6" /></span>
            <div>
              <h3 className="font-semibold">No documents found</h3>
              <p className="mt-1 text-sm text-muted-foreground">Create a document for the selected project or adjust the current filters.</p>
            </div>
          </div>
        ) : null}

        <div className="border-t border-slate-200/80 px-5 py-3.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Showing {filteredDocuments.length} of {documents.length} documents
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: ComponentType<{ className?: string }>; label: string; value: number; tone: "blue" | "amber" | "green" | "violet" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  }
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", tones[tone])}><Icon className="size-5" /></span>
      <div><span className="block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span><span className="text-2xl font-extrabold text-slate-900 dark:text-white">{value}</span></div>
    </div>
  )
}

function FilterMenu({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void }) {
  const selected = options.find((option) => option.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className="inline-flex h-10 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"><span>{value === "all" ? label : selected?.label ?? label}</span><ChevronDown className="size-3.5 text-slate-400" /></button>} />
      <DropdownMenuContent align="start" className="max-h-72 min-w-44 overflow-y-auto">
        {options.map((option) => <DropdownMenuItem key={option.value} onClick={() => onChange(option.value)}>{option.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DocumentTypeIcon({ icon }: { icon: DocumentTypeIconKey }) {
  const icons: Record<DocumentTypeIconKey, ComponentType<{ className?: string }>> = {
    inspection: ClipboardCheck,
    quality: CheckSquare2,
    safety: ShieldAlert,
    report: FileSpreadsheet,
    drawing: FileImage,
    submittal: Send,
    commercial: FileCheck2,
    communication: MessageSquareText,
    document: FileText,
  }
  const Icon = icons[icon]
  return <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Icon className="size-4" /></span>
}

function DocumentStatus({ status }: { status: DocumentListItem["status"] }) {
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", status === "published" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300")}>{status === "published" ? "Published" : "Draft"}</span>
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
}
