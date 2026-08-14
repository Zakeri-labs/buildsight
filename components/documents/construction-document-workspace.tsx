"use client"

import { useState } from "react"
import {
  Download,
  Eye,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  Paperclip,
} from "lucide-react"
import { formatFileSize } from "@/lib/documents/simple-upload"
import { parseBilingualDocumentDetails } from "@/lib/documents/bilingual-details"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type DocumentAttachmentView = {
  id: string
  attachmentType: "file" | "image"
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export function ConstructionDocumentWorkspace({
  documentId,
  projectId,
  initialDetails,
  attachments,
}: {
  documentId: string
  projectId: string
  initialDetails: string
  attachments: DocumentAttachmentView[]
}) {
  const parsedInitial = parseBilingualDocumentDetails(initialDetails)
  const englishText = parsedInitial.englishText
  const arabicText = parsedInitial.arabicText ?? ""
  const hasArabic = parsedInitial.hasArabic && Boolean(arabicText.trim())

  const [imageAction, setImageAction] = useState<{ id: string; type: "view" | "download" } | null>(null)
  const [previewImage, setPreviewImage] = useState<{ attachment: DocumentAttachmentView; url: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const getImageSignedUrl = async (image: DocumentAttachmentView, download = false) => {
    const params = new URLSearchParams({ path: image.storagePath, signed: "1" })
    if (download) {
      params.set("download", "1")
      params.set("filename", image.originalFilename)
    }

    const response = await fetch(`/api/document-images?${params.toString()}`, { cache: "no-store" })
    if (!response.ok) throw new Error(download ? "Unable to download this image." : "Unable to open this image.")

    const payload = (await response.json()) as { signedUrl?: string }
    if (!payload.signedUrl) throw new Error(download ? "Unable to download this image." : "Unable to open this image.")
    return payload.signedUrl
  }

  const viewImage = async (image: DocumentAttachmentView) => {
    setImageAction({ id: image.id, type: "view" })
    setErrorMsg(null)
    try {
      setPreviewImage({ attachment: image, url: await getImageSignedUrl(image) })
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Unable to open this image.")
    } finally {
      setImageAction(null)
    }
  }

  return (
    <div className="grid gap-5">
      {/* Published Read-Only Letter Content */}
      <Card className="gap-0 py-0">
        <CardContent className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
          {/* Primary English Content (Clean Document Prose) */}
          <div className="whitespace-pre-wrap font-sans text-sm sm:text-base leading-relaxed text-slate-900 dark:text-slate-100">
            {englishText}
          </div>

          {/* Optional Arabic Translation with Green Separator */}
          {hasArabic ? (
            <div className="pt-6 border-t-2 border-emerald-500/80 my-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-3">
                ARABIC TRANSLATION
              </h4>
              <div
                dir="rtl"
                className="whitespace-pre-wrap font-sans text-sm sm:text-base leading-relaxed text-right text-slate-900 dark:text-slate-100"
              >
                {arabicText}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {errorMsg ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {errorMsg}
        </div>
      ) : null}

      {/* Unified Single Attachments Section (Read-Only) */}
      <Card className="gap-0 py-0">
        <CardHeader className="flex-row items-center gap-3 border-b px-5 py-4 sm:px-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <Paperclip className="size-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base">Attachments</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Supporting files, reports, specifications, site photos and visual evidence.
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-5 py-5 sm:px-6">
          {attachments.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex items-start gap-3">
                    {attachment.attachmentType === "image" ? (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                        <ImageIcon className="size-4" />
                      </span>
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                        <FileIcon className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-xs font-semibold text-foreground"
                        title={attachment.originalFilename}
                      >
                        {attachment.originalFilename}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatFileSize(attachment.sizeBytes)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-border/50 pt-2">
                    {attachment.attachmentType === "image" ? (
                      <button
                        type="button"
                        disabled={Boolean(imageAction)}
                        onClick={() => void viewImage(attachment)}
                        className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        title="View image"
                      >
                        {imageAction?.id === attachment.id && imageAction.type === "view" ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Eye className="size-3.5" />
                        )}
                      </button>
                    ) : null}

                    <a
                      href={
                        attachment.attachmentType === "image"
                          ? `/api/document-images?path=${encodeURIComponent(attachment.storagePath)}&download=1&filename=${encodeURIComponent(attachment.originalFilename)}`
                          : `/api/document-files?path=${encodeURIComponent(attachment.storagePath)}&download=1&filename=${encodeURIComponent(attachment.originalFilename)}`
                      }
                      className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="Download file"
                    >
                      <Download className="size-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-5 text-center text-muted-foreground">
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
                <Paperclip className="size-5" />
              </span>
              <p className="text-xs">No attachments added yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Image Preview Modal */}
      <Dialog
        open={Boolean(previewImage)}
        onOpenChange={(open: boolean) => {
          if (!open) setPreviewImage(null)
        }}
      >
        <DialogContent className="h-[min(92dvh,960px)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-4 sm:max-w-5xl">
          <DialogHeader className="pe-10">
            <DialogTitle className="truncate">{previewImage?.attachment.originalFilename}</DialogTitle>
            <DialogDescription>
              {previewImage
                ? `${formatFileSize(previewImage.attachment.sizeBytes)} · Image Preview`
                : "Image Preview"}
            </DialogDescription>
          </DialogHeader>
          {previewImage ? (
            <div className="flex min-h-0 items-center justify-center overflow-auto rounded-xl border bg-black/90 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage.url}
                alt={previewImage.attachment.originalFilename}
                className="max-h-full max-w-full object-contain"
                onError={() => {
                  setPreviewImage(null)
                  setErrorMsg("Unable to display this image.")
                }}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
