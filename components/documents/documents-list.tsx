"use client"

import { useMemo, useState, type ComponentType } from "react"
import Link from "next/link"
import {
  Archive,
  CheckCircle2,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
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
  Search,
  Send,
  ShieldAlert,
} from "lucide-react"
import { CreateDocumentDialog } from "@/components/documents/create-document-dialog"
import { useCurrentUser } from "@/components/current-user-provider"
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
  type DocumentTypeIconKey,
  type DocumentTypeValue,
} from "@/lib/documents/document-types"
import { getConstructionDocumentType } from "@/lib/documents/construction-document-types"
import { getSimpleUploadCategory, type SimpleUploadCategoryValue } from "@/lib/documents/simple-upload"
import { cn } from "@/lib/utils"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"

export type DocumentListItem = {
  id: string
  reference: string
  title: string
  documentType: DocumentTypeValue
  sourceDocumentType: string | null
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

type Category =
  | "all"
  | "ncr"
  | "rfi"
  | "wir_ir"
  | "mir"
  | "ipc"
  | "vo"
  | "inspection"
  | "general"
  | "other"

const categoryLabels: Record<Category, string> = {
  all: "All",
  ncr: "NCR",
  rfi: "RFI",
  wir_ir: "WIR / IR",
  mir: "MIR",
  ipc: "IPC",
  vo: "VO",
  inspection: "Inspection",
  general: "General Documents",
  other: "Other",
}

const categoryOrder: Category[] = [
  "all",
  "ncr",
  "rfi",
  "wir_ir",
  "mir",
  "ipc",
  "vo",
  "inspection",
  "general",
  "other",
]

const documentCategoryAliases: Readonly<Record<string, Exclude<Category, "all" | "other">>> = {
  ncr: "ncr",
  non_conformance_report: "ncr",
  "non conformance report": "ncr",
  request_for_information: "rfi",
  rfi: "rfi",
  "request for information": "rfi",
  wir_ir: "wir_ir",
  work_inspection_request: "wir_ir",
  wir: "wir_ir",
  "wir / ir": "wir_ir",
  "work inspection request": "wir_ir",
  material_inspection_request: "mir",
  mir: "mir",
  "material inspection request": "mir",
  ipc: "ipc",
  interim_payment_certificate: "ipc",
  "interim payment certificate": "ipc",
  variation_order: "vo",
  vo: "vo",
  "variation order": "vo",
  inspection_report: "inspection",
  inspection: "inspection",
  "inspection report": "inspection",
  other: "general",
  general_document: "general",
  general: "general",
  "general document": "general",
  "general documents": "general",
}

function getDocumentCategory(value: unknown): Exclude<Category, "all"> {
  if (typeof value !== "string") return "other"

  const raw = value.trim().toLowerCase()
  if (!raw) return "other"

  const underscored = raw.replace(/[\s-]+/g, "_")
  const readable = raw.replaceAll("_", " ").replaceAll("-", " ").replace(/\s+/g, " ")
  return documentCategoryAliases[raw] ?? documentCategoryAliases[underscored] ?? documentCategoryAliases[readable] ?? "other"
}

export function DocumentsList({
  documents,
  selectedProjectId,
  uploadedCount = 0,
}: {
  documents: DocumentListItem[]
  selectedProjectId: string | null
  uploadedCount?: number
}) {
  const currentUser = useCurrentUser()
  const isMember = currentUser.role === "org_member"
  const [activeTab, setActiveTab] = useState<Category>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | DocumentListItem["status"]>("all")
  const [typeFilter, setTypeFilter] = useState<DocumentTypeValue | "">("")
  const [projectFilter, setProjectFilter] = useState("all")

  const projects = useMemo(
    () => Array.from(new Set(documents.map((document) => document.projectName))).sort(),
    [documents],
  )

  const documentsMatchingFilters = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return documents.filter((document) => {
      const type = getDocumentTypeDefinition(document.documentType)
      const simpleCategory = getSimpleUploadCategory(document.simpleUploadCategory)
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
  }, [documents, projectFilter, searchQuery, statusFilter, typeFilter])

  const categoryCounts = useMemo(() => {
    const counts = new Map<Exclude<Category, "all">, number>()
    for (const document of documentsMatchingFilters) {
      const category = getDocumentCategory(document.sourceDocumentType)
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return counts
  }, [documentsMatchingFilters])

  const filteredDocuments = useMemo(() => {
    if (activeTab === "all") return documentsMatchingFilters
    return documentsMatchingFilters.filter(
      (document) => getDocumentCategory(document.sourceDocumentType) === activeTab,
    )
  }, [activeTab, documentsMatchingFilters])

  const draftCount = documents.filter((document) => document.status === "draft").length
  const publishedCount = documents.filter((document) => document.status === "published").length
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const newThisWeek = documents.filter((document) => new Date(document.createdAt).getTime() >= weekAgo).length

  const tabs = categoryOrder.map((key) => ({
    key,
    label: categoryLabels[key],
    count: key === "all" ? documentsMatchingFilters.length : categoryCounts.get(key) ?? 0,
  }))

  return (
    <>
      {isMember ? (
        <div className="flex min-w-0 flex-col gap-3 md:hidden">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">Letters</h1>
              <p className="mt-0.5 text-xs leading-4 text-muted-foreground">Create and manage project letters.</p>
              {selectedProjectId && projects.length === 1 ? (
                <p className="mt-1 truncate text-xs font-semibold text-foreground/80">{projects[0]}</p>
              ) : null}
            </div>
            <Link
              href={selectedProjectId ? `/documents/new?project=${encodeURIComponent(selectedProjectId)}` : "/documents/new"}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs"
            >
              <FilePlus2 className="size-4" />
              Create
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <MobileMetric label="Total" value={documents.length} tone="blue" />
            <MobileMetric label="Drafts" value={draftCount} tone="amber" />
            <MobileMetric label="Published" value={publishedCount} tone="green" />
            <MobileMetric label="New" value={newThisWeek} tone="violet" />
          </div>

          <div className="-mx-4 overflow-x-auto border-b border-slate-200/80 px-4 dark:border-slate-800">
            <div className="flex min-w-max items-center gap-4">
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
                      "relative flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap pb-1 text-xs transition-colors",
                      active ? "font-bold text-blue-600 dark:text-blue-400" : "font-medium text-slate-500 dark:text-slate-400",
                    )}
                  >
                    {tab.label}
                    <span className={cn(
                      "rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums",
                      active ? "bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                    )}>{tab.count}</span>
                    {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" /> : null}
                  </button>
                )
              })}
            </div>
          </div>

          {uploadedCount > 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="size-4 shrink-0" />
              {uploadedCount} letter{uploadedCount === 1 ? "" : "s"} uploaded successfully.
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search letters..."
                className="h-10 w-full rounded-lg bg-white ps-9 text-sm dark:bg-slate-900"
              />
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <DocumentTypeSelect
                value={typeFilter}
                onValueChange={(value) => {
                  setTypeFilter(value)
                  if (value) setActiveTab(getDocumentCategory(value))
                }}
                allowClear
                clearLabel="All letter types"
                placeholder="Letter Type"
                className="min-w-0 [&>button]:h-10 [&>button]:min-h-10 [&>button]:rounded-lg [&>button]:text-xs [&>button>span]:truncate"
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
                className="w-full"
              />
            </div>
            {projects.length > 1 ? (
              <FilterMenu
                label="Project"
                value={projectFilter}
                options={[{ label: "All projects", value: "all" }, ...projects.map((project) => ({ label: project, value: project }))]}
                onChange={setProjectFilter}
                className="w-full"
              />
            ) : null}
          </div>

          <p className="text-[11px] font-medium text-muted-foreground">
            Showing {filteredDocuments.length} of {documents.length} letters
          </p>

          {filteredDocuments.length > 0 ? (
            <div className="grid gap-2">
              {filteredDocuments.map((document) => {
                const type = getDocumentTypeDefinition(document.documentType)
                const simpleCategory = getSimpleUploadCategory(document.simpleUploadCategory)
                const constructionType = getConstructionDocumentType(document.documentType)
                const displayType = simpleCategory?.label ?? constructionType?.shortLabel ?? type.shortLabel
                return (
                  <div
                    key={document.id}
                    className="relative min-h-[5rem] overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xs transition-colors active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:active:bg-slate-800/50"
                  >
                    <Link
                      href={`/documents/${document.id}`}
                      aria-label={`Open letter ${document.reference}: ${document.title}`}
                      className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                    />
                    <div className="pointer-events-none relative z-10 px-3 py-2.5 pe-10">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate font-mono text-[10px] font-semibold text-blue-600 dark:text-blue-400">{document.reference}</span>
                        <DocumentStatus status={document.status} compact />
                      </div>
                      <h3 className="mt-1 line-clamp-2 text-[13px] font-semibold leading-[1.15rem] text-slate-950 dark:text-slate-100">{document.title}</h3>
                      <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] leading-4 text-muted-foreground">
                        <span className="shrink-0 font-medium text-foreground/75">{displayType}</span>
                        <span aria-hidden="true">•</span>
                        <span className="min-w-0 truncate">{document.createdBy.name}</span>
                        <span aria-hidden="true">•</span>
                        <span className="shrink-0">{formatCompactDate(document.updatedAt)}</span>
                      </div>
                      {!selectedProjectId ? (
                        <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2 text-[10px] leading-4 text-muted-foreground">
                          <span className="min-w-0 truncate">{document.projectName}</span>
                          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                        </div>
                      ) : (
                        <div className="mt-0.5 flex justify-end">
                          <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="absolute end-1.5 top-1.5 z-20">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${document.title}`} className="inline-flex size-7 items-center justify-center rounded-md bg-white/90 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:bg-slate-900/90 dark:hover:bg-slate-800"><MoreVertical className="size-4" /></button>} />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/documents/${document.id}`}><Eye className="size-4" />View letter</Link>} />
                          {document.fileStoragePath ? (
                            <DropdownMenuItem
                              render={
                                <a href={`/api/document-files?path=${encodeURIComponent(document.fileStoragePath)}&download=1&filename=${encodeURIComponent(document.originalFilename ?? document.title)}`}>
                                  <Download className="size-4" />Download file
                                </a>
                              }
                            />
                          ) : (
                            <DropdownMenuItem render={<Link href={`/documents/${document.id}/edit`}><Pencil className="size-4" />Edit letter</Link>} />
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-8 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800"><Archive className="size-5" /></span>
              <h3 className="mt-3 text-sm font-semibold">No letters found</h3>
              <p className="mt-1 text-xs leading-4 text-muted-foreground">No letters match the current filters.</p>
            </div>
          )}
        </div>
      ) : null}

      <div className={isMember ? "hidden md:flex md:flex-col md:gap-6" : "flex flex-col gap-6"}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
              <Files className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Letters</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Create and manage construction letters, reports, details, files and site images.</p>
            </div>
          </div>
        </div>
        <Link
          href={selectedProjectId ? `/documents/new?project=${encodeURIComponent(selectedProjectId)}` : "/documents/new"}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 shadow-xs"
        >
          <FilePlus2 className="size-4" />
          Create Letter
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Files} label="Total Letters" value={documents.length} tone="blue" />
        <MetricCard icon={FileClock} label="Drafts" value={draftCount} tone="amber" />
        <MetricCard icon={FileCheck2} label="Published" value={publishedCount} tone="green" />
        <MetricCard icon={FilePlus2} label="New This Week" value={newThisWeek} tone="violet" />
      </div>

      <div className="border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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

      {uploadedCount > 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="size-5 shrink-0" />
          {uploadedCount} letter{uploadedCount === 1 ? "" : "s"} uploaded successfully.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search letters" className="h-10 rounded-xl bg-white ps-9 dark:bg-slate-900" />
        </div>
        <DocumentTypeSelect
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value)
            if (value) setActiveTab(getDocumentCategory(value))
          }}
          allowClear
          clearLabel="All letter types"
          placeholder="Letter Type"
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
                <th className="px-4 py-3.5 text-start">Letter Type</th>
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
                const constructionType = getConstructionDocumentType(document.documentType)
                const displayType = simpleCategory?.label ?? constructionType?.shortLabel ?? type.shortLabel
                const displayTypeDescription = constructionType?.label ?? type.label
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
                    <td className="px-4 py-4">
                      <div className="flex min-w-[180px] flex-col items-start gap-1">
                        <span title={simpleCategory ? `${simpleCategory.label} · ${type.label}` : displayTypeDescription} className={cn("inline-flex rounded-md px-2.5 py-1 text-xs font-semibold", type.badgeClassName)}>{displayType}</span>
                        <span className="max-w-[220px] truncate text-[11px] text-slate-500 dark:text-slate-400" title={displayTypeDescription}>{displayTypeDescription}</span>
                      </div>
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
                          <DropdownMenuItem render={<Link href={`/documents/${document.id}`}><Eye className="size-4" />View letter</Link>} />
                          {document.fileStoragePath ? (
                            <DropdownMenuItem
                              render={
                                <a href={`/api/document-files?path=${encodeURIComponent(document.fileStoragePath)}&download=1&filename=${encodeURIComponent(document.originalFilename ?? document.title)}`}>
                                  <Download className="size-4" />Download file
                                </a>
                              }
                            />
                          ) : (
                            <DropdownMenuItem render={<Link href={`/documents/${document.id}/edit`}><Pencil className="size-4" />Edit letter</Link>} />
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
              <h3 className="font-semibold">No letters found</h3>
              <p className="mt-1 text-sm text-muted-foreground">Create a letter for the selected project or adjust the current filters.</p>
            </div>
          </div>
        ) : null}

        <div className="border-t border-slate-200/80 px-5 py-3.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Showing {filteredDocuments.length} of {documents.length} letters
        </div>
      </div>
      </div>
    </>
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

function FilterMenu({ label, value, options, onChange, className }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void; className?: string }) {
  const selected = options.find((option) => option.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className={cn("inline-flex h-10 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300", className)}><span>{value === "all" ? label : selected?.label ?? label}</span><ChevronDown className="size-3.5 text-slate-400" /></button>} />
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

function DocumentStatus({ status, compact = false }: { status: DocumentListItem["status"]; compact?: boolean }) {
  return <span className={cn("inline-flex rounded-full font-medium", compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs", status === "published" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300")}>{status === "published" ? "Published" : "Draft"}</span>
}

function MobileMetric({ label, value, tone }: { label: string; value: number; tone: "blue" | "amber" | "green" | "violet" }) {
  const tones = {
    blue: "border-blue-100 bg-blue-50/70 dark:border-blue-950 dark:bg-blue-950/25",
    amber: "border-amber-100 bg-amber-50/70 dark:border-amber-950 dark:bg-amber-950/25",
    green: "border-emerald-100 bg-emerald-50/70 dark:border-emerald-950 dark:bg-emerald-950/25",
    violet: "border-violet-100 bg-violet-50/70 dark:border-violet-950 dark:bg-violet-950/25",
  }
  return (
    <div className={cn("min-w-0 rounded-lg border px-1.5 py-2 text-center", tones[tone])}>
      <span className="block truncate text-[9px] font-medium leading-3 text-muted-foreground">{label}</span>
      <span className="mt-0.5 block text-base font-extrabold leading-5 tabular-nums text-slate-950 dark:text-white">{value}</span>
    </div>
  )
}

function formatCompactDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
}

