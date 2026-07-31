"use client"

import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import {
  CloudUpload,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Presentation,
  Trash2,
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  INITIAL_DOCUMENT_ACCEPT,
  INITIAL_DOCUMENT_CATEGORIES,
  INITIAL_DOCUMENT_MAX_FILES,
  formatInitialDocumentFileSize,
  getInitialDocumentCategory,
  getInitialDocumentExtension,
  validateInitialDocumentFile,
  type InitialDocumentCategory,
} from "@/lib/initial-documents/config"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export type InitialProjectDocumentSelection = {
  id: string
  category: InitialDocumentCategory
  file: File
}

function fileIcon(file: File) {
  const extension = getInitialDocumentExtension(file.name)
  if (file.type.startsWith("image/")) return FileImage
  if (["xls", "xlsx", "csv"].includes(extension)) return FileSpreadsheet
  if (["ppt", "pptx"].includes(extension)) return Presentation
  if (["zip"].includes(extension)) return FileArchive
  return FileText
}

export function ProjectInitialDocumentUploadStep({
  selections,
  onChange,
  disabled,
  onValidationError,
}: {
  selections: InitialProjectDocumentSelection[]
  onChange: (value: InitialProjectDocumentSelection[]) => void
  disabled?: boolean
  onValidationError: (message: string | null) => void
}) {
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [category, setCategory] = useState<InitialDocumentCategory>("other")
  const [dragging, setDragging] = useState(false)

  function addFiles(incoming: File[]) {
    if (!incoming.length) return
    if (selections.length + incoming.length > INITIAL_DOCUMENT_MAX_FILES) {
      onValidationError(isArabic ? `يمكن رفع ${INITIAL_DOCUMENT_MAX_FILES} ملفًا كحد أقصى.` : `You can upload up to ${INITIAL_DOCUMENT_MAX_FILES} initial project documents.`)
      return
    }

    const validationError = incoming.map(validateInitialDocumentFile).find(Boolean)
    if (validationError) {
      onValidationError(validationError)
      return
    }

    const existingKeys = new Set(selections.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`))
    const additions = incoming.flatMap((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`
      if (existingKeys.has(key)) return []
      existingKeys.add(key)
      return [{ id: crypto.randomUUID(), category, file }]
    })

    onValidationError(null)
    onChange([...selections, ...additions])
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (!disabled) addFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{isArabic ? "المستندات الأولية للمشروع" : "Initial Project Documents"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isArabic ? "اختر فئة للدفعة، ثم أضف ملفًا واحدًا أو عدة ملفات." : "Choose a category for this batch, then add one or multiple files."}
          </p>
        </div>
        <div className="w-full sm:w-64">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{isArabic ? "الفئة" : "Category"}</label>
          <Select value={category} onValueChange={(value) => setCategory(value as InitialDocumentCategory)} disabled={disabled}>
            <SelectTrigger className="h-10 w-full rounded-xl px-3">
              <SelectValue>{(value) => {
                const item = getInitialDocumentCategory(value)
                return isArabic ? item.labelAr : item.label
              }}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {INITIAL_DOCUMENT_CATEGORIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>{isArabic ? item.labelAr : item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <input ref={inputRef} type="file" accept={INITIAL_DOCUMENT_ACCEPT} multiple disabled={disabled} onChange={handleInput} className="hidden" />
      <div
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
        onDrop={handleDrop}
        className={cn(
          "rounded-2xl border border-dashed bg-muted/15 p-5 transition-colors",
          dragging && "border-primary bg-primary/5 ring-2 ring-primary/15",
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-xl px-4 py-5 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <CloudUpload className="mb-2 size-7 text-primary" />
          <span className="text-sm font-semibold">{isArabic ? "اسحب الملفات وأفلتها هنا" : "Drag and drop files here"}</span>
          <span className="mt-1 text-xs text-muted-foreground">{isArabic ? "أو اختر الملفات · حتى 50 ميجابايت لكل ملف" : "or browse files · up to 50 MB each"}</span>
        </button>
      </div>

      {selections.length ? (
        <div className="overflow-hidden rounded-2xl border">
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>{isArabic ? "الملفات المحددة" : "Selected files"}</span>
            <span>{selections.length}/{INITIAL_DOCUMENT_MAX_FILES}</span>
          </div>
          <div className="divide-y">
            {selections.map((item) => {
              const Icon = fileIcon(item.file)
              const categoryDefinition = getInitialDocumentCategory(item.category)
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><Icon className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={item.file.name}>{item.file.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatInitialDocumentFileSize(item.file.size)} · {isArabic ? categoryDefinition.labelAr : categoryDefinition.label}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => { onChange(selections.filter((selection) => selection.id !== item.id)); onValidationError(null) }}
                    aria-label={isArabic ? `إزالة ${item.file.name}` : `Remove ${item.file.name}`}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
