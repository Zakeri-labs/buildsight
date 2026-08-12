"use client"

import { useMemo, useState, type ChangeEvent, type ComponentType } from "react"
import {
  Download,
  Eye,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Presentation,
  Search,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  formatInitialDocumentFileSize,
  getInitialDocumentCategory,
  getInitialDocumentExtension,
  getInitialDocumentUploadCategory,
} from "@/lib/initial-documents/config"
import type { InitialDocumentListItem } from "@/lib/initial-documents/types"
import { useI18n } from "@/lib/i18n"
import { ProjectOverviewTableColumns, projectOverviewTableCellClass } from "@/components/projects/project-overview-table-columns"
import { AddProjectDocumentModal } from "@/components/initial-documents/add-project-document-modal"
import { cn } from "@/lib/utils"

export type { InitialDocumentListItem } from "@/lib/initial-documents/types"

type SortValue = "newest" | "oldest" | "file_name" | "project_name" | "file_size"

function formatDate(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle: "medium" }).format(date)
}

function fileIcon(item: Pick<InitialDocumentListItem, "fileName" | "mimeType">): ComponentType<{ className?: string }> {
  const extension = getInitialDocumentExtension(item.fileName)
  if (item.mimeType.startsWith("image/")) return FileImage
  if (["xls", "xlsx", "csv"].includes(extension)) return FileSpreadsheet
  if (["ppt", "pptx"].includes(extension)) return Presentation
  if (extension === "zip") return FileArchive
  return FileText
}

function canPreview(item: InitialDocumentListItem) {
  return item.mimeType === "application/pdf" || item.mimeType.startsWith("image/")
}

function getDisplayCategory(item: Pick<InitialDocumentListItem, "category" | "uploadCategory">, isArabic: boolean) {
  const uploadCategory = getInitialDocumentUploadCategory(item.uploadCategory)
  if (uploadCategory) {
    return { value: `upload:${uploadCategory.value}`, label: isArabic ? uploadCategory.labelAr : uploadCategory.label }
  }
  const category = getInitialDocumentCategory(item.category)
  return { value: `category:${category.value}`, label: isArabic ? category.labelAr : category.label }
}

