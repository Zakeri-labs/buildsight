"use client"

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  File as FileIcon,
  FileCheck2,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react"
import { createUploadedDocumentsAction, type SimpleUploadedFileInput } from "@/lib/actions/documents"
import {
  DOCUMENT_ASSET_BUCKET,
  SIMPLE_UPLOAD_ACCEPT,
  SIMPLE_UPLOAD_CATEGORIES,
  SIMPLE_UPLOAD_MAX_ADDITIONAL_FILES,
  formatFileSize,
  sanitizeStorageFileName,
  validateSimpleUploadFile,
  type SimpleUploadCategoryValue,
} from "@/lib/documents/simple-upload"
import { uploadDocumentAsset } from "@/lib/documents/storage-upload"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type ProjectSummary = { id: string; name: string }
type FileSelections = Record<SimpleUploadCategoryValue, File[]>

function createEmptySelections(): FileSelections {
  return Object.fromEntries(SIMPLE_UPLOAD_CATEGORIES.map((category) => [category.value, []])) as unknown as FileSelections
}

export function SimpleDocumentUploadForm({ project }: { project: ProjectSummary }) {
  const router = useRouter()
  const inputRefs = useRef<Partial<Record<SimpleUploadCategoryValue, HTMLInputElement | null>>>({})
  const [selections, setSelections] = useState<FileSelections>(createEmptySelections)
  const [dragTarget, setDragTarget] = useState<SimpleUploadCategoryValue | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selectedCount = useMemo(
    () => SIMPLE_UPLOAD_CATEGORIES.reduce((total, category) => total + selections[category.value].length, 0),
    [selections],
  )

  const selectFiles = (categoryValue: SimpleUploadCategoryValue, incomingFiles: File[]) => {
    const category = SIMPLE_UPLOAD_CATEGORIES.find((item) => item.value === categoryValue)
    if (!category || incomingFiles.length === 0) return

    const files = category.multiple ? incomingFiles : [incomingFiles[0]]
    if (category.multiple && files.length > SIMPLE_UPLOAD_MAX_ADDITIONAL_FILES) {
      setError(`Additional Documents accepts up to ${SIMPLE_UPLOAD_MAX_ADDITIONAL_FILES} files at a time.`)
      return
    }

    const invalidFile = files.find((file) => validateSimpleUploadFile(file))
    if (invalidFile) {
      setError(validateSimpleUploadFile(invalidFile))
      return
    }

    setError(null)
    setSuccess(null)
    setSelections((current) => ({ ...current, [categoryValue]: files }))
  }

  const handleInputChange = (categoryValue: SimpleUploadCategoryValue, event: ChangeEvent<HTMLInputElement>) => {
    selectFiles(categoryValue, Array.from(event.target.files ?? []))
    event.target.value = ""
  }

  const handleDrop = (categoryValue: SimpleUploadCategoryValue, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragTarget(null)
    if (isUploading) return
    selectFiles(categoryValue, Array.from(event.dataTransfer.files))
  }

  const removeFile = (categoryValue: SimpleUploadCategoryValue, index: number) => {
    setSelections((current) => ({
      ...current,
      [categoryValue]: current[categoryValue].filter((_, fileIndex) => fileIndex !== index),
    }))
    setError(null)
    setSuccess(null)
  }

  const uploadDocuments = async () => {
    const filesToUpload = SIMPLE_UPLOAD_CATEGORIES.flatMap((category) =>
      selections[category.value].map((file) => ({ category, file })),
    )
    if (filesToUpload.length === 0 || isUploading) return

    for (const { file } of filesToUpload) {
      const validationError = validateSimpleUploadFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setError(null)
    setSuccess(null)
    setIsUploading(true)
    setProgress(0)

    const uploadedPaths: string[] = []
    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error("Your session has expired. Sign in again.")

      const totalBytes = filesToUpload.reduce((total, item) => total + item.file.size, 0)
      let completedBytes = 0
      const records: SimpleUploadedFileInput[] = []

      for (const { category, file } of filesToUpload) {
        setCurrentFile(file.name)
        const storagePath = `${project.id}/${session.user.id}/files/${crypto.randomUUID()}-${sanitizeStorageFileName(file.name)}`
        await uploadDocumentAsset(file, storagePath, session.access_token, (fileProgress) => {
          const uploadedBytes = completedBytes + (file.size * fileProgress) / 100
          setProgress(Math.min(99, Math.round((uploadedBytes / totalBytes) * 100)))
        })
        uploadedPaths.push(storagePath)
        completedBytes += file.size
        records.push({
          category: category.value,
          storagePath,
          originalFilename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        })
      }

      setCurrentFile("Saving letter records")
      const result = await createUploadedDocumentsAction({ projectId: project.id, files: records })
      if (!result.ok) throw new Error(result.error)

      setProgress(100)
      setSuccess(`${result.count} letter${result.count === 1 ? "" : "s"} uploaded successfully.`)
      setSelections(createEmptySelections())
      router.push(`/documents?uploaded=${result.count}`)
      router.refresh()
    } catch (uploadError) {
      if (uploadedPaths.length) {
        const supabase = createClient()
        await supabase.storage.from(DOCUMENT_ASSET_BUCKET).remove(uploadedPaths)
      }
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload the selected letters.")
      setIsUploading(false)
      setCurrentFile(null)
      setProgress(0)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UploadCloud className="size-5 text-primary" />
                Simple upload
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Choose files by category and upload them to the project in one step.</p>
            </div>
            <span className="mt-2 inline-flex w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 sm:mt-0">
              {selectedCount} selected
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
          {SIMPLE_UPLOAD_CATEGORIES.map((category) => {
            const selectedFiles = selections[category.value]
            const hasFiles = selectedFiles.length > 0
            return (
              <div
                key={category.value}
                onDragEnter={(event) => {
                  event.preventDefault()
                  if (!isUploading) setDragTarget(category.value)
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
                    <h3 className="text-sm font-semibold">{category.label}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{category.multiple ? "Multiple files allowed" : "One file"} · Up to 50 MB each</p>
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
                  disabled={isUploading}
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
                          disabled={isUploading}
                          onClick={() => removeFile(category.value, index)}
                          aria-label={`Remove ${file.name}`}
                          className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => inputRefs.current[category.value]?.click()}
                      className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                    >
                      <RefreshCw className="size-3.5" />
                      {category.multiple ? "Replace selection" : "Replace file"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => inputRefs.current[category.value]?.click()}
                    className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                  >
                    <CloudUpload className="mb-2 size-6 text-primary" />
                    <span className="text-xs font-semibold">Choose {category.multiple ? "files" : "a file"}</span>
                    <span className="mt-1 text-[11px] text-muted-foreground">or drag and drop here</span>
                  </button>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {isUploading ? (
        <Card className="py-0">
          <CardContent className="px-5 py-4 sm:px-6">
            <div className="mb-2 flex items-center justify-between gap-4 text-xs font-medium">
              <span className="flex min-w-0 items-center gap-2"><Loader2 className="size-4 shrink-0 animate-spin text-primary" /><span className="truncate">{currentFile}</span></span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {success ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>{success}</span>
        </div>
      ) : null}

      <div className="sticky bottom-4 z-20 flex justify-end rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button size="lg" disabled={selectedCount === 0 || isUploading} onClick={() => void uploadDocuments()}>
          {isUploading ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
          Upload Letters
        </Button>
      </div>
    </div>
  )
}
