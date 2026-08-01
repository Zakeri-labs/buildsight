"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Images,
  Loader2,
  Save,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import {
  PROJECT_IMAGE_ACCEPT,
  PROJECT_IMAGE_BUCKET,
  validateProjectImageFile,
} from "@/lib/projects/project-image"
import type { ProjectGalleryImage } from "@/lib/projects/project-gallery"

function normaliseImages(images: ProjectGalleryImage[]) {
  return images
    .filter((image) => Boolean(image.imageUrl))
    .map((image, index) => ({ ...image, orderIndex: index, isCover: index === 0 }))
}

export function ProjectGalleryView({
  projectId,
  projectName,
  initialImages,
  canManage,
}: {
  projectId: string
  projectName: string
  initialImages: ProjectGalleryImage[]
  canManage: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState(() => normaliseImages(initialImages))
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderDirty, setOrderDirty] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProjectGalleryImage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setImages(normaliseImages(initialImages))
    setOrderDirty(false)
  }, [initialImages])

  const selectedIndex = useMemo(
    () => images.findIndex((image) => image.id === selectedImageId),
    [images, selectedImageId],
  )
  const selectedImage = selectedIndex >= 0 ? images[selectedIndex] : null

  async function postGallery(body: Record<string, unknown>) {
    const response = await fetch("/api/project-gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, projectId }),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      storagePath?: string
      token?: string
      images?: ProjectGalleryImage[]
    }
    if (!response.ok) throw new Error(payload.error || "Unable to update the project gallery.")
    return payload
  }

  function chooseFiles(files: FileList | null) {
    if (!files?.length) return
    const nextFiles: File[] = []
    const validationErrors: string[] = []
    for (const file of Array.from(files)) {
      const validationError = validateProjectImageFile(file)
      if (validationError) validationErrors.push(`${file.name}: ${validationError}`)
      else nextFiles.push(file)
    }
    setPendingFiles((current) => [...current, ...nextFiles])
    setError(validationErrors.length > 0 ? validationErrors.join(" ") : null)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function uploadFiles() {
    if (pendingFiles.length === 0 || uploading) return
    setUploading(true)
    setUploadProgress(0)
    setError(null)

    try {
      const supabase = createClient()
      for (const [index, file] of pendingFiles.entries()) {
        const prepared = await postGallery({
          action: "prepare",
          filename: file.name,
          contentType: file.type,
          size: file.size,
        })
        if (!prepared.storagePath || !prepared.token) {
          throw new Error("The gallery image upload could not be prepared.")
        }

        const { error: uploadError } = await supabase.storage
          .from(PROJECT_IMAGE_BUCKET)
          .uploadToSignedUrl(prepared.storagePath, prepared.token, file, {
            contentType: file.type,
            upsert: false,
          })
        if (uploadError) throw new Error(`Gallery image upload failed: ${uploadError.message}`)

        const finalized = await postGallery({ action: "finalize", storagePath: prepared.storagePath })
        if (finalized.images) setImages(normaliseImages(finalized.images))
        setUploadProgress(Math.round(((index + 1) / pendingFiles.length) * 100))
      }

      setPendingFiles([])
      setUploadOpen(false)
      setOrderDirty(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload project images.")
    } finally {
      setUploading(false)
    }
  }

  function moveImage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= images.length) return
    const next = images.slice()
    const [moved] = next.splice(index, 1)
    next.splice(nextIndex, 0, moved)
    setImages(normaliseImages(next))
    setOrderDirty(true)
  }

  async function saveOrder() {
    if (!orderDirty || savingOrder) return
    setSavingOrder(true)
    setError(null)
    try {
      const result = await postGallery({ action: "reorder", imageIds: images.map((image) => image.id) })
      if (result.images) setImages(normaliseImages(result.images))
      setOrderDirty(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save the gallery order.")
    } finally {
      setSavingOrder(false)
    }
  }

  async function setCover(imageId: string) {
    setSavingOrder(true)
    setError(null)
    try {
      const result = await postGallery({ action: "set-cover", imageId })
      if (result.images) setImages(normaliseImages(result.images))
      setOrderDirty(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to change the project cover.")
    } finally {
      setSavingOrder(false)
    }
  }

  async function removeImage() {
    if (!deleteTarget) return
    setSavingOrder(true)
    setError(null)
    try {
      const result = await postGallery({ action: "delete", imageId: deleteTarget.id })
      const nextImages = normaliseImages(result.images ?? [])
      setImages(nextImages)
      setDeleteTarget(null)
      if (selectedImageId === deleteTarget.id) setSelectedImageId(null)
      setOrderDirty(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove the gallery image.")
    } finally {
      setSavingOrder(false)
    }
  }

  function showPrevious() {
    if (images.length === 0 || selectedIndex < 0) return
    setSelectedImageId(images[(selectedIndex - 1 + images.length) % images.length].id)
  }

  function showNext() {
    if (images.length === 0 || selectedIndex < 0) return
    setSelectedImageId(images[(selectedIndex + 1) % images.length].id)
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" render={<Link href={`/projects/${projectId}`} />} className="-ms-2 mb-2">
            <ArrowLeft className="size-4 rtl:rotate-180" />
            Back to project
          </Button>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Images className="size-6" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Project Gallery</h1>
              <p className="text-sm text-muted-foreground">{projectName} · {images.length} {images.length === 1 ? "image" : "images"}</p>
            </div>
          </div>
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {orderDirty ? (
              <Button onClick={saveOrder} disabled={savingOrder}>
                {savingOrder ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save Order
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="size-4" />
              Add Images
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {images.map((image, index) => (
            <Card key={image.id} className="group gap-0 overflow-hidden py-0">
              <button
                type="button"
                className="relative aspect-[4/3] w-full overflow-hidden bg-muted/30 text-start"
                onClick={() => setSelectedImageId(image.id)}
                aria-label={`Open image ${index + 1} of ${images.length}`}
              >
                <GalleryImage image={image} projectName={projectName} />
                <span className="absolute start-3 top-3 rounded-full bg-background/90 px-2 py-1 text-[11px] font-semibold shadow-sm backdrop-blur">
                  {index + 1}
                </span>
                {image.isCover ? (
                  <Badge className="absolute end-3 top-3 gap-1 shadow-sm">
                    <Star className="size-3 fill-current" />
                    Cover
                  </Badge>
                ) : null}
              </button>

              {canManage && !image.legacy ? (
                <CardContent className="flex items-center justify-between gap-2 border-t p-3">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label="Move image earlier"
                      onClick={() => moveImage(index, -1)}
                      disabled={savingOrder || index === 0}
                    >
                      <ChevronLeft className="size-3.5 rtl:rotate-180" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label="Move image later"
                      onClick={() => moveImage(index, 1)}
                      disabled={savingOrder || index === images.length - 1}
                    >
                      <ChevronRight className="size-3.5 rtl:rotate-180" />
                    </Button>
                  </div>
                  <div className="flex gap-1">
                    {!image.isCover ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setCover(image.id)} disabled={savingOrder}>
                        <Star className="size-3.5" />
                        Set Cover
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      aria-label="Remove image"
                      onClick={() => setDeleteTarget(image)}
                      disabled={savingOrder}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <ImageIcon className="size-8" />
            </span>
            <div>
              <h2 className="font-semibold">No project images yet</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {canManage ? "Add site, progress, and completed-work photos to create the project gallery." : "Project images will appear here when they are added."}
              </p>
            </div>
            {canManage ? (
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="size-4" />
                Add Project Images
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(selectedImage)} onOpenChange={(open) => { if (!open) setSelectedImageId(null) }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-5xl" showCloseButton={false}>
          <DialogTitle className="sr-only">{projectName} gallery preview</DialogTitle>
          <DialogDescription className="sr-only">Large preview of the selected project image.</DialogDescription>
          {selectedImage ? (
            <div className="relative flex min-h-[55vh] items-center justify-center bg-black">
              <GalleryImage image={selectedImage} projectName={projectName} preview />
              <Button
                type="button"
                size="icon-lg"
                variant="secondary"
                className="absolute end-3 top-3 rounded-full bg-background/90 shadow-lg"
                onClick={() => setSelectedImageId(null)}
                aria-label="Close preview"
              >
                <X className="size-5" />
              </Button>
              {images.length > 1 ? (
                <>
                  <Button
                    type="button"
                    size="icon-lg"
                    variant="secondary"
                    className="absolute start-3 top-1/2 -translate-y-1/2 rounded-full bg-background/90 shadow-lg"
                    onClick={showPrevious}
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="size-5 rtl:rotate-180" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-lg"
                    variant="secondary"
                    className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full bg-background/90 shadow-lg"
                    onClick={showNext}
                    aria-label="Next image"
                  >
                    <ChevronRight className="size-5 rtl:rotate-180" />
                  </Button>
                </>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-5 pb-4 pt-12 text-white">
                <span className="truncate text-sm font-medium">{projectName}</span>
                <span className="rounded-full bg-black/40 px-3 py-1 text-xs font-semibold tabular-nums backdrop-blur">
                  {selectedIndex + 1} / {images.length}
                </span>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!uploading) { setUploadOpen(open); if (!open) { setPendingFiles([]); setError(null) } } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Project Images</DialogTitle>
            <DialogDescription>
              Upload JPG, PNG, or WEBP images up to 10 MB each. New images are added to the end of the gallery.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept={`${PROJECT_IMAGE_ACCEPT},.jpg,.jpeg,.png,.webp`}
            className="sr-only"
            onChange={(event) => chooseFiles(event.target.files)}
            disabled={uploading}
          />

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
            >
              <Upload className="size-8" />
              <span className="text-sm font-medium">Choose project images</span>
              <span className="text-xs">Multiple files can be selected</span>
            </button>

            {pendingFiles.length > 0 ? (
              <div className="grid max-h-72 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                {pendingFiles.map((file, index) => (
                  <UploadPreview
                    key={`${file.name}-${file.lastModified}-${index}`}
                    file={file}
                    onRemove={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    disabled={uploading}
                  />
                ))}
              </div>
            ) : null}

            {uploading ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Uploading gallery images…</span>
                  <span className="tabular-nums">{uploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            ) : null}

            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={uploadFiles} disabled={uploading || pendingFiles.length === 0}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload {pendingFiles.length > 0 ? `(${pendingFiles.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !savingOrder) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove project image?</DialogTitle>
            <DialogDescription>
              This image will be removed from the project gallery and Storage. If it is the cover, the next image becomes the new cover.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={savingOrder}>Cancel</Button>
            <Button variant="destructive" onClick={removeImage} disabled={savingOrder}>
              {savingOrder ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Remove Image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GalleryImage({
  image,
  projectName,
  preview = false,
}: {
  image: ProjectGalleryImage
  projectName: string
  preview?: boolean
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [image.imageUrl])

  if (failed) {
    return (
      <div className="flex size-full min-h-48 flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
        <ImageIcon className="size-8" />
        <span className="text-xs">Image unavailable</span>
      </div>
    )
  }

  // Authenticated project-image routes and local object URLs are supported by
  // the browser directly and intentionally bypass Next Image optimisation.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={image.imageUrl}
      alt={`${projectName} project image ${image.orderIndex + 1}`}
      className={preview ? "max-h-[85vh] max-w-full object-contain" : "size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"}
      onError={() => setFailed(true)}
    />
  )
}

function UploadPreview({
  file,
  onRemove,
  disabled,
}: {
  file: File
  onRemove: () => void
  disabled: boolean
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      <div className="relative aspect-[4/3] bg-muted/30">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={file.name} className="size-full object-cover" />
        ) : null}
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          className="absolute end-2 top-2 rounded-full"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${file.name}`}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="p-2">
        <p className="truncate text-xs font-medium">{file.name}</p>
        <p className="text-[11px] text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
      </div>
    </div>
  )
}