export function InitialDocumentsList({
  documents,
  selectedProjectId,
  selectedProjectName,
  errorMessage,
  embedded = false,
  compactMobile = false,
}: {
  documents: InitialDocumentListItem[]
  selectedProjectId: string | null
  selectedProjectName: string | null
  errorMessage?: string | null
  embedded?: boolean
  compactMobile?: boolean
}) {
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("all")
  const [sort, setSort] = useState<SortValue>("newest")
  const [preview, setPreview] = useState<InitialDocumentListItem | null>(null)

  const copy = isArabic ? {
    title: "المستندات",
    subtitle: "الملفات المرجعية الأولية المرفوعة عند إنشاء المشاريع.",
    search: "البحث في المستندات...",
    allCategories: "كل الفئات",
    newest: "الأحدث",
    oldest: "الأقدم",
    fileName: "اسم الملف",
    projectName: "اسم المشروع",
    fileSize: "حجم الملف",
    project: "المشروع",
    category: "الفئة",
    uploadedBy: "رُفع بواسطة",
    uploadedDate: "تاريخ الرفع",
    size: "الحجم",
    actions: "الإجراءات",
    preview: "معاينة",
    download: "تنزيل",
    globalEmpty: "لا توجد مستندات مشاريع متاحة.",
    scopedEmpty: "لم يتم رفع مستندات أولية لهذا المشروع.",
    helper: "ستظهر هنا الملفات المرفوعة أثناء إنشاء المشروع.",
    total: "ملف",
    error: "تعذر تحميل مستندات المشروع.",
  } : {
    title: "Documents",
    subtitle: "Initial reference files uploaded with each project.",
    search: "Search documents...",
    allCategories: "All Categories",
    newest: "Newest",
    oldest: "Oldest",
    fileName: "File Name",
    projectName: "Project Name",
    fileSize: "File Size",
    project: "Project",
    category: "Category",
    uploadedBy: "Uploaded By",
    uploadedDate: "Uploaded Date",
    size: "Size",
    actions: "Actions",
    preview: "Preview",
    download: "Download",
    globalEmpty: "No project documents are available.",
    scopedEmpty: "No initial documents were uploaded for this project.",
    helper: "Files uploaded during project creation will appear here.",
    total: "Files",
    error: "Project documents could not be loaded.",
  }

  const categoryOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>()
    for (const item of documents) {
      const definition = getDisplayCategory(item, isArabic)
      options.set(definition.value, definition)
    }
    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label, locale))
  }, [documents, isArabic, locale])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale)
    const result = documents.filter((item) => {
      if (category !== "all" && getDisplayCategory(item, isArabic).value !== category) return false
      if (!query) return true
      return item.fileName.toLocaleLowerCase(locale).includes(query) || item.projectName.toLocaleLowerCase(locale).includes(query)
    })
    return [...result].sort((a, b) => {
      if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (sort === "file_name") return a.fileName.localeCompare(b.fileName, locale)
      if (sort === "project_name") return a.projectName.localeCompare(b.projectName, locale)
      if (sort === "file_size") return b.fileSize - a.fileSize
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [category, documents, isArabic, locale, search, sort])

  const drawingCount = documents.filter((item) => ["drawing", "three_d_perspective"].includes(item.uploadCategory ?? "") || (!item.uploadCategory && item.category === "approved_drawings")).length
  const contractCount = documents.filter((item) => ["supervision_agreement", "contract_agreement"].includes(item.uploadCategory ?? "") || (!item.uploadCategory && ["contract", "consultant_agreement", "contractor_agreement"].includes(item.category))).length
  const otherCount = documents.filter((item) => item.uploadCategory === "additional_documents" || (!item.uploadCategory && item.category === "other")).length

  return (
    <div className={cn("flex flex-col", embedded ? "gap-0" : "gap-5")}>
      {errorMessage ? (
        <div role="alert" className={cn("rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive", embedded && "m-4 sm:m-5")}>
          {copy.error} {errorMessage}
        </div>
      ) : (
        <>
          {!embedded ? (
            <>
          <div className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 text-xs text-muted-foreground md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
            <span className="shrink-0 rounded-full border bg-card px-3 py-1.5 font-medium">{documents.length} {copy.total}</span>
            <span className="shrink-0 rounded-full border bg-card px-3 py-1.5">{drawingCount} {isArabic ? "مخططات" : "Drawings"}</span>
            <span className="shrink-0 rounded-full border bg-card px-3 py-1.5">{contractCount} {isArabic ? "عقود" : "Contracts"}</span>
            <span className="shrink-0 rounded-full border bg-card px-3 py-1.5">{otherCount} {isArabic ? "أخرى" : "Other"}</span>
          </div>

          <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-3">
            <div className="relative min-w-0 flex-1 md:max-w-md">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder={copy.search} className="h-10 rounded-xl ps-9" />
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 md:flex md:items-center md:gap-3">
              <Select value={category} onValueChange={(value: unknown) => setCategory(typeof value === "string" ? value : "all")}>
                <SelectTrigger className="h-10 min-w-0 w-full rounded-xl px-3 md:w-56">
                  <SelectValue>{(value: unknown) => value === "all" ? copy.allCategories : categoryOptions.find((item) => item.value === value)?.label ?? copy.allCategories}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{copy.allCategories}</SelectItem>
                  {categoryOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(value: unknown) => setSort(value as SortValue)}>
                <SelectTrigger className="h-10 min-w-0 w-full rounded-xl px-3 md:w-44">
                  <SelectValue>{(value: unknown) => ({ newest: copy.newest, oldest: copy.oldest, file_name: copy.fileName, project_name: copy.projectName, file_size: copy.fileSize }[value as SortValue])}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{copy.newest}</SelectItem>
                  <SelectItem value="oldest">{copy.oldest}</SelectItem>
                  <SelectItem value="file_name">{copy.fileName}</SelectItem>
                  <SelectItem value="project_name">{copy.projectName}</SelectItem>
                  <SelectItem value="file_size">{copy.fileSize}</SelectItem>
                </SelectContent>
              </Select>
              {selectedProjectId ? (
                <AddProjectDocumentModal
                  projectId={selectedProjectId}
                  buttonClassName="h-10 rounded-xl font-medium shrink-0 max-md:col-span-2"
                />
              ) : null}
            </div>
          </div>
            </>
          ) : null}

          {filtered.length ? (
            <>
              <div className={cn("hidden md:block", !embedded && "overflow-hidden rounded-2xl border bg-card")}>
                <div className="overflow-x-auto">
                  <table className={cn("w-full table-fixed text-sm", selectedProjectId && "min-w-[820px]")}>
                    {selectedProjectId ? <ProjectOverviewTableColumns layout="documents" /> : null}
                    <thead className="border-b bg-muted/45 text-xs font-semibold text-muted-foreground">
                      <tr>
                        <th className={selectedProjectId ? projectOverviewTableCellClass.headerFirst : "w-[30%] px-4 py-3 text-start"}>{copy.fileName}</th>
                        {!selectedProjectId ? <th className="w-[17%] px-4 py-3 text-start">{copy.project}</th> : null}
                        <th className={selectedProjectId ? projectOverviewTableCellClass.headerMiddle : "px-4 py-3 text-start"}>{copy.category}</th>
                        <th className={selectedProjectId ? projectOverviewTableCellClass.headerMiddle : "px-4 py-3 text-start"}>{copy.uploadedBy}</th>
                        <th className={selectedProjectId ? projectOverviewTableCellClass.headerMiddle : "px-4 py-3 text-start"}>{copy.uploadedDate}</th>
                        <th className={selectedProjectId ? projectOverviewTableCellClass.headerMiddle : "px-4 py-3 text-start"}>{copy.size}</th>
                        <th className={selectedProjectId ? projectOverviewTableCellClass.headerLast : "px-4 py-3 text-end"}>{copy.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filtered.map((item) => <DocumentRow key={item.id} item={item} showProject={!selectedProjectId} locale={locale} copy={copy} onPreview={() => setPreview(item)} />)}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={cn(
                "grid gap-3 md:hidden",
                embedded && "p-4 sm:p-5",
                compactMobile && "gap-2 p-2.5",
              )}>
                {filtered.map((item) => {
                  const Icon = fileIcon(item)
                  const categoryLabel = getDisplayCategory(item, isArabic).label
                  return (
                    <article key={item.id} className={cn("rounded-xl border bg-card p-3.5", compactMobile && "rounded-lg p-3")}>
                      <div className={cn("flex items-start gap-3", compactMobile && "gap-2.5")}>
                        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary", compactMobile && "size-8")}><Icon className={cn("size-4.5", compactMobile && "size-4")} /></span>
                        <div className="min-w-0 flex-1">
                          <h2 className="break-words text-sm font-semibold leading-5 [overflow-wrap:anywhere]" title={item.fileName}>{item.fileName}</h2>
                          {!embedded ? (
                            <p className="mt-0.5 min-w-0 truncate text-xs text-muted-foreground" title={`${item.projectName} · ${categoryLabel}`}>
                              <span className="font-medium text-foreground/80">{item.projectName}</span> · {categoryLabel}
                            </p>
                          ) : (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{categoryLabel}</p>
                          )}
                          <p className="mt-1 truncate text-[11px] text-muted-foreground" title={item.uploadedBy}>{isArabic ? "رُفع بواسطة" : "Uploaded by"} {item.uploadedBy}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(item.createdAt, locale)} · {formatInitialDocumentFileSize(item.fileSize)}</p>
                        </div>
                      </div>
                      <div className={cn("mt-2.5 flex justify-end gap-1.5 border-t pt-2.5", compactMobile && "mt-2 gap-1 pt-2")}>
                        {canPreview(item) ? <button type="button" onClick={() => setPreview(item)} title={copy.preview} aria-label={`${copy.preview} ${item.fileName}`} className="inline-flex size-9 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Eye className="size-4" /></button> : null}
                        <a href={`/api/initial-documents?id=${encodeURIComponent(item.id)}&download=1`} title={copy.download} aria-label={`${copy.download} ${item.fileName}`} className="inline-flex size-9 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Download className="size-4" /></a>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          ) : (
            <div className={cn("flex flex-col items-center rounded-2xl border bg-card px-5 py-8 text-center md:px-6 md:py-16", embedded && "m-4 sm:m-5")}>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><FolderOpen className="size-6" /></span>
              <h2 className="mt-4 font-semibold">{selectedProjectId ? copy.scopedEmpty : copy.globalEmpty}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{copy.helper}</p>
            </div>
          )}
        </>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(open: boolean) => { if (!open) setPreview(null) }}>
        <DialogContent className="h-[min(88vh,900px)] max-w-[min(94vw,1100px)] grid-rows-[auto_1fr] overflow-hidden p-4 sm:max-w-[min(94vw,1100px)]">
          <DialogHeader className="pe-10">
            <DialogTitle className="truncate">{preview?.fileName}</DialogTitle>
            <DialogDescription>{preview ? getDisplayCategory(preview, isArabic).label : ""}</DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="min-h-0 overflow-hidden rounded-xl border bg-muted/20">
              {preview.mimeType.startsWith("image/") ? (
                <img src={`/api/initial-documents?id=${encodeURIComponent(preview.id)}`} alt={preview.fileName} className="size-full object-contain" />
              ) : (
                <iframe title={preview.fileName} src={`/api/initial-documents?id=${encodeURIComponent(preview.id)}`} className="size-full bg-white" />
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DocumentRow({ item, showProject, locale, copy, onPreview }: {
  item: InitialDocumentListItem
  showProject: boolean
  locale: string
  copy: Record<string, string>
  onPreview: () => void
}) {
  const Icon = fileIcon(item)
  const isArabic = locale === "ar"
  const category = getDisplayCategory(item, isArabic)
  return (
    <tr className="hover:bg-muted/20">
      <td className={cn("max-w-[300px]", showProject ? "px-4 py-3.5" : projectOverviewTableCellClass.bodyFirst)}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><Icon className="size-4" /></span>
          <span className="truncate font-medium" title={item.fileName}>{item.fileName}</span>
        </div>
      </td>
      {showProject ? <td className="max-w-[180px] truncate px-4 py-3.5 text-muted-foreground" title={item.projectName}>{item.projectName}</td> : null}
      <td className={showProject ? "whitespace-nowrap px-4 py-3.5" : cn(projectOverviewTableCellClass.bodyMiddle, "whitespace-nowrap")}><span className="inline-block max-w-full truncate rounded-md bg-muted px-2 py-1 text-xs font-medium" title={category.label}>{category.label}</span></td>
      <td className={showProject ? "whitespace-nowrap px-4 py-3.5 text-muted-foreground" : cn(projectOverviewTableCellClass.bodyMiddle, "truncate text-muted-foreground")} title={item.uploadedBy}>{item.uploadedBy}</td>
      <td className={showProject ? "whitespace-nowrap px-4 py-3.5 text-muted-foreground" : cn(projectOverviewTableCellClass.bodyMiddle, "whitespace-nowrap text-muted-foreground")}>{formatDate(item.createdAt, locale)}</td>
      <td className={showProject ? "whitespace-nowrap px-4 py-3.5 text-muted-foreground" : cn(projectOverviewTableCellClass.bodyMiddle, "whitespace-nowrap text-muted-foreground")}>{formatInitialDocumentFileSize(item.fileSize)}</td>
      <td className={showProject ? "whitespace-nowrap px-4 py-3.5 text-end" : cn(projectOverviewTableCellClass.bodyLast, "whitespace-nowrap")}>
        <div className="inline-flex items-center gap-1">
          {canPreview(item) ? <button type="button" onClick={onPreview} title={copy.preview} aria-label={`${copy.preview} ${item.fileName}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Eye className="size-4" /></button> : null}
          <a href={`/api/initial-documents?id=${encodeURIComponent(item.id)}&download=1`} title={copy.download} aria-label={`${copy.download} ${item.fileName}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Download className="size-4" /></a>
        </div>
      </td>
    </tr>
  )
}
