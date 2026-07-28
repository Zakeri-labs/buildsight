"use client"

import { useEffect, useRef, useState } from "react"
import { ImageIcon, ImagePlus, Loader2, Trash2, Upload } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  PROJECT_IMAGE_ACCEPT,
  PROJECT_IMAGE_BUCKET,
  projectImageDisplayUrl,
  validateProjectImageFile,
} from "@/lib/projects/project-image"

export function ProjectImageManagementDialog({
  projectId,
  projectName,
  currentImage,
  onSaved,
}: {
  projectId: string
  projectName: string
  currentImage: string | null
  onSaved: (imageUrl: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [storedImage, setStoredImage] = useState<string | null>(projectImageDisplayUrl(currentImage))
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [removeRequested, setRemoveRequested] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setStoredImage(projectImageDisplayUrl(currentImage))
    setImageFailed(false)
  }, [currentImage])

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function resetDraft() {
    setFile(null)
    setRemoveRequested(false)
    setError(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  function chooseFile(next: File | null) {
    if (!next) return
    const validationError = validateProjectImageFile(next)
    if (validationError) {
      setError(validationError)
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    setError(null)
    setFile(next)
    setRemoveRequested(false)
    setImageFailed(false)
  }

  async function postProjectImage(body: Record<string, unknown>) {
    const response = await fetch("/api/project-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, projectId }),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      imageUrl?: string | null
      storagePath?: string
      token?: string
    }
    if (!response.ok) throw new Error(payload.error || "Unable to update the project image.")
    return payload
  }

  async function save() {
    if (!file && !removeRequested) {
      setOpen(false)
      return
    }

    setPending(true)
    setError(null)
    try {
      let imageUrl: string | null = null
      if (file) {
        const prepared = await postProjectImage({
          action: "prepare",
          filename: file.name,
          contentType: file.type,
          size: file.size,
        })
        if (!prepared.storagePath || !prepared.token) {
          throw new Error("The project image upload could not be prepared.")
        }

        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from(PROJECT_IMAGE_BUCKET)
          .uploadToSignedUrl(prepared.storagePath, prepared.token, file, {
            contentType: file.type,
            upsert: false,
          })
        if (uploadError) throw new Error(`Project image upload failed: ${uploadError.message}`)

        const finalized = await postProjectImage({ action: "finalize", storagePath: prepared.storagePath })
        imageUrl = finalized.imageUrl ?? null
      } else {
        await postProjectImage({ action: "remove" })
      }

      setStoredImage(imageUrl)
      setImageFailed(false)
      onSaved(imageUrl)
      resetDraft()
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the project image.")
    } finally {
      setPending(false)
    }
  }

  const displayImage = removeRequested ? null : previewUrl ?? storedImage

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next && !pending) resetDraft()
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="secondary" className="shadow-sm">
            <ImagePlus className="size-4" data-icon="inline-start" />
            {storedImage ? "Edit image" : "Add image"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Project image</DialogTitle>
          <DialogDescription>
            Add or replace the dashboard image for {projectName}. Upload a JPG, PNG, or WEBP file up to 10 MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl border bg-muted/20">
            <div className="aspect-[16/9] w-full bg-muted/30">
              {displayImage && !imageFailed ? (
                // Object URLs and authenticated project-image routes are safe local display sources.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayImage}
                  alt={`${projectName} project preview`}
                  className="size-full object-cover"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon className="size-10" />
                  <span className="text-sm">No project image</span>
                </div>
              )}
            </div>
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              {removeRequested
                ? "The current image will be removed when you save."
                : file
                  ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`
                  : storedImage
                    ? "Current project image"
                    : "Choose an image to preview it before saving."}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`project-image-${projectId}`}>Project image</Label>
            <input
              ref={inputRef}
              id={`project-image-${projectId}`}
              type="file"
              accept={`${PROJECT_IMAGE_ACCEPT},.jpg,.jpeg,.png,.webp`}
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={pending}>
                <Upload className="size-4" data-icon="inline-start" />
                {storedImage || file ? "Upload replacement" : "Upload image"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={pending || (!storedImage && !file)}
                onClick={() => {
                  setFile(null)
                  setRemoveRequested(true)
                  setImageFailed(false)
                  if (inputRef.current) inputRef.current.value = ""
                }}
              >
                <Trash2 className="size-4" data-icon="inline-start" />
                Remove image
              </Button>
            </div>
          </div>

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || (!file && !removeRequested)}>
            {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
