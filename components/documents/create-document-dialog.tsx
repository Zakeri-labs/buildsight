"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import {
  addDocumentAttachmentsAction,
  createConstructionDocumentAction,
  type DocumentAttachmentInput,
} from "@/lib/actions/documents"
import {
  CONSTRUCTION_DOCUMENT_TYPES,
  getConstructionDocumentTypeLabel,
  getDocumentDetailsTemplate,
  isConstructionDocumentType,
  type ConstructionDocumentTypeValue,
} from "@/lib/documents/construction-document-types"
import { uploadDocumentAsset } from "@/lib/documents/storage-upload"
import {
  SIMPLE_UPLOAD_ACCEPT,
  formatFileSize,
  validateSimpleUploadFile,
} from "@/lib/documents/simple-upload"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
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

type ProjectOption = {
  id: string
  name: string
  code: string | null
}

type RecipientOption = {
  id: string
  label: string
  secondary: string | null
}

type SaveMode = "draft" | "published"

function humanize(value: string | null | undefined) {
  if (!value) return ""
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
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
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([])
  const submissionRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [documentType, setDocumentType] = useState<ConstructionDocumentTypeValue | "">("")
  const [documentDetails, setDocumentDetails] = useState("")
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submittingMode, setSubmittingMode] = useState<SaveMode | null>(null)
  const [uploading, setUploading] = useState<UploadProgress | null>(null)
  const [createdDocumentId, setCreatedDocumentId] = useState<string | null>(null)
  const [createdDocumentMode, setCreatedDocumentMode] = useState<SaveMode | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "")
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [recipientOptions, setRecipientOptions] = useState<RecipientOption[]>([])
  const [letterToRecipientIds, setLetterToRecipientIds] = useState<string[]>([])
  const [ccRecipientIds, setCcRecipientIds] = useState<string[]>([])
  const [loadingRecipients, setLoadingRecipients] = useState(false)

  const submitting = submittingMode !== null

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

  useEffect(() => {
    if (!open) return

    setLetterToRecipientIds([])
    setCcRecipientIds([])
    setRecipientOptions([])

    if (!selectedProjectId) {
      setLoadingRecipients(false)
      return
    }

    let cancelled = false
    const loadRecipients = async () => {
      setLoadingRecipients(true)
      const supabase = createClient()
      const { data, error: recipientsError } = await supabase
        .from("project_participants")
        .select("id, organization_name, participant_type, project_role, key_contact_name, status, sort_order")
        .eq("project_id", selectedProjectId)
        .eq("status", "active")
        .order("sort_order", { ascending: true })
        .order("organization_name", { ascending: true })

      if (cancelled) return
      setLoadingRecipients(false)

      if (recipientsError) {
        setError("Unable to load recipient options for the selected Project.")
        return
      }

      setRecipientOptions((data ?? []).map((participant) => {
        const organizationName = participant.organization_name?.trim() || participant.key_contact_name?.trim() || "Project participant"
        const contactName = participant.key_contact_name?.trim()
        const role = humanize(participant.project_role || participant.participant_type)
        const details = [contactName && contactName !== organizationName ? contactName : null, role || null].filter(Boolean)
        return {
          id: participant.id,
          label: organizationName,
          secondary: details.length ? details.join(" · ") : null,
        }
      }))
    }

    void loadRecipients()
    return () => {
      cancelled = true
    }
  }, [open, selectedProjectId])

  const currentProject = projectId ? projectOptions.find((project) => project.id === projectId) ?? null : null
  const selectedProject = selectedProjectId ? projectOptions.find((project) => project.id === selectedProjectId) ?? null : null
  const projectMismatch = Boolean(projectId && selectedProjectId && projectId !== selectedProjectId && currentProject && selectedProject)

  const formatProjectLabel = (project: { name: string; code: string | null }) =>
    project.code?.trim() ? `${project.name} — ${project.code}` : project.name

  const reset = () => {
    for (const attachment of pendingAttachmentsRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
    submissionRef.current = false
    setTitle("")
    setDocumentType("")
    setDocumentDetails("")
    setPendingAttachments([])
    setError(null)
    setSubmittingMode(null)
    setUploading(null)
    setCreatedDocumentId(null)
    setCreatedDocumentMode(null)
    setSelectedProjectId(projectId ?? "")
    setRecipientOptions([])
    setLetterToRecipientIds([])
    setCcRecipientIds([])
    setLoadingRecipients(false)
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
    setError(null)
  }

  const addAttachments = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (!selected.length) return

    const validationError = selected.map((file) => validateSimpleUploadFile(file)).find(Boolean)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setPendingAttachments((current) => [
      ...current,
      ...selected.map((file) => {
        const attachmentType: PendingAttachment["attachmentType"] = file.type.startsWith("image/") ? "image" : "file"
        return {
          id: crypto.randomUUID(),
          file,
          attachmentType,
          previewUrl: attachmentType === "image" ? URL.createObjectURL(file) : null,
        }
      }),
    ])
  }

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((current) => {
      const attachment = current.find((item) => item.id === id)
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  const saveDocument = async (mode: SaveMode) => {
    if (submissionRef.current) return
    setError(null)
    if (!selectedProjectId) {
      setError("Project is required.")
      return
    }
    if (!isConstructionDocumentType(documentType)) {
      setError("Letter Type is required.")
      return
    }
    if (!title.trim()) {
      setError("Subject is required.")
      return
    }
    if (letterToRecipientIds.length === 0) {
      setError("Letter To is required.")
      return
    }

    submissionRef.current = true
    setSubmittingMode(mode)
    let documentId = createdDocumentId
    let documentWasPersisted = Boolean(createdDocumentId)
    const effectiveMode = createdDocumentMode ?? mode

    try {
      if (!documentId) {
        const result = await createConstructionDocumentAction({
          projectId: selectedProjectId,
          title,
          documentType,
          documentDetails,
          status: mode,
          letterToParticipantIds: letterToRecipientIds,
          ccParticipantIds: ccRecipientIds,
          requireRecipients: true,
        })
        if (!result.ok) throw new Error(result.error)
        documentId = result.documentId
        documentWasPersisted = true
        setCreatedDocumentId(documentId)
        setCreatedDocumentMode(mode)
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
      submissionRef.current = false
      setSubmittingMode(null)
      setOpen(false)
      reset()
      router.refresh()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? documentWasPersisted
            ? `The ${effectiveMode === "published" ? "sent letter" : "draft"} was saved, but attachments could not be completed: ${createError.message}`
            : createError.message
          : "Unable to save the letter.",
      )
      setUploading(null)
      submissionRef.current = false
      setSubmittingMode(null)
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
        <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-5 py-4 pe-12 sm:px-6">
            <DialogTitle className="text-lg font-semibold">Create Letter</DialogTitle>
          </DialogHeader>

          <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
            <div className="grid gap-4 sm:grid-cols-2">
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
              </div>

              <div className="min-w-0 space-y-2">
                <Label htmlFor="construction-document-title">Subject <span className="text-destructive">*</span></Label>
                <Input
                  id="construction-document-title"
                  value={title}
                  maxLength={180}
                  disabled={submitting || Boolean(createdDocumentId)}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)}
                  placeholder="Enter subject"
                  className="h-11 w-full"
                />
              </div>

              <RecipientPicker
                id="construction-document-letter-to"
                label="Letter To"
                required
                placeholder="Select recipient(s)"
                options={recipientOptions}
                selectedIds={letterToRecipientIds}
                excludedIds={ccRecipientIds}
                loading={loadingRecipients}
                disabled={submitting || Boolean(createdDocumentId) || !selectedProjectId}
                onAdd={(id) => {
                  setLetterToRecipientIds((current) => current.includes(id) ? current : [...current, id])
                  setCcRecipientIds((current) => current.filter((item) => item !== id))
                  setError(null)
                }}
                onRemove={(id) => setLetterToRecipientIds((current) => current.filter((item) => item !== id))}
              />

              <RecipientPicker
                id="construction-document-cc"
                label="CC"
                placeholder="Select CC"
                options={recipientOptions}
                selectedIds={ccRecipientIds}
                excludedIds={letterToRecipientIds}
                loading={loadingRecipients}
                disabled={submitting || Boolean(createdDocumentId) || !selectedProjectId}
                onAdd={(id) => {
                  setCcRecipientIds((current) => current.includes(id) ? current : [...current, id])
                  setLetterToRecipientIds((current) => current.filter((item) => item !== id))
                  setError(null)
                }}
                onRemove={(id) => setCcRecipientIds((current) => current.filter((item) => item !== id))}
              />

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="construction-document-details">Text</Label>
                <textarea
                  id="construction-document-details"
                  value={documentDetails}
                  maxLength={100000}
                  disabled={submitting || Boolean(createdDocumentId) || !documentType}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDocumentDetails(event.target.value)}
                  placeholder={documentType ? "Enter letter content" : "Select a letter type to load its template"}
                  className="h-52 min-h-44 max-h-80 w-full resize-y overflow-y-auto rounded-xl border border-input bg-white px-4 py-3 font-mono text-sm leading-6 outline-none transition-shadow placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-70 dark:bg-slate-950 sm:h-56"
                />
              </div>

              <div className="space-y-3 sm:col-span-2">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  accept={SIMPLE_UPLOAD_ACCEPT}
                  className="hidden"
                  onChange={addAttachments}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  <Paperclip className="size-4" />
                  Add Attachments
                </Button>

                {pendingAttachments.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {pendingAttachments.map((attachment) => (
                      <div key={attachment.id} className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/15 px-3 py-2">
                        {attachment.previewUrl ? (
                          <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={attachment.previewUrl} alt="" className="size-full object-cover" />
                          </span>
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                            {attachment.attachmentType === "image" ? <ImageIcon className="size-5" /> : <FileIcon className="size-5" />}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={attachment.file.name}>{attachment.file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(attachment.file.size)}</p>
                        </div>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => removePendingAttachment(attachment.id)}
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"
                          title="Remove attachment"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {uploading ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 sm:col-span-2 dark:border-blue-900 dark:bg-blue-950/40">
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
                <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:col-span-2 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="m-0 flex-row justify-end gap-2 rounded-none border-t bg-white px-5 py-3 sm:px-6 dark:bg-slate-950">
            <Button variant="outline" disabled={submitting} onClick={closeDialog}>Cancel</Button>
            <Button variant="outline" disabled={submitting} onClick={() => void saveDocument("draft")}>
              {submittingMode === "draft" ? <Loader2 className="size-4 animate-spin" /> : null}
              Save Draft
            </Button>
            <Button disabled={submitting} onClick={() => void saveDocument("published")}>
              {submittingMode === "published" ? <Loader2 className="size-4 animate-spin" /> : null}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RecipientPicker({
  id,
  label,
  required = false,
  placeholder,
  options,
  selectedIds,
  excludedIds,
  loading,
  disabled,
  onAdd,
  onRemove,
}: {
  id: string
  label: string
  required?: boolean
  placeholder: string
  options: RecipientOption[]
  selectedIds: string[]
  excludedIds: string[]
  loading: boolean
  disabled: boolean
  onAdd: (id: string) => void
  onRemove: (id: string) => void
}) {
  const selectedOptions = selectedIds
    .map((selectedId) => options.find((option) => option.id === selectedId))
    .filter((option): option is RecipientOption => Boolean(option))
  const unavailable = new Set([...selectedIds, ...excludedIds])
  const availableOptions = options.filter((option) => !unavailable.has(option.id))
  const emptyPlaceholder = !options.length && !loading ? "No recipients available" : placeholder

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}{required ? <span className="text-destructive"> *</span> : null}</Label>
      {selectedOptions.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <span key={option.id} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/35 px-2.5 py-1 text-xs font-medium">
              <span className="max-w-[220px] truncate">{option.label}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(option.id)}
                className="rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50"
                aria-label={`Remove ${option.label}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Select
        value={null}
        onValueChange={(value) => {
          if (value) onAdd(value)
        }}
        disabled={disabled || loading || availableOptions.length === 0}
      >
        <SelectTrigger id={id} className="h-11 w-full min-w-0 rounded-lg px-3">
          <SelectValue placeholder={loading ? "Loading recipients..." : emptyPlaceholder} />
        </SelectTrigger>
        <SelectContent align="start" className="max-w-[calc(100vw-2rem)]">
          {availableOptions.map((option) => (
            <SelectItem key={option.id} value={option.id} className="py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{option.label}</span>
                {option.secondary ? <span className="block truncate text-xs text-muted-foreground">{option.secondary}</span> : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
