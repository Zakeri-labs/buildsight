"use client"

import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import {
  CloudUpload,
  FileArchive,
  FileCheck2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Presentation,
  RefreshCw,
  Trash2,
} from "lucide-react"
import {
  INITIAL_DOCUMENT_ACCEPT,
  INITIAL_DOCUMENT_MAX_FILES,
  INITIAL_DOCUMENT_UPLOAD_CARDS,
  formatInitialDocumentFileSize,
  getInitialDocumentExtension,
  validateInitialDocumentFile,
  type InitialDocumentCategory,
  type InitialDocumentUploadCategory,
} from "@/lib/initial-documents/config"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export type InitialProjectDocumentSelection = {
  id: string
  category: InitialDocumentCategory
  uploadCategory: InitialDocumentUploadCategory
  file?: File
  fileName?: string
  fileSize?: number
  filePath?: string
  isExisting?: boolean
}

function fileIcon(fileOrName: File | string) {
  const fileName = typeof fileOrName === "string" ? fileOrName : fileOrName.name
  const fileType = typeof fileOrName === "string" ? "" : fileOrName.type
  const extension = getInitialDocumentExtension(fileName)
  if (fileType.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) return FileImage
  if (["xls", "xlsx", "csv"].includes(extension)) return FileSpreadsheet
  if (["ppt", "pptx"].includes(extension)) return Presentation
  if (extension === "zip") return FileArchive
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
  const inputRefs = useRef<Partial<Record<InitialDocumentUploadCategory, HTMLInputElement | null>>>({})
  const [dragTarget, setDragTarget] = useState<InitialDocumentUploadCategory | null>(null)

  const dedicatedCategories = INITIAL_DOCUMENT_UPLOAD_CARDS.filter((category) => !category.multiple)
  const additionalCategory = INITIAL_DOCUMENT_UPLOAD_CARDS.find((category) => category.multiple)!

  function selectFiles(categoryValue: InitialDocumentUploadCategory, incomingFiles: File[]) {
    const category = INITIAL_DOCUMENT_UPLOAD_CARDS.find((item) => item.value === categoryValue)
    if (!category || incomingFiles.length === 0) return

    const files = category.multiple ? incomingFiles : [incomingFiles[0]]
    const validationError = files.map(validateInitialDocumentFile).find(Boolean)
    if (validationError) {
      onValidationError(validationError)
      return
    }

    const retained = category.multiple
      ? selections
      : selections.filter((selection) => selection.uploadCategory !== category.value)
    const existingKeys = new Set(
      retained
        .filter((selection) => selection.uploadCategory === category.value)
        .map((selection) => selection.file ? `${selection.file.name}:${selection.file.size}:${selection.file.lastModified}` : `${selection.fileName}:${selection.fileSize}`),
    )
    const additions = files.flatMap((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`
      if (existingKeys.has(key)) return []
      existingKeys.add(key)
      return [{
        id: crypto.randomUUID(),
        category: category.category,
        uploadCategory: category.value,
        file,
      } satisfies InitialProjectDocumentSelection]
    })

    if (retained.length + additions.length > INITIAL_DOCUMENT_MAX_FILES) {
      onValidationError(
        isArabic
          ? `يمكن رفع ${INITIAL_DOCUMENT_MAX_FILES} ملفًا كحد أقصى.`
          : `You can upload up to ${INITIAL_DOCUMENT_MAX_FILES} initial project documents.`,
      )
      return
    }

    onValidationError(null)
    onChange([...retained, ...additions])
  }

  function handleInput(categoryValue: InitialDocumentUploadCategory, event: ChangeEvent<HTMLInputElement>) {
    selectFiles(categoryValue, Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  function handleDrop(categoryValue: InitialDocumentUploadCategory, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragTarget(null)
    if (!disabled) selectFiles(categoryValue, Array.from(event.dataTransfer.files))
  }

  function removeSelection(selectionId: string) {
    onChange(selections.filter((selection) => selection.id !== selectionId))
    onValidationError(null)
  }

  function renderDropHandlers(categoryValue: InitialDocumentUploadCategory) {
    return {
      onDragEnter: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        if (!disabled) setDragTarget(categoryValue)
      },
      onDragOver: (event: DragEvent<HTMLDivElement>) => event.preventDefault(),
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTarget(null)
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => handleDrop(categoryValue, event),
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dedicatedCategories.map((category) => {
          const selected = selections.find((selection) => selection.uploadCategory === category.value)
          const name = selected ? (selected.file ? selected.file.name : (selected.fileName || "Document")) : ""
          const size = selected ? (selected.file ? selected.file.size : (selected.fileSize || 0)) : 0
          const Icon = selected ? (selected.file ? fileIcon(selected.file) : fileIcon(name)) : FileText
          return (
            <div
              key={category.value}
              {...renderDropHandlers(category.value)}
              className={cn(
                "flex min-h-48 flex-col rounded-2xl border bg-card p-4 transition-colors",
                dragTarget === category.value && "border-primary bg-primary/5 ring-2 ring-primary/15",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{isArabic ? category.labelAr : category.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isArabic ? "ملف واحد · حتى 50 ميجابايت لكل ملف" : "One file · Up to 50 MB each"}
                  </p>
                </div>
                <span className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl",
                  selected ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
                )}>
                  {selected ? <FileCheck2 className="size-4" /> : <Icon className="size-4" />}
                </span>
              </div>

              <input
                ref={(node: HTMLInputElement | null) => { inputRefs.current[category.value] = node }}
                type="file"
                accept={INITIAL_DOCUMENT_ACCEPT}
                disabled={disabled}
                onChange={(event: ChangeEvent<HTMLInputElement>) => handleInput(category.value, event)}
                className="hidden"
              />

              {selected ? (
                <div className="mt-4 flex flex-1 flex-col">
                  <div className="flex items-center gap-2.5 rounded-xl border bg-muted/25 px-3 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary shadow-sm"><Icon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium" title={name}>{name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{formatInitialDocumentFileSize(size)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeSelection(selected.id)}
                      aria-label={isArabic ? `إزالة ${name}` : `Remove ${name}`}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => inputRefs.current[category.value]?.click()}
                    className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <RefreshCw className="size-3.5" />
                    {isArabic ? "استبدال الملف" : "Replace file"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => inputRefs.current[category.value]?.click()}
                  className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <CloudUpload className="mb-2 size-6 text-primary" />
                  <span className="text-xs font-semibold">{isArabic ? "اختر ملفًا" : "Choose a file"}</span>
                  <span className="mt-1 text-[11px] text-muted-foreground">{isArabic ? "أو اسحب وأفلت هنا" : "or drag and drop here"}</span>
                </button>
              )}
            </div>
          )
        })}
      </div>

      <AdditionalDocumentsCard
        category={additionalCategory}
        selections={selections.filter((selection) => selection.uploadCategory === additionalCategory.value)}
        inputRef={(node) => { inputRefs.current[additionalCategory.value] = node }}
        dragging={dragTarget === additionalCategory.value}
        disabled={disabled}
        isArabic={isArabic}
        onChoose={() => inputRefs.current[additionalCategory.value]?.click()}
        onInput={(event) => handleInput(additionalCategory.value, event)}
        onRemove={removeSelection}
        dropHandlers={renderDropHandlers(additionalCategory.value)}
      />
    </div>
  )
}

function AdditionalDocumentsCard({
  category,
  selections,
  inputRef,
  dragging,
  disabled,
  isArabic,
  onChoose,
  onInput,
  onRemove,
  dropHandlers,
}: {
  category: (typeof INITIAL_DOCUMENT_UPLOAD_CARDS)[number]
  selections: InitialProjectDocumentSelection[]
  inputRef: (node: HTMLInputElement | null) => void
  dragging: boolean
  disabled?: boolean
  isArabic: boolean
  onChoose: () => void
  onInput: (event: ChangeEvent<HTMLInputElement>) => void
  onRemove: (selectionId: string) => void
  dropHandlers: {
    onDragEnter: (event: DragEvent<HTMLDivElement>) => void
    onDragOver: (event: DragEvent<HTMLDivElement>) => void
    onDragLeave: (event: DragEvent<HTMLDivElement>) => void
    onDrop: (event: DragEvent<HTMLDivElement>) => void
  }
}) {
  return (
    <div
      {...dropHandlers}
      className={cn(
        "rounded-2xl border bg-card p-4 transition-colors",
        dragging && "border-primary bg-primary/5 ring-2 ring-primary/15",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">{isArabic ? category.labelAr : category.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isArabic ? "يسمح بعدة ملفات · حتى 50 ميجابايت لكل ملف" : "Multiple files allowed · Up to 50 MB each"}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onChoose}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <CloudUpload className="size-4" />
          {isArabic ? "اختر الملفات" : "Choose files"}
        </button>
      </div>

      <input ref={inputRef} type="file" accept={INITIAL_DOCUMENT_ACCEPT} multiple disabled={disabled} onChange={onInput} className="hidden" />

      {selections.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {selections.map((selection) => {
            const name = selection.file ? selection.file.name : (selection.fileName || "Document")
            const size = selection.file ? selection.file.size : (selection.fileSize || 0)
            const Icon = selection.file ? fileIcon(selection.file) : fileIcon(name)
            return (
              <div key={selection.id} className="flex items-center gap-2.5 rounded-xl border bg-muted/25 px-3 py-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary shadow-sm"><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium" title={name}>{name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatInitialDocumentFileSize(size)}</p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(selection.id)}
                  aria-label={isArabic ? `إزالة ${name}` : `Remove ${name}`}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center">
          <CloudUpload className="mb-2 size-6 text-primary" />
          <span className="text-xs font-semibold">{isArabic ? "سحب وإفلات الملفات هنا" : "Drag and drop files here"}</span>
          <span className="mt-1 text-[11px] text-muted-foreground">{isArabic ? "أو اختر ملفات من جهازك" : "or choose files"}</span>
        </div>
      )}
    </div>
  )
}
