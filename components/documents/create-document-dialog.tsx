"use client"

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  File as FileIcon,
  FilePlus2,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react"
import {
  addDocumentAttachmentsAction,
  createConstructionDocumentAction,
  type DocumentAttachmentInput,
} from "@/lib/actions/documents"
import {
  CONSTRUCTION_DOCUMENT_TYPES,
  getConstructionDocumentType,
  getConstructionDocumentTypeLabel,
  getDocumentDetailsTemplate,
  isConstructionDocumentType,
  type ConstructionDocumentTypeValue,
} from "@/lib/documents/construction-document-types"
import { uploadDocumentAsset } from "@/lib/documents/storage-upload"
import { formatFileSize } from "@/lib/documents/simple-upload"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type PendingAttachment = {
  id: string
  file: File
  attachmentType: "file" | "image"
  previewUrl: string | null
}

type UploadProgress = {
  filename: string
  current: number
  total: number
  progress: number
}

export function CreateDocumentDialog({
  projectId,
  triggerLabel = "Create Letter",
  triggerVariant = "default",
  triggerClassName,
}: {
  projectId?: string | null
  triggerLabel?: string
  triggerVariant?: "default" | "outline"
  triggerClassName?: string
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([])
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [documentType, setDocumentType] = useState<ConstructionDocumentTypeValue | "">("")
  const [description, setDescription] = useState("")
  const [documentDetails, setDocumentDetails] = useState("")
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState<UploadProgress | null>(null)
  const [createdDocumentId, setCreatedDocumentId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "")
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string; code: string | null }>>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [projectsLoaded, setProjectsLoaded] = useState(false)

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments
  }, [pendingAttachments])

  useEffect(() => {
    if (!open) setSelectedProjectId(projectId ?? "")
  }, [open, projectId])

  useEffect(() => () => {
    for (const attachment of pendingAttachmentsRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
  }, [])

  useEffect(() => {
    if (!open || projectsLoaded) return

    let cancelled = false
    const loadProjects = async () => {
      setLoadingProjects(true)
      const supabase = createClient()
      const { data, error: projectsError } = await supabase
        .from("projects")
        .select("id, name, code")
        .order("name", { ascending: true })

      if (cancelled) return
      setLoadingProjects(false)
      setProjectsLoaded(true)

      if (projectsError) {
        setError("Unable to load the Projects available to you.")
        return
      }

      setProjectOptions((data ?? []).map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code ?? null,
      })))
    }

    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [open, projectsLoaded])

  const files = pendingAttachments.filter((attachment) => attachment.attachmentType === "file")
  const images = pendingAttachments.filter((attachment) => attachment.attachmentType === "image")
  const selectedType = documentType ? getConstructionDocumentType(documentType) : null
  const currentProject = projectId ? projectOptions.find((project) => project.id === projectId) ?? null : null
  const selectedProject = selectedProjectId ? projectOptions.find((project) => project.id === selectedProjectId) ?? null : null
  const projectMismatch = Boolean(projectId && selectedProjectId && projectId !== selectedProjectId && currentProject && selectedProject)

  const formatProjectLabel = (project: { name: string; code: string | null }) =>
    project.code?.trim() ? `${project.name} — ${project.code}` : project.name

  const reset = () => {
    for (const attachment of pendingAttachmentsRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
    setTitle("")
    setDocumentType("")
    setDescription("")
    setDocumentDetails("")
    setPendingAttachments([])
    setError(null)
    setSubmitting(false)
    setUploading(null)
    setCreatedDocumentId(null)
    setSelectedProjectId(projectId ?? "")
  }

  const closeDialog = () => {
    if (submitting) return
    setOpen(false)
    reset()
  }

  const handleDocumentTypeChange = (value: string | null) => {
    if (!isConstructionDocumentType(value)) {
      setDocumentType("")
      setDocumentDetails("")
      return
    }

    setDocumentType(value)
    setDocumentDetails(getDocumentDetailsTemplate(value))
  }

  const addAttachments = (event: ChangeEvent<HTMLInputElement>, attachmentType: "file" | "image") => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (!selected.length) return

    const invalid = selected.find((file) => {
      if (file.size <= 0 || file.size > 50 * 1024 * 1024) return true
      if (attachmentType === "image") return !file.type.startsWith("image/")
      return file.type.startsWith("image/")
    })

    if (invalid) {
      setError(
        attachmentType === "image"
          ? "Images must be valid image files and no larger than 50 MB each."
          : invalid.type.startsWith("image/")
            ? "Add image files in the Images section."
            : "Files must be larger than 0 bytes and no larger than 50 MB each.",
      )
      return
    }

    setError(null)
    setPendingAttachments((current) => [
      ...current,
      ...selected.map((file) => ({
        id: crypto.randomUUID(),
        file,
        attachmentType,
        previewUrl: attachmentType === "image" ? URL.createObjectURL(file) : null,
      })),
    ])
  }

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((current) => {
      const attachment = current.find((item) => item.id === id)
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  const saveDocument = async () => {
    setError(null)
    if (!selectedProjectId) {
      setError("Project is required.")
      return
    }
    if (!title.trim()) {
      setError("Letter title is required.")
      return
    }
    if (!isConstructionDocumentType(documentType)) {
      setError("Letter type is required.")
      return
    }

    setSubmitting(true)
    let documentId = createdDocumentId
    let documentWasPersisted = Boolean(createdDocumentId)

    try {
      if (!documentId) {
        const result = await createConstructionDocumentAction({
          projectId: selectedProjectId,
          title,
          documentType,
          shortDescription: description,
          documentDetails,
        })
        if (!result.ok) throw new Error(result.error)
        documentId = result.documentId
        documentWasPersisted = true
        setCreatedDocumentId(documentId)
      }

      if (pendingAttachments.length) {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error("Your session has expired. Sign in again.")

        const attachmentsToUpload = [...pendingAttachments]
        const total = attachmentsToUpload.length
        for (let index = 0; index < attachmentsToUpload.length; index += 1) {
          const pending = attachmentsToUpload[index]
          const folder = pending.attachmentType === "image" ? "images" : "files"
          const safeName = pending.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment"
          const storagePath = `${selectedProjectId}/${session.user.id}/documents/${documentId}/${folder}/${crypto.randomUUID()}-${safeName}`

          setUploading({ filename: pending.file.name, current: index + 1, total, progress: 0 })
          await uploadDocumentAsset(pending.file, storagePath, session.access_token, (progress) => {
            setUploading({ filename: pending.file.name, current: index + 1, total, progress })
          })

          const record: DocumentAttachmentInput = {
            attachmentType: pending.attachmentType,
            storagePath,
            originalFilename: pending.file.name,
            mimeType: pending.file.type || "application/octet-stream",
            sizeBytes: pending.file.size,
          }
          const attachmentResult = await addDocumentAttachmentsAction({
            documentId,
            projectId: selectedProjectId,
            attachments: [record],
          })
          if (!attachmentResult.ok) {
            await supabase.storage.from("document-images").remove([storagePath])
            throw new Error(attachmentResult.error)
          }

          if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl)
          setPendingAttachments((current) => current.filter((item) => item.id !== pending.id))
        }
      }

      setUploading(null)
      setSubmitting(false)
      setOpen(false)
      reset()
      router.refresh()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? documentWasPersisted
            ? `The letter was saved, but attachments could not be completed: ${createError.message}`
            : createError.message
          : "Unable to save the letter.",
      )
      setUploading(null)
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        size="lg"
        variant={triggerVariant}
        className={cn(
          "h-10 rounded-xl px-4 font-semibold shadow-xs",
          triggerVariant === "default" && "bg-blue-600 text-white hover:bg-blue-700",
          triggerClassName,
        )}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        {triggerLabel}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen: boolean) => {
          if (nextOpen) setOpen(true)
          else closeDialog()
        }}
      >
        <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="border-b bg-slate-50 px-6 py-5 dark:bg-slate-900/70">
            <div className="flex items-start gap-3 pe-8">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <FilePlus2 className="size-5" />
              </span>
              <div className="space-y-1">
                <DialogTitle className="text-lg font-semibold">Letter Information</DialogTitle>
                <DialogDescription>Complete the construction letter details and add supporting files before saving.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="max-h-[calc(100vh-11rem)] overflow-y-auto bg-slate-50/40 px-5 py-5 dark:bg-slate-950/20 sm:px-6">
            <div className="grid gap-5">
              <Card className="gap-0 py-0 shadow-xs">
                <CardHeader className="border-b px-5 py-4 sm:px-6">
                  <CardTitle className="text-base">Letter Information</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:px-6">
                  <div className="min-w-0 space-y-2 sm:col-span-2">
                    <Label htmlFor="construction-document-project">Project <span className="text-destructive">*</span></Label>
                    <Select
                      value={selectedProjectId || null}
                      onValueChange={(value) => {
                        setSelectedProjectId(value ?? "")
                        setError(null)
                      }}
                      disabled={submitting || Boolean(createdDocumentId) || loadingProjects}
                    >
                      <SelectTrigger id="construction-document-project" className="h-11 w-full min-w-0 rounded-lg px-3">
                        <SelectValue placeholder={loadingProjects ? "Loading projects..." : "Select project"}>
                          {(value) => {
                            const option = projectOptions.find((project) => project.id === value)
                            return option ? formatProjectLabel(option) : "Select project"
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start" className="max-w-[calc(100vw-2rem)]">
                        {projectOptions.map((project) => (
                          <SelectItem
                            key={project.id}
                            value={project.id}
                            className="[&>span:first-child]:min-w-0 [&>span:first-child]:shrink [&>span:first-child]:whitespace-normal"
                          >
                            <span className="min-w-0 break-words">{formatProjectLabel(project)}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {projectMismatch ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        You are currently in {currentProject?.name}, but this letter will be created for {selectedProject?.name}. Are you sure?
                      </div>
                    ) : null}
                    {projectsLoaded && projectOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No authorized Projects are available.</p>
                    ) : null}
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="construction-document-title">Letter Title <span className="text-destructive">*</span></Label>
                    <Input
                      id="construction-document-title"
                      value={title}
                      maxLength={180}
                      autoFocus
                      disabled={submitting || Boolean(createdDocumentId)}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)}
                      placeholder="Enter letter title"
                      className="h-11 w-full"
                    />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="construction-document-type">Letter Type <span className="text-destructive">*</span></Label>
                    <Select value={documentType || null} onValueChange={handleDocumentTypeChange} disabled={submitting || Boolean(createdDocumentId)}>
                      <SelectTrigger id="construction-document-type" className="h-11 w-full rounded-lg px-3">
                        <SelectValue placeholder="Select letter type">
                          {(value) => getConstructionDocumentTypeLabel(value) ?? "Select letter type"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start">
                        {CONSTRUCTION_DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedType ? <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{selectedType.shortLabel}</p> : null}
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="construction-document-description">Short Description</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{description.length}/2000</span>
                    </div>
                    <textarea
                      id="construction-document-description"
                      value={description}
                      maxLength={2000}
                      disabled={submitting || Boolean(createdDocumentId)}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
                      placeholder="Optional summary or context"
                      className="min-h-28 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="construction-document-details">Letter Details</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Selecting a letter type loads its editable English template immediately.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={submitting || Boolean(createdDocumentId) || !documentDetails}
                        onClick={() => setDocumentDetails("")}
                      >
                        <RotateCcw className="size-4" />
                        Clear Template
                      </Button>
                    </div>
                    <textarea
                      id="construction-document-details"
                      value={documentDetails}
                      maxLength={100000}
                      disabled={submitting || Boolean(createdDocumentId) || !documentType}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDocumentDetails(event.target.value)}
                      placeholder={documentType ? "Add letter-specific information" : "Select a letter type to load its template"}
                      className="min-h-72 w-full resize-y rounded-xl border border-input bg-white px-4 py-3 font-mono text-sm leading-6 outline-none transition-shadow placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-70 dark:bg-slate-950"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-5 xl:grid-cols-2">
                <AttachmentCard
                  title="Files"
                  description="Reports, specifications, drawings and other supporting files."
                  icon={<Paperclip className="size-5" />}
                  actionLabel="Upload Files"
                  actionIcon={<UploadCloud className="size-4" />}
                  disabled={submitting}
                  onAction={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => addAttachments(event, "file")} />
                  {files.length ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {files.map((attachment) => (
                        <div key={attachment.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><FileIcon className="size-5" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium" title={attachment.file.name}>{attachment.file.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{formatFileSize(attachment.file.size)}</p>
                          </div>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => removePendingAttachment(attachment.id)}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
                            title="Remove file"
                          ><Trash2 className="size-4" /></button>
                        </div>
                      ))}
                    </div>
                  ) : <EmptyAttachmentState icon={<FileIcon className="size-6" />} text="No files selected yet." />}
                </AttachmentCard>

                <AttachmentCard
                  title="Images"
                  description="Site photos and visual inspection evidence."
                  icon={<ImageIcon className="size-5" />}
                  actionLabel="Upload Images"
                  actionIcon={<ImagePlus className="size-4" />}
                  disabled={submitting}
                  onAction={() => imageInputRef.current?.click()}
                >
                  <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(event) => addAttachments(event, "image")} />
                  {images.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {images.map((attachment) => (
                        <div key={attachment.id} className="group relative overflow-hidden rounded-xl border bg-muted/30">
                          <div className="aspect-square overflow-hidden bg-slate-100 dark:bg-slate-900">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={attachment.previewUrl ?? ""} alt={attachment.file.name} className="size-full object-cover" />
                          </div>
                          <div className="p-2.5">
                            <p className="truncate text-xs font-medium" title={attachment.file.name}>{attachment.file.name}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{formatFileSize(attachment.file.size)}</p>
                          </div>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => removePendingAttachment(attachment.id)}
                            className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-lg bg-black/65 text-white opacity-0 backdrop-blur transition-opacity hover:bg-red-600 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                            title="Remove image"
                          ><X className="size-4" /></button>
                        </div>
                      ))}
                    </div>
                  ) : <EmptyAttachmentState icon={<ImageIcon className="size-6" />} text="No images selected yet." />}
                </AttachmentCard>
              </div>

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

              {error ? (
                <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 rounded-none border-t bg-white px-6 py-4 dark:bg-slate-950">
            <Button variant="outline" size="lg" disabled={submitting} onClick={closeDialog}>Cancel</Button>
            <Button size="lg" disabled={submitting} onClick={() => void saveDocument()}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Letter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
    <Card className="gap-0 py-0 shadow-xs">
      <CardHeader className="flex-row items-center justify-between gap-4 border-b px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">{icon}</span>
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button type="button" variant="outline" disabled={disabled} onClick={onAction}>{actionIcon}{actionLabel}</Button>
      </CardHeader>
      <CardContent className="px-5 py-5">{children}</CardContent>
    </Card>
  )
}

function EmptyAttachmentState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-5 text-center text-muted-foreground">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  )
}
