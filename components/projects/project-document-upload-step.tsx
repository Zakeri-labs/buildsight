"use client"

import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { CloudUpload, File as FileIcon, FileCheck2, RefreshCw, Trash2 } from "lucide-react"
import {
  SIMPLE_UPLOAD_ACCEPT,
  SIMPLE_UPLOAD_CATEGORIES,
  SIMPLE_UPLOAD_MAX_ADDITIONAL_FILES,
  formatFileSize,
  validateSimpleUploadFile,
  type SimpleUploadCategoryValue,
} from "@/lib/documents/simple-upload"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export type ProjectDocumentSelections = Record<SimpleUploadCategoryValue, File[]>

export function createEmptyProjectDocumentSelections(): ProjectDocumentSelections {
  return Object.fromEntries(
    SIMPLE_UPLOAD_CATEGORIES.map((category) => [category.value, []]),
  ) as unknown as ProjectDocumentSelections
}

export function ProjectDocumentUploadStep({
  selections,
  onChange,
  disabled,
  onValidationError,
}: {
  selections: ProjectDocumentSelections
  onChange: (value: ProjectDocumentSelections) => void
  disabled?: boolean
  onValidationError: (message: string | null) => void
}) {
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const inputRefs = useRef<Partial<Record<SimpleUploadCategoryValue, HTMLInputElement | null>>>({})
  const [dragTarget, setDragTarget] = useState<SimpleUploadCategoryValue | null>(null)

  function selectFiles(categoryValue: SimpleUploadCategoryValue, incomingFiles: File[]) {
    const category = SIMPLE_UPLOAD_CATEGORIES.find((item) => item.value === categoryValue)
    if (!category || incomingFiles.length === 0) return

    const existingFiles = selections[categoryValue] ?? []
    const existingKeys = new Set(existingFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`))
    const uniqueIncoming = incomingFiles.filter((file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`))
    if (uniqueIncoming.length === 0) return

    const combinedFiles = [...existingFiles, ...uniqueIncoming]
    if (combinedFiles.length > SIMPLE_UPLOAD_MAX_ADDITIONAL_FILES) {
      onValidationError(isArabic ? `تقبل الفئة حتى ${SIMPLE_UPLOAD_MAX_ADDITIONAL_FILES} ملفًا.` : `Category accepts up to ${SIMPLE_UPLOAD_MAX_ADDITIONAL_FILES} files.`)
      return
    }

    const validationError = uniqueIncoming.map((file) => validateSimpleUploadFile(file)).find(Boolean)
    if (validationError) {
      onValidationError(validationError)
      return
    }

    onValidationError(null)
    onChange({ ...selections, [categoryValue]: combinedFiles })
  }

  function handleInputChange(categoryValue: SimpleUploadCategoryValue, event: ChangeEvent<HTMLInputElement>) {
    selectFiles(categoryValue, Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  function handleDrop(categoryValue: SimpleUploadCategoryValue, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragTarget(null)
    if (disabled) return
    selectFiles(categoryValue, Array.from(event.dataTransfer.files))
  }

  function removeFile(categoryValue: SimpleUploadCategoryValue, index: number) {
    onChange({
      ...selections,
      [categoryValue]: selections[categoryValue].filter((_, fileIndex) => fileIndex !== index),
    })
    onValidationError(null)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {SIMPLE_UPLOAD_CATEGORIES.map((category) => {
        const selectedFiles = selections[category.value]
        const hasFiles = selectedFiles.length > 0
        return (
          <div
            key={category.value}
            onDragEnter={(event) => {
              event.preventDefault()
              if (!disabled) setDragTarget(category.value)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTarget(null)
            }}
            onDrop={(event) => handleDrop(category.value, event)}
            className={cn(
              "flex min-h-44 flex-col rounded-2xl border bg-card p-4 transition-colors",
              dragTarget === category.value && "border-primary bg-primary/5 ring-2 ring-primary/15",
              category.multiple && "sm:col-span-2 xl:col-span-3",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{isArabic ? category.labelAr : category.label}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isArabic ? (category.multiple ? "يسمح بعدة ملفات" : "ملف واحد") : (category.multiple ? "Multiple files allowed" : "One file")} · {isArabic ? "حتى 50 ميجابايت لكل ملف" : "Up to 50 MB each"}
                </p>
              </div>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {hasFiles ? <FileCheck2 className="size-4" /> : <FileIcon className="size-4" />}
              </span>
            </div>

            <input
              ref={(node) => { inputRefs.current[category.value] = node }}
              type="file"
              accept={SIMPLE_UPLOAD_ACCEPT}
              multiple={category.multiple}
              disabled={disabled}
              onChange={(event) => handleInputChange(category.value, event)}
              className="hidden"
            />

            {hasFiles ? (
              <div className="mt-4 flex flex-1 flex-col gap-2">
                {selectedFiles.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex items-center gap-2 rounded-xl border bg-muted/25 px-3 py-2.5">
                    <FileCheck2 className="size-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium" title={file.name}>{file.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeFile(category.value, index)}
                      aria-label={isArabic ? `إزالة ${file.name}` : `Remove ${file.name}`}
                      className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => inputRefs.current[category.value]?.click()}
                  className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                >
                  <CloudUpload className="size-3.5" />
                  {isArabic ? "اختر ملفات" : "Choose files"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => inputRefs.current[category.value]?.click()}
                className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
              >
                <CloudUpload className="mb-2 size-6 text-primary" />
                <span className="text-xs font-semibold">{isArabic ? (category.multiple ? "اختر ملفات" : "اختر ملفًا") : `Choose ${category.multiple ? "files" : "a file"}`}</span>
                <span className="mt-1 text-[11px] text-muted-foreground">{isArabic ? "أو اسحب وأفلت هنا" : "or drag and drop here"}</span>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
