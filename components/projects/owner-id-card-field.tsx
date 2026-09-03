"use client"

import { useEffect, useRef, useState, type DragEvent } from "react"
import { Camera, FileText, FileUp, ImageIcon, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/lib/i18n"
import { OWNER_ID_CARD_ACCEPT, validateOwnerIdCardFile } from "@/lib/projects/owner-id-card"
import { cn } from "@/lib/utils"

export interface OwnerIdCardFieldProps {
  id?: string
  file: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
  label?: string
  help?: string
  chooseLabel?: string
  captureLabel?: string
  replaceLabel?: string
  removeLabel?: string
  emptyLabel?: string
}

export function OwnerIdCardField({
  id = "owner-id-card-input",
  file,
  onChange,
  disabled = false,
  label,
  help,
  chooseLabel,
  captureLabel,
  replaceLabel,
  removeLabel,
  emptyLabel,
}: OwnerIdCardFieldProps) {
  const { locale } = useI18n()
  const isArabic = locale === "ar"

  const finalLabel = label ?? (isArabic ? "مسح / التقاط بطاقة الهوية (اختياري)" : "Scan / Capture ID Card (Optional)")
  const finalHelp = help ?? (isArabic ? "ملفات JPG أو PNG أو WebP أو PDF حتى 10 ميغابايت." : "JPG, PNG, WebP, or PDF up to 10 MB.")
  const finalChooseLabel = chooseLabel ?? (isArabic ? "اختيار بطاقة الهوية" : "Choose ID Card")
  const finalCaptureLabel = captureLabel ?? (isArabic ? "التقاط بالكاميرا" : "Capture with Camera")
  const finalReplaceLabel = replaceLabel ?? (isArabic ? "استبدال بطاقة الهوية" : "Replace ID Card")
  const finalRemoveLabel = removeLabel ?? (isArabic ? "إزالة" : "Remove")
  const finalEmptyLabel = emptyLabel ?? (isArabic ? "لم يتم اختيار بطاقة الهوية" : "No ID card selected")

  const inputRef = useRef<HTMLInputElement>(null)
  const captureInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  function selectFile(nextFile: File | null) {
    if (!nextFile) return
    const validationError = validateOwnerIdCardFile(nextFile)
    if (validationError) {
      setLocalError(validationError)
      if (inputRef.current) inputRef.current.value = ""
      if (captureInputRef.current) captureInputRef.current.value = ""
      return
    }
    setLocalError(null)
    onChange(nextFile)
    if (inputRef.current) inputRef.current.value = ""
    if (captureInputRef.current) captureInputRef.current.value = ""
  }

  function removeFile() {
    setLocalError(null)
    onChange(null)
    if (inputRef.current) inputRef.current.value = ""
    if (captureInputRef.current) captureInputRef.current.value = ""
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && !isDraggingOver) {
      setIsDraggingOver(true)
    }
  }

  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && !isDraggingOver) {
      setIsDraggingOver(true)
    }
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDraggingOver(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
    if (disabled) return
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      selectFile(droppedFile)
    }
  }

  const dropZoneText = isDraggingOver
    ? isArabic
      ? "أسقط بطاقة الهوية هنا"
      : "Drop ID card here"
    : file
    ? file.name
    : finalEmptyLabel

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{finalLabel}</Label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={OWNER_ID_CARD_ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />
      <input
        ref={captureInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        aria-label={finalCaptureLabel}
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "rounded-xl border border-dashed p-3 transition-colors",
          isDraggingOver
            ? "border-primary bg-primary/5 ring-2 ring-primary/20 dark:border-primary dark:bg-primary/10"
            : "bg-background hover:border-primary/50 hover:bg-muted/20",
          disabled && "pointer-events-none opacity-60"
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={file?.name || finalLabel} className="size-full object-cover" />
            ) : file ? (
              file.type === "application/pdf" ? (
                <FileText className="size-7 text-muted-foreground" />
              ) : (
                <ImageIcon className="size-7 text-muted-foreground" />
              )
            ) : (
              <Camera className="size-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate text-sm font-medium",
                !file && "text-muted-foreground",
                isDraggingOver && "font-semibold text-primary"
              )}
            >
              {dropZoneText}
            </p>
            {file ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(file.size >= 1024 * 1024 ? 1 : 2)} MB
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
              >
                <FileUp className="size-4" />
                {file ? finalReplaceLabel : finalChooseLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => captureInputRef.current?.click()}
                disabled={disabled}
              >
                <Camera className="size-4" />
                {finalCaptureLabel}
              </Button>
              {file ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeFile}
                  disabled={disabled}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  {finalRemoveLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{finalHelp}</p>
      {localError ? <p role="alert" className="text-xs text-destructive">{localError}</p> : null}
    </div>
  )
}
