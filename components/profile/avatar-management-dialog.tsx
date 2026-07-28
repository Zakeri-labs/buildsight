"use client"

import { useEffect, useRef, useState } from "react"
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react"
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
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import {
  isAllowedProfileAvatarType,
  PROFILE_AVATAR_BUCKET,
  PROFILE_AVATAR_MAX_BYTES,
} from "@/lib/profile-avatar"

export function AvatarManagementDialog({
  targetUser,
  organizationId,
  triggerLabel = "Edit Profile Image",
  onSaved,
  triggerVariant = "ghost",
  triggerSize = "sm",
}: {
  targetUser: { id: string; name: string; email: string; avatarUrl: string | null }
  organizationId?: string
  triggerLabel?: string
  onSaved?: (avatarUrl: string | null) => void
  triggerVariant?: "default" | "outline" | "ghost"
  triggerSize?: "default" | "sm" | "lg" | "icon"
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(targetUser.avatarUrl)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [removeRequested, setRemoveRequested] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setCurrentAvatar(targetUser.avatarUrl), [targetUser.avatarUrl])

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
    setError(null)
    if (!next) return
    if (!isAllowedProfileAvatarType(next.type)) {
      setError("Only JPG, PNG, and WEBP images are allowed.")
      return
    }
    if (next.size <= 0 || next.size > PROFILE_AVATAR_MAX_BYTES) {
      setError("Profile images must be 5 MB or smaller.")
      return
    }
    setFile(next)
    setRemoveRequested(false)
  }

  async function postAvatar(body: Record<string, unknown>) {
    const response = await fetch("/api/profile-avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, targetUserId: targetUser.id, organizationId }),
    })
    const payload = (await response.json().catch(() => ({}))) as { error?: string; avatarUrl?: string | null; storagePath?: string; token?: string }
    if (!response.ok) throw new Error(payload.error || "Unable to update profile image.")
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
      let avatarUrl: string | null = null
      if (file) {
        const prepared = await postAvatar({
          action: "prepare",
          filename: file.name,
          contentType: file.type,
          size: file.size,
        })
        if (!prepared.storagePath || !prepared.token) throw new Error("The avatar upload could not be prepared.")

        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from(PROFILE_AVATAR_BUCKET)
          .uploadToSignedUrl(prepared.storagePath, prepared.token, file, {
            contentType: file.type,
            upsert: false,
          })
        if (uploadError) throw new Error(`Avatar upload failed: ${uploadError.message}`)

        const finalized = await postAvatar({ action: "finalize", storagePath: prepared.storagePath })
        avatarUrl = finalized.avatarUrl ?? prepared.storagePath
      } else {
        await postAvatar({ action: "remove" })
      }

      setCurrentAvatar(avatarUrl)
      onSaved?.(avatarUrl)
      resetDraft()
      setOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update profile image.")
    } finally {
      setPending(false)
    }
  }

  const displayAvatar = removeRequested ? null : previewUrl ?? currentAvatar

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
          <Button variant={triggerVariant} size={triggerSize}>
            <ImagePlus className="size-4" data-icon="inline-start" />
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile image</DialogTitle>
          <DialogDescription>
            Upload a JPG, PNG, or WEBP image. The maximum file size is 5 MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-xl border bg-muted/20 p-4">
            {previewUrl ? (
              <div className="size-20 overflow-hidden rounded-full border bg-muted">
                {/* Object URLs are local previews and never leave the browser. */}
                <img src={previewUrl} alt="Selected profile preview" className="size-full object-cover" />
              </div>
            ) : (
              <ProfileAvatar
                name={targetUser.name}
                email={targetUser.email}
                avatarUrl={displayAvatar}
                size="xl"
              />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold">{targetUser.name}</p>
              <p className="truncate text-sm text-muted-foreground">{targetUser.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {removeRequested ? "The current image will be removed when saved." : file ? file.name : "Current profile image"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`avatar-${targetUser.id}`}>Profile image</Label>
            <input
              ref={inputRef}
              id={`avatar-${targetUser.id}`}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={pending}>
                <Upload className="size-4" data-icon="inline-start" />
                Upload new image
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={pending || (!currentAvatar && !file)}
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

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
