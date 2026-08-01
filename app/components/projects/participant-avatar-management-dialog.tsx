"use client"

import { useEffect, useRef, useState } from "react"
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  PARTICIPANT_AVATAR_ACCEPT,
  PARTICIPANT_AVATAR_BUCKET,
  validateParticipantAvatarFile,
} from "@/lib/projects/participant-avatar"

export function ParticipantAvatarManagementDialog({
  open,
  onOpenChange,
  projectId,
  participantId,
  participantName,
  participantEmail,
  currentAvatar,
  initialRemove = false,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  participantId: string
  participantName: string
  participantEmail?: string
  currentAvatar: string | null
  initialRemove?: boolean
  onSaved: (avatarUrl: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [storedAvatar, setStoredAvatar] = useState<string | null>(currentAvatar)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [removeRequested, setRemoveRequested] = useState(initialRemove)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setStoredAvatar(currentAvatar)
    setFile(null)
    setRemoveRequested(initialRemove)
    setError(null)
    if (inputRef.current) inputRef.current.value = ""
  }, [currentAvatar, initialRemove, participantId, open])

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function chooseFile(next: File | null) {
    if (!next) return
    const validationError = validateParticipantAvatarFile(next)
    if (validationError) {
      setError(validationError)
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    setError(null)
    setFile(next)
    setRemoveRequested(false)
  }

  async function postParticipantAvatar(body: Record<string, unknown>) {
    const response = await fetch("/api/participant-avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, projectId, participantId }),
    })
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string
      avatarUrl?: string | null
      storagePath?: string
      token?: string
    }
    if (!response.ok) throw new Error(payload.error || "Unable to update participant image.")
    return payload
  }

  async function save() {
    if (!file && !removeRequested) {
      onOpenChange(false)
      return
    }

    setPending(true)
    setError(null)
    try {
      let avatarUrl: string | null = null
      if (file) {
        const prepared = await postParticipantAvatar({
          action: "prepare",
          filename: file.name,
          contentType: file.type,
          size: file.size,
        })
        if (!prepared.storagePath || !prepared.token) {
          throw new Error("The participant image upload could not be prepared.")
        }

        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from(PARTICIPANT_AVATAR_BUCKET)
          .uploadToSignedUrl(prepared.storagePath, prepared.token, file, {
            contentType: file.type,
            upsert: false,
          })
        if (uploadError) throw new Error(`Participant image upload failed: ${uploadError.message}`)

        const finalized = await postParticipantAvatar({
          action: "finalize",
          storagePath: prepared.storagePath,
        })
        avatarUrl = finalized.avatarUrl ?? null
      } else {
        await postParticipantAvatar({ action: "remove" })
      }

      setStoredAvatar(avatarUrl)
      onSaved(avatarUrl)
      setFile(null)
      setRemoveRequested(false)
      if (inputRef.current) inputRef.current.value = ""
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update participant image.")
    } finally {
      setPending(false)
    }
  }

  const displayAvatar = removeRequested ? null : previewUrl ?? storedAvatar

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Participant profile image</DialogTitle>
          <DialogDescription>
            Upload, replace, or remove the project-specific image for {participantName}. A login account is not required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-xl border bg-muted/20 p-4">
            <ProfileAvatar
              name={participantName}
              email={participantEmail ?? ""}
              avatarUrl={displayAvatar}
              size="lg"
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{participantName}</p>
              <p className="text-sm text-muted-foreground">
                {removeRequested
                  ? "The image will be removed when you save."
                  : file
                    ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`
                    : storedAvatar
                      ? "Current participant image"
                      : "No participant image"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`participant-avatar-${participantId}`}>Profile image</Label>
            <input
              ref={inputRef}
              id={`participant-avatar-${participantId}`}
              type="file"
              accept={`${PARTICIPANT_AVATAR_ACCEPT},.jpg,.jpeg,.png,.webp`}
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={pending}>
                <Upload className="size-4" data-icon="inline-start" />
                {storedAvatar || file ? "Upload replacement" : "Upload image"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={pending || (!storedAvatar && !file)}
                onClick={() => {
                  setFile(null)
                  setRemoveRequested(true)
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || (!file && !removeRequested)}>
            {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <ImagePlus className="size-4" data-icon="inline-start" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
