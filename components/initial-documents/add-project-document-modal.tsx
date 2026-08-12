"use client"

import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { useRouter } from "next/navigation"
import { CloudUpload, FileText, Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  INITIAL_DOCUMENTS_BUCKET,
  INITIAL_DOCUMENT_ACCEPT,
  INITIAL_DOCUMENT_UPLOAD_CARDS,
  formatInitialDocumentFileSize,
  sanitizeInitialDocumentFileName,
  validateInitialDocumentFile,
  type InitialDocumentCategory,
  type InitialDocumentUploadCategory,
} from "@/lib/initial-documents/config"
import { saveInitialDocumentAction } from "@/lib/actions/initial-documents"
import { uploadStorageAsset } from "@/lib/documents/storage-upload"
import { createClient } from "@/lib/supabase/client"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function AddProjectDocumentModal({
  projectId,
  buttonClassName,
  buttonSize = "default",
  buttonVariant = "default",
  triggerText,
  onSuccess,
}: {
  projectId: string
  buttonClassName?: string
  buttonSize?: "default" | "sm" | "lg" | "icon"
  buttonVariant?: "default" | "outline" | "secondary" | "ghost" | "link"
  triggerText?: string
  onSuccess?: () => void
}) {
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [uploadCategory, setUploadCategory] = useState<InitialDocumentUploadCategory>("drawing")
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const copy = isArabic
    ? {
        addDocument: "إضافة مستند",
        title: "إضافة مستند للمشروع",
        description: "اختر فئة المستند وارفع الملف لحفظه ضمن مستندات المشروع.",
        categoryLabel: "فئة المستند",
        fileLabel: "الملف",
        dropPrompt: "اسحب الملف هنا أو انقر للاختيار",
        maxSizeNotice: "الحد الأقصى لحجم الملف: 50 ميجابايت",
        cancel: "إلغاء",
        upload: "رفع المستند",
        uploading: "جارٍ الرفع...",
        selectFileError: "يرجى اختيار ملف للرفع.",
        sessionError: "انتهت الجلسة. يرجى تسجيل الدخول مجدداً.",
      }
    : {
        addDocument: "Add Document",
        title: "Add Project Document",
        description: "Select document category and upload file to attach it to this project.",
        categoryLabel: "Document Category",
        fileLabel: "File",
        dropPrompt: "Drag & drop file here or click to browse",
        maxSizeNotice: "Maximum file size: 50 MB",
        cancel: "Cancel",
        upload: "Upload Document",
        uploading: "Uploading...",
        selectFileError: "Please select a file to upload.",
        sessionError: "Your session has expired. Please log in again.",
      }

  function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return
    const selected = files[0]
    const validationError = validateInitialDocumentFile(selected)
    if (validationError) {
      setErrorMessage(validationError)
      return
    }
    setErrorMessage(null)
    setFile(selected)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files)
    }
  }

  function resetForm() {
    setFile(null)
    setPending(false)
    setUploadProgress(0)
    setErrorMessage(null)
    setIsDragOver(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  async function handleUpload() {
    if (!file) {
      setErrorMessage(copy.selectFileError)
      return
    }

    const cardDef = INITIAL_DOCUMENT_UPLOAD_CARDS.find((c) => c.value === uploadCategory)
    const category: InitialDocumentCategory = cardDef?.category || "other"

    setPending(true)
    setErrorMessage(null)
    setUploadProgress(0)

    try {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        throw new Error(copy.sessionError)
      }

      const docId = crypto.randomUUID()
      const sanitizedName = sanitizeInitialDocumentFileName(file.name)
      const storagePath = `${projectId}/${session.user.id}/${docId}/category-${uploadCategory}/${sanitizedName}`

      await uploadStorageAsset(
        file,
        storagePath,
        session.access_token,
        (progress) => setUploadProgress(progress),
        INITIAL_DOCUMENTS_BUCKET,
        true,
      )

      const saveRes = await saveInitialDocumentAction({
        id: docId,
        projectId,
        category,
        storagePath,
        originalFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      })

      if (!saveRes.ok) {
        throw new Error(saveRes.error || "Failed to save document record.")
      }

      resetForm()
      setOpen(false)
      router.refresh()
      onSuccess?.()
    } catch (err: any) {
      console.error("[AddProjectDocumentModal] upload failed:", err)
      setErrorMessage(err?.message || "Upload failed. Please try again.")
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          setOpen(nextOpen)
          if (!nextOpen) resetForm()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size={buttonSize} variant={buttonVariant} className={buttonClassName}>
          <Plus className="size-4 shrink-0" />
          <span>{triggerText || copy.addDocument}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">{copy.categoryLabel}</label>
            <Select
              value={uploadCategory}
              onValueChange={(val: unknown) => setUploadCategory(val as InitialDocumentUploadCategory)}
              disabled={pending}
            >
              <SelectTrigger className="h-10 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INITIAL_DOCUMENT_UPLOAD_CARDS.map((card) => (
                  <SelectItem key={card.value} value={card.value}>
                    {isArabic ? card.labelAr : card.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">{copy.fileLabel}</label>

            {file ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{formatInitialDocumentFileSize(file.size)}</p>
                  </div>
                </div>
                {!pending ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ""
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors",
                  isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
                  pending && "pointer-events-none opacity-60",
                )}
              >
                <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <CloudUpload className="size-5" />
                </div>
                <p className="text-xs font-medium text-foreground">{copy.dropPrompt}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{copy.maxSizeNotice}</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={INITIAL_DOCUMENT_ACCEPT}
              className="hidden"
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleFileSelect(e.target.files)}
              disabled={pending}
            />
          </div>

          {pending ? (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>{copy.uploading}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(false)
              resetForm()
            }}
            disabled={pending}
          >
            {copy.cancel}
          </Button>
          <Button type="button" onClick={handleUpload} disabled={!file || pending}>
            {pending ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
            {pending ? copy.uploading : copy.upload}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
