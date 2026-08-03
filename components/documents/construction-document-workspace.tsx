"use client"

import { useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  File as FileIcon,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Paperclip,
  Save,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react"
import {
  addDocumentAttachmentsAction,
  removeDocumentAttachmentAction,
  updateConstructionDocumentDetailsAction,
  type DocumentAttachmentInput,
} from "@/lib/actions/documents"
import { createClient } from "@/lib/supabase/client"
import { uploadDocumentAsset } from "@/lib/documents/storage-upload"
import { formatFileSize } from "@/lib/documents/simple-upload"
import { Button } from "@/components/ui/button"
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

type UploadProgress = {
  filename: string
  current: number
  total: number
  progress: number
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
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const [details, setDetails] = useState(initialDetails)
  const [savingDetails, setSavingDetails] = useState(false)
  const [uploading, setUploading] = useState<UploadProgress | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [imageAction, setImageAction] = useState<{ id: string; type: "view" | "download" } | null>(null)
  const [previewImage, setPreviewImage] = useState<{ attachment: DocumentAttachmentView; url: string } | null>(null)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const files = attachments.filter((attachment) => attachment.attachmentType === "file")
  const images = attachments.filter((attachment) => attachment.attachmentType === "image")

  const saveDetails = async () => {
    setSavingDetails(true)
    setMessage(null)
    try {
      const result = await updateConstructionDocumentDetailsAction({ documentId, projectId, details })
      if (!result.ok) {
        setMessage({ type: "error", text: result.error })
        return
      }
      setMessage({ type: "success", text: "Letter details saved." })
      router.refresh()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to save letter details." })
    } finally {
      setSavingDetails(false)
    }
  }

  const uploadSelected = async (event: ChangeEvent<HTMLInputElement>, attachmentType: "file" | "image") => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (!selected.length) return
    setMessage(null)

    const invalid = selected.find((file) => {
      if (file.size <= 0 || file.size > 50 * 1024 * 1024) return true
      if (attachmentType === "image") return !file.type.startsWith("image/")
      return file.type.startsWith("image/")
    })
    if (invalid) {
      setMessage({
        type: "error",
        text: attachmentType === "image"
          ? "Images must be valid image files and no larger than 50 MB each."
          : invalid.type.startsWith("image/")
            ? "Add image files in the Images section."
            : "Files must be larger than 0 bytes and no larger than 50 MB each.",
      })
      return
    }

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setMessage({ type: "error", text: "Your session has expired. Sign in again." })
      return
    }

    const uploadedPaths: string[] = []
    const records: DocumentAttachmentInput[] = []
    const folder = attachmentType === "image" ? "images" : "files"

    try {
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index]
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment"
        const storagePath = `${projectId}/${session.user.id}/documents/${documentId}/${folder}/${crypto.randomUUID()}-${safeName}`
        setUploading({ filename: file.name, current: index + 1, total: selected.length, progress: 0 })
        await uploadDocumentAsset(file, storagePath, session.access_token, (progress) => {
          setUploading({ filename: file.name, current: index + 1, total: selected.length, progress })
        })
        uploadedPaths.push(storagePath)
        records.push({
          attachmentType,
          storagePath,
          originalFilename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        })
      }

      const result = await addDocumentAttachmentsAction({ documentId, projectId, attachments: records })
      if (!result.ok) throw new Error(result.error)
      setMessage({ type: "success", text: `${selected.length} ${attachmentType === "image" ? "image" : "file"}${selected.length === 1 ? "" : "s"} added.` })
      router.refresh()
    } catch (error) {
      if (uploadedPaths.length) await supabase.storage.from("document-images").remove(uploadedPaths)
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to upload attachments." })
    } finally {
      setUploading(null)
    }
  }

  const removeAttachment = async (attachment: DocumentAttachmentView) => {
    setRemovingId(attachment.id)
    setMessage(null)
    try {
      const result = await removeDocumentAttachmentAction({
        attachmentId: attachment.id,
        documentId,
        projectId,
      })
      if (!result.ok) {
        setMessage({ type: "error", text: result.error })
        return
      }
      setMessage({ type: "success", text: `${attachment.originalFilename} removed.` })
      router.refresh()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to remove the attachment." })
    } finally {
      setRemovingId(null)
    }
  }

  const getImageSignedUrl = async (image: DocumentAttachmentView, download = false) => {
    const params = new URLSearchParams({ path: image.storagePath, signed: "1" })
    if (download) {
      params.set("download", "1")
      params.set("filename", image.originalFilename)
    }

    const response = await fetch(`/api/document-images?${params.toString()}`, { cache: "no-store" })
    if (!response.ok) throw new Error(download ? "Unable to download this image." : "Unable to open this image.")

    const payload = await response.json() as { signedUrl?: string }
    if (!payload.signedUrl) throw new Error(download ? "Unable to download this image." : "Unable to open this image.")
    return payload.signedUrl
  }

  const viewImage = async (image: DocumentAttachmentView) => {
    setImageAction({ id: image.id, type: "view" })
    setMessage(null)
    try {
      setPreviewImage({ attachment: image, url: await getImageSignedUrl(image) })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to open this image." })
    } finally {
      setImageAction(null)
    }
  }

  const downloadImage = async (image: DocumentAttachmentView) => {
    setImageAction({ id: image.id, type: "download" })
    setMessage(null)
    try {
      const link = document.createElement("a")
      link.href = await getImageSignedUrl(image, true)
      link.download = image.originalFilename
      link.rel = "noreferrer"
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to download this image." })
    } finally {
      setImageAction(null)
    }
  }

  return (
    <div className="grid gap-5">
      <Card className="gap-0 py-0">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <div>
            <CardTitle className="text-lg">Letter Details</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Edit the predefined template or replace it with project-specific information.</p>
          </div>
          <Button variant="outline" size="sm" disabled={!details || savingDetails} onClick={() => setDetails("")}>Clear Template</Button>
        </CardHeader>
        <CardContent className="px-5 py-5 sm:px-6">
          <textarea
            value={details}
            maxLength={100000}
            disabled={savingDetails}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDetails(event.target.value)}
            aria-label="Letter details"
            className="min-h-[360px] w-full resize-y rounded-xl border border-input bg-white px-4 py-4 font-mono text-sm leading-7 outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-slate-950"
            placeholder="Add letter-specific information..."
          />
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-xs tabular-nums text-muted-foreground">{details.length.toLocaleString("en-GB")} / 100,000 characters</span>
            <Button disabled={savingDetails} onClick={() => void saveDetails()}>
              {savingDetails ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Details
            </Button>
          </div>
        </CardContent>
      </Card>

      {message ? (
        <div className={message.type === "success"
          ? "flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"}
        >
          {message.type === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      ) : null}

      {uploading ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/40">
          <div className="mb-2 flex items-center justify-between gap-4 text-xs font-medium text-blue-800 dark:text-blue-200">
            <span className="min-w-0 truncate">Uploading {uploading.current} of {uploading.total}: {uploading.filename}</span>
            <span className="shrink-0 tabular-nums">{uploading.progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900">
            <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${uploading.progress}%` }} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <AttachmentCard
          title="Attachments"
          description="Supporting files, reports, specifications and drawings."
          icon={<Paperclip className="size-5" />}
          actionLabel="Add File"
          actionIcon={<UploadCloud className="size-4" />}
          disabled={Boolean(uploading)}
          onAction={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => void uploadSelected(event, "file")} />
          {files.length ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><FileIcon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={file.originalFilename}>{file.originalFilename}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(file.sizeBytes)}</p>
                  </div>
                  <a
                    href={`/api/document-files?path=${encodeURIComponent(file.storagePath)}&download=1&filename=${encodeURIComponent(file.originalFilename)}`}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Download file"
                  ><Download className="size-4" /></a>
                  <button
                    type="button"
                    disabled={removingId === file.id}
                    onClick={() => void removeAttachment(file)}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
                    title="Remove file"
                  >{removingId === file.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</button>
                </div>
              ))}
            </div>
          ) : <EmptyAttachmentState icon={<FileIcon className="size-6" />} text="No files added yet." />}
        </AttachmentCard>

        <AttachmentCard
          title="Images"
          description="Site photos and visual inspection evidence."
          icon={<ImageIcon className="size-5" />}
          actionLabel="Add Images"
          actionIcon={<ImagePlus className="size-4" />}
          disabled={Boolean(uploading)}
          onAction={() => imageInputRef.current?.click()}
        >
          <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => void uploadSelected(event, "image")} />
          {images.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((image) => (
                <div key={image.id} className="overflow-hidden rounded-xl border bg-muted/30">
                  <div className="aspect-square overflow-hidden bg-slate-100 dark:bg-slate-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/document-images?path=${encodeURIComponent(image.storagePath)}`} alt={image.originalFilename} className="size-full object-cover" />
                  </div>
                  <div className="border-t p-2.5">
                    <p className="truncate text-xs font-medium" title={image.originalFilename}>{image.originalFilename}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">{formatFileSize(image.sizeBytes)}</p>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          disabled={Boolean(imageAction) || removingId === image.id}
                          onClick={() => void viewImage(image)}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                          title="View full image"
                          aria-label={`View ${image.originalFilename}`}
                        >{imageAction?.id === image.id && imageAction.type === "view" ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}</button>
                        <button
                          type="button"
                          disabled={Boolean(imageAction) || removingId === image.id}
                          onClick={() => void downloadImage(image)}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                          title="Download image"
                          aria-label={`Download ${image.originalFilename}`}
                        >{imageAction?.id === image.id && imageAction.type === "download" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}</button>
                        <button
                          type="button"
                          disabled={Boolean(imageAction) || removingId === image.id}
                          onClick={() => void removeAttachment(image)}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
                          title="Remove image"
                          aria-label={`Remove ${image.originalFilename}`}
                        >{removingId === image.id ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyAttachmentState icon={<ImageIcon className="size-6" />} text="No images added yet." />}
        </AttachmentCard>
      </div>

      <Dialog open={Boolean(previewImage)} onOpenChange={(open: boolean) => { if (!open) setPreviewImage(null) }}>
        <DialogContent className="h-[min(92dvh,960px)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-4 sm:max-w-5xl">
          <DialogHeader className="pe-10">
            <DialogTitle className="truncate">{previewImage?.attachment.originalFilename}</DialogTitle>
            <DialogDescription>
              {previewImage ? `${formatFileSize(previewImage.attachment.sizeBytes)} · Full image preview` : "Full image preview"}
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
                  setMessage({ type: "error", text: "Unable to display this image. Check your access and try again." })
                }}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AttachmentCard({
  title,
  description,
  icon,
  actionLabel,
  actionIcon,
  disabled,
  onAction,
  children,
}: {
  title: string
  description: string
  icon: ReactNode
  actionLabel: string
  actionIcon: ReactNode
  disabled: boolean
  onAction: () => void
  children: ReactNode
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex-row items-center justify-between gap-4 border-b px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">{icon}</span>
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button variant="outline" disabled={disabled} onClick={onAction}>{actionIcon}{actionLabel}</Button>
      </CardHeader>
      <CardContent className="px-5 py-5">{children}</CardContent>
    </Card>
  )
}

function EmptyAttachmentState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-5 text-center text-muted-foreground">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  )
}
