"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CompactFieldToolbar } from "@/components/ui/compact-field-toolbar"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  File as FileIcon,
  FilePlus2,
  Image as ImageIcon,
  Languages,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react"
import { FieldContextPreview } from "@/components/documents/field-context-preview"
import { getLetterFieldPreviewContext } from "@/lib/documents/field-preview-helper"
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
import {
  formatBilingualDocumentDetails,
  parseBilingualDocumentDetails,
  stripHtmlToPlainText,
} from "@/lib/documents/bilingual-details"
import {
  getLetterDetailsSchema,
  type LetterDetailsSchema,
} from "@/lib/documents/letter-details-schema"
import { uploadDocumentAsset } from "@/lib/documents/storage-upload"
import {
  SIMPLE_UPLOAD_ACCEPT,
  formatFileSize,
  validateSimpleUploadFile,
} from "@/lib/documents/simple-upload"
import { createClient } from "@/lib/supabase/client"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { cn } from "@/lib/utils"

type PendingAttachment = {
  id: string
  file: File
  attachmentType: "file" | "image"
  previewUrl: string | null
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

type ProcessingStepId =
  | "analyze"
  | "translate"
  | "integrate"
  | "attachments"
  | "finalize"
  | "send"

type ProcessingStep = {
  id: ProcessingStepId
  label: string
  status: "pending" | "active" | "completed" | "failed"
}

function humanize(value: string | null | undefined) {
  if (!value) return ""
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatProjectLabel(project: { name: string; code: string | null }) {
  return project.code?.trim() ? `${project.name} — ${project.code}` : project.name
}

export type InitialDraftData = {
  id: string
  projectId: string
  documentType: ConstructionDocumentTypeValue | ""
  title: string
  englishText: string
  attachArabic: boolean
  structuredFields: Record<string, string>
  isManuallyEdited: boolean
  letterToRecipientIds: string[]
  ccRecipientIds: string[]
  attachments: Array<{
    id: string
    originalFilename: string
    mimeType: string
    sizeBytes: number
    attachmentType: "image" | "document"
  }>
}

export function CreateLetterPage({
  initialProjectId = "",
  projectOptions: serverProjectOptions = [],
  initialDocumentId = null,
  initialDraft = null,
}: {
  initialProjectId?: string
  projectOptions?: ProjectOption[]
  initialDocumentId?: string | null
  initialDraft?: InitialDraftData | null
}) {
  const router = useRouter()
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const pendingAttachmentsRef = useRef<PendingAttachment[]>([])
  const submissionRef = useRef(false)

  const [selectedProjectId, setSelectedProjectId] = useState(initialDraft?.projectId || initialProjectId)
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>(serverProjectOptions)
  const [loadingProjects, setLoadingProjects] = useState(serverProjectOptions.length === 0)
  const [title, setTitle] = useState(initialDraft?.title || "")
  const [documentType, setDocumentType] = useState<ConstructionDocumentTypeValue | "">(initialDraft?.documentType || "")
  const [englishText, setEnglishText] = useState(initialDraft?.englishText || "")
  const [attachArabic, setAttachArabic] = useState(initialDraft?.attachArabic || false)

  // Reusable Structured Letter Details state (Phase 1: NCR)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(initialDraft?.structuredFields || {})
  const [isManuallyEdited, setIsManuallyEdited] = useState(initialDraft?.isManuallyEdited || false)
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true)

  // Contextual Preview state for structured Letter Details fields
  const [previewState, setPreviewState] = useState<{
    fieldKey: string
    isPinned: boolean
  } | null>(null)

  const pointerDownTimeRef = useRef<number>(0)
  const isHydratedRef = useRef<boolean>(Boolean(initialDraft))
  const [loadingDraft, setLoadingDraft] = useState<boolean>(Boolean(initialDocumentId && !initialDraft))

  const handleEyePointerDown = (fieldKey: string) => {
    pointerDownTimeRef.current = Date.now()
    setPreviewState({ fieldKey, isPinned: false })
  }

  const handleEyePointerUp = (fieldKey: string) => {
    const elapsed = Date.now() - pointerDownTimeRef.current
    if (elapsed < 350) {
      // Tap / Click -> Pin Preview
      setPreviewState((curr) =>
        curr?.fieldKey === fieldKey && curr.isPinned ? null : { fieldKey, isPinned: true }
      )
    } else {
      // Press & Hold -> Release to close!
      setPreviewState(null)
    }
  }

  const handleEyePointerLeaveOrCancel = (fieldKey: string) => {
    setPreviewState((curr) => (curr?.fieldKey === fieldKey && !curr.isPinned ? null : curr))
  }

  const activeSchema = getLetterDetailsSchema(documentType)

  const [recipientOptions, setRecipientOptions] = useState<RecipientOption[]>([])
  const [letterToRecipientIds, setLetterToRecipientIds] = useState<string[]>(initialDraft?.letterToRecipientIds || [])
  const [ccRecipientIds, setCcRecipientIds] = useState<string[]>(initialDraft?.ccRecipientIds || [])
  const [loadingRecipients, setLoadingRecipients] = useState(false)

  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>(
    (initialDraft?.attachments || []).map((att) => ({
      id: att.id,
      file: new File([], att.originalFilename, { type: att.mimeType }),
      attachmentType: att.attachmentType,
    }))
  )
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(initialDraft?.id || initialDocumentId)
  const [savedDocumentMode, setSavedDocumentMode] = useState<SaveMode | null>(initialDraft || initialDocumentId ? "draft" : null)
  const [savingMode, setSavingMode] = useState<SaveMode | null>(null)

  // Confirmation & Processing modals
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  const [processingOpen, setProcessingOpen] = useState(false)
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([])
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [processingComplete, setProcessingComplete] = useState(false)

  const isSubmitting = savingMode !== null || processingOpen || loadingDraft

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments
  }, [pendingAttachments])

  useEffect(() => () => {
    for (const attachment of pendingAttachmentsRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
  }, [])

  // Draft Hydration effect when editing an existing Draft
  useEffect(() => {
    if (!initialDocumentId || isHydratedRef.current) return

    let cancelled = false
    const loadDraft = async () => {
      setLoadingDraft(true)
      const supabase = createClient()

      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .select("id, project_id, title, document_type, status, document_details, content")
        .eq("id", initialDocumentId)
        .maybeSingle()

      if (cancelled) return

      if (docErr || !doc) {
        setError("Unable to load the requested Draft letter.")
        setLoadingDraft(false)
        return
      }

      const rawType = getConstructionDocumentType(doc.document_type)?.value || ""
      const docType = rawType as ConstructionDocumentTypeValue | ""
      const parsed = parseBilingualDocumentDetails(doc.document_details || doc.content)
      const schema = getLetterDetailsSchema(docType)

      setSelectedProjectId(doc.project_id)
      setDocumentType(docType)
      setTitle(doc.title || "")
      setEnglishText(parsed.englishText || "")
      setAttachArabic(parsed.attachArabic)

      if (parsed.structuredFields) {
        setFieldValues(parsed.structuredFields)
      } else if (schema && schema.parseValuesFromText) {
        setFieldValues(schema.parseValuesFromText(parsed.englishText || ""))
      }

      if (schema) {
        const expectedText = schema.buildText(parsed.structuredFields || {})
        if (parsed.englishText.trim() !== expectedText.trim()) {
          setIsManuallyEdited(true)
        }
      }

      // Fetch recipients
      const { data: recipientsData } = await supabase
        .from("document_recipients")
        .select("participant_id, recipient_type")
        .eq("document_id", initialDocumentId)

      if (!cancelled && recipientsData) {
        const toIds = recipientsData.filter((r) => r.recipient_type === "to").map((r) => r.participant_id)
        const ccIds = recipientsData.filter((r) => r.recipient_type === "cc").map((r) => r.participant_id)
        setLetterToRecipientIds(toIds)
        setCcRecipientIds(ccIds)
      }

      // Fetch attachments
      const { data: attachmentsData } = await supabase
        .from("document_attachments")
        .select("id, attachment_type, original_filename, storage_path, mime_type, size_bytes")
        .eq("document_id", initialDocumentId)

      if (!cancelled && attachmentsData) {
        const loadedAttachments: PendingAttachment[] = attachmentsData.map((att) => ({
          id: att.id,
          file: new File([], att.original_filename || "Attachment", { type: att.mime_type }),
          attachmentType: att.attachment_type === "image" ? "image" : "document",
        }))
        setPendingAttachments(loadedAttachments)
      }

      isHydratedRef.current = true
      setLoadingDraft(false)
    }

    void loadDraft()
    return () => {
      cancelled = true
    }
  }, [initialDocumentId])

  // Load project options if not provided
  useEffect(() => {
    if (serverProjectOptions.length > 0) return
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

      if (projectsError) {
        setError("Unable to load Projects available to you.")
        return
      }

      const options = (data ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code ?? null,
      }))
      setProjectOptions(options)
      if (!selectedProjectId && options.length > 0) {
        setSelectedProjectId(options[0].id)
      }
    }

    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [serverProjectOptions, selectedProjectId])

  // Load recipients whenever selectedProjectId changes
  useEffect(() => {
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
  }, [selectedProjectId])

  const handleDocumentTypeChange = (value: string | null) => {
    if (!isConstructionDocumentType(value)) {
      setDocumentType("")
      setEnglishText("")
      setFieldValues({})
      setIsManuallyEdited(false)
      return
    }

    setDocumentType(value)
    const schema = getLetterDetailsSchema(value)
    const templateText = getDocumentDetailsTemplate(value)
    const parsed = parseBilingualDocumentDetails(templateText)

    if (schema) {
      const initialFields = parsed.structuredFields || (schema.parseValuesFromText ? schema.parseValuesFromText(parsed.englishText) : {})
      setFieldValues(initialFields)
      setIsManuallyEdited(false)
      setEnglishText(schema.buildText(initialFields))
    } else {
      setFieldValues({})
      setIsManuallyEdited(false)
      setEnglishText(parsed.englishText)
    }

    if (parsed.attachArabic) setAttachArabic(true)
    setError(null)
  }

  const handleFieldValueChange = (key: string, val: string) => {
    const updated = { ...fieldValues, [key]: val }
    setFieldValues(updated)
    if (activeSchema && !isManuallyEdited) {
      setEnglishText(activeSchema.buildText(updated))
    }
  }

  const handleEnglishTextChange = (val: string) => {
    setEnglishText(val)
    if (activeSchema) {
      setIsManuallyEdited(true)
    }
  }

  const handleRebuildFromDetails = () => {
    if (!activeSchema) return
    setEnglishText(activeSchema.buildText(fieldValues))
    setIsManuallyEdited(false)
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

  const validateForm = () => {
    if (!selectedProjectId) return "Project is required."
    if (!isConstructionDocumentType(documentType)) return "Letter Type is required."
    if (!title.trim()) return "Subject is required."
    if (letterToRecipientIds.length === 0) return "Letter To is required."
    return null
  }

  const handleSaveDraft = async () => {
    const validationErr = validateForm()
    if (validationErr) {
      setError(validationErr)
      return
    }

    setError(null)
    setSavingMode("draft")
    submissionRef.current = true

    try {
      const finalDetails = formatBilingualDocumentDetails(
        englishText,
        null,
        attachArabic,
        activeSchema ? fieldValues : null,
      )
      let docId = savedDocumentId

      if (!docId) {
        const result = await createConstructionDocumentAction({
          projectId: selectedProjectId,
          title,
          documentType,
          documentDetails: finalDetails,
          status: "draft",
          letterToParticipantIds: letterToRecipientIds,
          ccParticipantIds: ccRecipientIds,
          requireRecipients: true,
        })
        if (!result.ok) throw new Error(result.error)
        docId = result.documentId
        setSavedDocumentId(docId)
        setSavedDocumentMode("draft")
      } else {
        const supabase = createClient()
        const { error: updateErr } = await supabase
          .from("documents")
          .update({
            title,
            document_type: documentType,
            document_details: finalDetails,
            status: "draft",
          })
          .eq("id", docId)

        if (updateErr) throw new Error(updateErr.message)
      }

      // Upload pending attachments
      if (pendingAttachments.length && docId) {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error("Your session has expired. Sign in again.")

        const attachmentsToUpload = [...pendingAttachments]
        for (const pending of attachmentsToUpload) {
          const folder = pending.attachmentType === "image" ? "images" : "files"
          const safeName = pending.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment"
          const storagePath = `${selectedProjectId}/${session.user.id}/documents/${docId}/${folder}/${crypto.randomUUID()}-${safeName}`

          await uploadDocumentAsset(pending.file, storagePath, session.access_token)
          const record: DocumentAttachmentInput = {
            attachmentType: pending.attachmentType,
            storagePath,
            originalFilename: pending.file.name,
            mimeType: pending.file.type || "application/octet-stream",
            sizeBytes: pending.file.size,
          }
          const attachmentResult = await addDocumentAttachmentsAction({
            documentId: docId,
            projectId: selectedProjectId,
            attachments: [record],
          })
          if (!attachmentResult.ok) throw new Error(attachmentResult.error)

          if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl)
          setPendingAttachments((current) => current.filter((item) => item.id !== pending.id))
        }
      }

      setSuccess("Draft saved successfully.")
      setTimeout(() => setSuccess(null), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save draft.")
    } finally {
      submissionRef.current = false
      setSavingMode(null)
    }
  }

  const handleOpenSendConfirmation = () => {
    const validationErr = validateForm()
    if (validationErr) {
      setError(validationErr)
      return
    }
    setError(null)
    setConfirmSendOpen(true)
  }

  const handleStartSendWorkflow = async () => {
    setConfirmSendOpen(false)
    if (submissionRef.current) return
    submissionRef.current = true

    const hasAttachments = pendingAttachments.length > 0

    const initialSteps: ProcessingStep[] = [
      { id: "analyze", label: attachArabic ? "Analyzing English text" : "Analyzing Letter", status: "active" },
    ]

    if (attachArabic) {
      initialSteps.push(
        { id: "translate", label: "Translating to Arabic", status: "pending" },
        { id: "integrate", label: "Adding Arabic translation", status: "pending" },
      )
    }

    if (hasAttachments) {
      initialSteps.push({ id: "attachments", label: "Processing attachments", status: "pending" })
    }

    initialSteps.push(
      { id: "finalize", label: "Finalizing letter", status: "pending" },
      { id: "send", label: "Sending letter", status: "pending" },
    )

    setProcessingSteps(initialSteps)
    setProcessingError(null)
    setProcessingComplete(false)
    setProcessingOpen(true)

    const updateStepStatus = (stepId: ProcessingStepId, status: ProcessingStep["status"]) => {
      setProcessingSteps((current) =>
        current.map((step) => (step.id === stepId ? { ...step, status } : step)),
      )
    }

    try {
      // Step 1: Analyze English text
      updateStepStatus("analyze", "active")
      await new Promise((r) => setTimeout(r, 400))
      updateStepStatus("analyze", "completed")

      // Step 2: Translate to Arabic if attachArabic option is selected
      let generatedArabicText: string | null = null
      if (attachArabic) {
        updateStepStatus("translate", "active")
        const res = await fetch("/api/ai/enhance-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: englishText,
            html: englishText,
            action: "translate_ar",
            projectId: selectedProjectId || undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.resultText) {
          throw new Error(data.error || "Unable to translate letter to Arabic.")
        }
        generatedArabicText = stripHtmlToPlainText(data.resultText)
        updateStepStatus("translate", "completed")

        // Step 3: Integrate Arabic translation
        updateStepStatus("integrate", "active")
        await new Promise((r) => setTimeout(r, 300))
        updateStepStatus("integrate", "completed")
      }

      // Format combined details with structuredFields
      const finalDetails = formatBilingualDocumentDetails(
        englishText,
        generatedArabicText,
        attachArabic,
        activeSchema ? fieldValues : null,
      )

      // Step 4: Process attachments if any
      let docId = savedDocumentId
      if (hasAttachments) {
        updateStepStatus("attachments", "active")
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error("Your session has expired. Sign in again.")

        // First ensure letter is created to get docId
        if (!docId) {
          const createRes = await createConstructionDocumentAction({
            projectId: selectedProjectId,
            title,
            documentType,
            documentDetails: finalDetails,
            status: "draft",
            letterToParticipantIds: letterToRecipientIds,
            ccParticipantIds: ccRecipientIds,
            requireRecipients: true,
          })
          if (!createRes.ok) throw new Error(createRes.error)
          docId = createRes.documentId
          setSavedDocumentId(docId)
        }

        const attachmentsToUpload = [...pendingAttachments]
        for (const pending of attachmentsToUpload) {
          const folder = pending.attachmentType === "image" ? "images" : "files"
          const safeName = pending.file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment"
          const storagePath = `${selectedProjectId}/${session.user.id}/documents/${docId}/${folder}/${crypto.randomUUID()}-${safeName}`

          await uploadDocumentAsset(pending.file, storagePath, session.access_token)
          const record: DocumentAttachmentInput = {
            attachmentType: pending.attachmentType,
            storagePath,
            originalFilename: pending.file.name,
            mimeType: pending.file.type || "application/octet-stream",
            sizeBytes: pending.file.size,
          }
          const attachmentResult = await addDocumentAttachmentsAction({
            documentId: docId!,
            projectId: selectedProjectId,
            attachments: [record],
          })
          if (!attachmentResult.ok) throw new Error(attachmentResult.error)

          if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl)
          setPendingAttachments((current) => current.filter((item) => item.id !== pending.id))
        }
        updateStepStatus("attachments", "completed")
      }

      // Step 5: Finalize letter
      updateStepStatus("finalize", "active")
      if (!docId) {
        const createRes = await createConstructionDocumentAction({
          projectId: selectedProjectId,
          title,
          documentType,
          documentDetails: finalDetails,
          status: "published",
          letterToParticipantIds: letterToRecipientIds,
          ccParticipantIds: ccRecipientIds,
          requireRecipients: true,
        })
        if (!createRes.ok) throw new Error(createRes.error)
        docId = createRes.documentId
        setSavedDocumentId(docId)
      } else {
        // Publish existing draft
        const supabase = createClient()
        const { error: updateErr } = await supabase
          .from("documents")
          .update({
            title,
            document_type: documentType,
            document_details: finalDetails,
            status: "published",
            published_at: new Date().toISOString(),
          })
          .eq("id", docId)

        if (updateErr) throw new Error(updateErr.message)
      }
      updateStepStatus("finalize", "completed")

      // Step 6: Send letter / Notify
      updateStepStatus("send", "active")
      await new Promise((r) => setTimeout(r, 400))
      updateStepStatus("send", "completed")

      setProcessingComplete(true)
      submissionRef.current = false

      setTimeout(() => {
        router.push(`/documents/${docId}`)
        router.refresh()
      }, 1000)
    } catch (err) {
      submissionRef.current = false
      const errorMsg = err instanceof Error ? err.message : "Letter sending failed."
      setProcessingError(errorMsg)
      setProcessingSteps((current) =>
        current.map((step) => (step.status === "active" ? { ...step, status: "failed" } : step)),
      )
    }
  }

  const backHref = selectedProjectId
    ? `/documents?project=${encodeURIComponent(selectedProjectId)}`
    : "/documents"

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4 py-3 sm:gap-6 sm:py-4">
      {/* Top Bar with Back Link */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Letters
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
          <FilePlus2 className="size-3.5" />
          New Letter
        </span>
      </div>

      {/* Main Card Form */}
      <Card className="w-full min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b bg-muted/20 px-3.5 py-4 sm:px-6 sm:py-5">
          <CardTitle className="text-lg font-bold tracking-tight sm:text-xl">Create Letter</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Fill in the letter details, target project, recipients, and content below.
          </p>
        </CardHeader>

        <CardContent className="space-y-4 px-3.5 py-4 sm:space-y-6 sm:px-6 sm:py-6">
          {/* Project Selection */}
          <div className="space-y-2 min-w-0">
            <Label htmlFor="create-letter-project" className="text-xs font-semibold text-foreground">
              Project <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedProjectId || null}
              onValueChange={(value) => {
                setSelectedProjectId(value ?? "")
                setError(null)
              }}
              disabled={isSubmitting || Boolean(savedDocumentId) || loadingProjects}
            >
              <SelectTrigger id="create-letter-project" className="h-11 w-full min-w-0 rounded-lg px-3 text-sm">
                <SelectValue placeholder={loadingProjects ? "Loading projects..." : "Select project"}>
                  {(value) => {
                    const option = projectOptions.find((p) => p.id === value)
                    return option ? formatProjectLabel(option) : "Select project"
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start" className="max-w-[calc(100vw-2rem)]">
                {projectOptions.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {formatProjectLabel(project)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Letter Type & Subject */}
          <div className="grid gap-4 sm:grid-cols-2 min-w-0">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="create-letter-type" className="text-xs font-semibold text-foreground">
                Letter Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={documentType || null}
                onValueChange={handleDocumentTypeChange}
                disabled={isSubmitting || Boolean(savedDocumentId)}
              >
                <SelectTrigger id="create-letter-type" className="h-11 w-full min-w-0 rounded-lg px-3 text-sm">
                  <SelectValue placeholder="Select letter type">
                    {(value) => getConstructionDocumentTypeLabel(value) ?? "Select letter type"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  {CONSTRUCTION_DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label htmlFor="create-letter-subject" className="text-xs font-semibold text-foreground">
                Subject <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-letter-subject"
                value={title}
                maxLength={180}
                disabled={isSubmitting || Boolean(savedDocumentId)}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter subject"
                className="h-11 text-sm min-w-0"
              />
            </div>
          </div>

          {/* Letter To & CC Recipients */}
          <div className="grid gap-4 sm:grid-cols-2 min-w-0">
            <RecipientPicker
              id="create-letter-to"
              label="Letter To"
              required
              placeholder="Select recipient(s)"
              options={recipientOptions}
              selectedIds={letterToRecipientIds}
              excludedIds={ccRecipientIds}
              loading={loadingRecipients}
              disabled={isSubmitting || Boolean(savedDocumentId) || !selectedProjectId}
              onAdd={(id) => {
                setLetterToRecipientIds((curr) => (curr.includes(id) ? curr : [...curr, id]))
                setCcRecipientIds((curr) => curr.filter((i) => i !== id))
                setError(null)
              }}
              onRemove={(id) => setLetterToRecipientIds((curr) => curr.filter((i) => i !== id))}
            />

            <RecipientPicker
              id="create-letter-cc"
              label="CC"
              placeholder="Select CC"
              options={recipientOptions}
              selectedIds={ccRecipientIds}
              excludedIds={letterToRecipientIds}
              loading={loadingRecipients}
              disabled={isSubmitting || Boolean(savedDocumentId) || !selectedProjectId}
              onAdd={(id) => {
                setCcRecipientIds((curr) => (curr.includes(id) ? curr : [...curr, id]))
                setLetterToRecipientIds((curr) => curr.filter((i) => i !== id))
                setError(null)
              }}
              onRemove={(id) => setCcRecipientIds((curr) => curr.filter((i) => i !== id))}
            />
          </div>

          {/* Letter Details Section (NCR, RFI, WIR, MIR, Inspection, IPC, VO, General) */}
          {activeSchema ? (
            <div className="space-y-3 rounded-xl border border-blue-200/80 bg-blue-50/30 p-2.5 sm:p-4 dark:border-blue-900/50 dark:bg-blue-950/20 w-full min-w-0 overflow-hidden">
              <div
                className={cn(
                  "flex items-center justify-between gap-2 w-full min-w-0",
                  isDetailsExpanded && "border-b border-blue-200/60 pb-3 dark:border-blue-900/40",
                )}
              >
                <h3 className="text-sm font-bold text-foreground min-w-0 truncate">{activeSchema.title}</h3>
                <button
                  type="button"
                  onClick={() => setIsDetailsExpanded((prev) => !prev)}
                  title={isDetailsExpanded ? "Collapse Letter Details" : "Expand Letter Details"}
                  aria-label={isDetailsExpanded ? "Collapse Letter Details" : "Expand Letter Details"}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-blue-200/80 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:border-blue-900/60"
                >
                  {isDetailsExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
              </div>

              {isDetailsExpanded ? (
                <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 w-full min-w-0">
                  {activeSchema.fields.map((field) => {
                    const isFullWidth = field.type === "textarea"
                    return (
                      <div key={field.key} className={cn("space-y-1.5 w-full min-w-0", isFullWidth && "sm:col-span-2")}>
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor={`letter-field-${field.key}`} className="text-xs font-semibold text-foreground">
                            {field.label}
                          </Label>
                          <button
                            type="button"
                            onPointerDown={() => handleEyePointerDown(field.key)}
                            onPointerUp={() => handleEyePointerUp(field.key)}
                            onPointerLeave={() => handleEyePointerLeaveOrCancel(field.key)}
                            onPointerCancel={() => handleEyePointerLeaveOrCancel(field.key)}
                            title="Preview in Letter"
                            aria-label={`Preview ${field.label} in Letter`}
                            className={cn(
                              "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-950 dark:hover:text-amber-300",
                              previewState?.fieldKey === field.key && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold",
                            )}
                          >
                            <Eye className="size-3.5" />
                          </button>
                        </div>

                        {field.type === "textarea" ? (
                          <div className="flex flex-col w-full min-w-0">
                            <CompactFieldToolbar
                              value={fieldValues[field.key] ?? ""}
                              onChange={(val) => handleFieldValueChange(field.key, val)}
                              disabled={isSubmitting}
                              fieldName={field.label}
                            />
                            <textarea
                              id={`letter-field-${field.key}`}
                              value={fieldValues[field.key] ?? ""}
                              disabled={isSubmitting}
                              onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                              className="min-h-20 w-full min-w-0 resize-y rounded-b-lg border border-input bg-background px-3 py-2 text-xs leading-5 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:bg-muted/30"
                            />
                          </div>
                        ) : field.type === "text" ? (
                          <div className="flex flex-col w-full min-w-0">
                            <CompactFieldToolbar
                              value={fieldValues[field.key] ?? ""}
                              onChange={(val) => handleFieldValueChange(field.key, val)}
                              disabled={isSubmitting}
                              fieldName={field.label}
                            />
                            <Input
                              id={`letter-field-${field.key}`}
                              type="text"
                              value={fieldValues[field.key] ?? ""}
                              disabled={isSubmitting}
                              onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                              className="h-10 w-full min-w-0 rounded-b-lg rounded-t-none text-xs"
                            />
                          </div>
                        ) : field.type === "select" ? (
                          <Select
                            value={fieldValues[field.key] || null}
                            onValueChange={(val) => handleFieldValueChange(field.key, val ?? "")}
                            disabled={isSubmitting}
                          >
                            <SelectTrigger id={`letter-field-${field.key}`} className="h-10 w-full min-w-0 rounded-lg px-3 text-xs">
                              <SelectValue placeholder="Select status">
                                {(val) => field.options?.find((o) => o.value === val)?.label ?? "Select status"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent align="start">
                              {field.options?.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : field.type === "date" ? (
                          <div className="flex items-center gap-1.5 sm:gap-2 w-full min-w-0">
                            <Input
                              id={`letter-field-${field.key}`}
                              type="date"
                              value={fieldValues[field.key] ?? ""}
                              disabled={isSubmitting}
                              onChange={(e) => handleFieldValueChange(field.key, e.target.value)}
                              className="h-10 text-xs flex-1 min-w-0"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isSubmitting}
                              onClick={() => {
                                const today = new Date()
                                const yyyy = today.getFullYear()
                                const mm = String(today.getMonth() + 1).padStart(2, "0")
                                const dd = String(today.getDate()).padStart(2, "0")
                                handleFieldValueChange(field.key, `${yyyy}-${mm}-${dd}`)
                              }}
                              className="h-10 px-2.5 sm:px-3 text-xs font-semibold shrink-0"
                              title="Set to today's date"
                            >
                              Today
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* English Text & Attach Arabic Translation Option */}
          <div className="space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="create-letter-text" className="text-xs font-semibold text-foreground">
                  Text <span className="text-muted-foreground font-normal">(Primary English Content)</span>
                </Label>
                {isManuallyEdited ? (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    Manually edited
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {isManuallyEdited && activeSchema ? (
                  <button
                    type="button"
                    onClick={handleRebuildFromDetails}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:border-slate-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
                  >
                    <RotateCcw className="size-3" />
                    <span>Rebuild from Letter Details</span>
                  </button>
                ) : null}

                <label
                  htmlFor="attach-arabic-translation"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  <input
                    type="checkbox"
                    id="attach-arabic-translation"
                    checked={attachArabic}
                    disabled={isSubmitting}
                    onChange={(e) => setAttachArabic(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                  />
                  <Languages className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Attach Arabic Translation</span>
                </label>
              </div>
            </div>

            {/* Primary English Text Area */}
            <textarea
              id="create-letter-text"
              value={englishText}
              maxLength={100000}
              disabled={isSubmitting || !documentType}
              onChange={(e) => handleEnglishTextChange(e.target.value)}
              placeholder={documentType ? "Enter English letter text..." : "Select a letter type to load its template"}
              className="min-h-48 w-full min-w-0 resize-y rounded-xl border border-input bg-background px-4 py-3 font-mono text-sm leading-6 outline-none transition-shadow placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-70"
            />
          </div>

          {/* Add Attachments Section */}
          <div className="space-y-3 pt-2 min-w-0">
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
              disabled={isSubmitting}
              onClick={() => attachmentInputRef.current?.click()}
              className="gap-2"
            >
              <Paperclip className="size-4" />
              Add Attachments
            </Button>

            {pendingAttachments.length ? (
              <div className="grid gap-2 sm:grid-cols-2 min-w-0">
                {pendingAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/20 px-3 py-2.5"
                  >
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
                      <p className="truncate text-xs font-semibold" title={attachment.file.name}>
                        {attachment.file.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{formatFileSize(attachment.file.size)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => removePendingAttachment(attachment.id)}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                      title="Remove attachment"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Feedback Banners */}
          {success ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{success}</span>
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Sticky Bottom Action Footer (Cancel | Save Draft | Send) */}
      <div className="sticky bottom-0 z-10 flex w-full min-w-0 items-center justify-between gap-1.5 sm:gap-3 rounded-2xl border bg-background/95 p-2 sm:p-4 shadow-lg backdrop-blur">
        <Link
          href={backHref}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 flex-1 min-w-0 px-2 sm:px-4 text-xs sm:text-sm font-semibold truncate justify-center text-center")}
        >
          Cancel
        </Link>

        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => void handleSaveDraft()}
          className="h-10 flex-1 min-w-0 px-2 sm:px-4 text-xs sm:text-sm font-semibold truncate justify-center text-center"
        >
          {savingMode === "draft" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          <span>Save Draft</span>
        </Button>

        <Button
          type="button"
          disabled={isSubmitting}
          onClick={handleOpenSendConfirmation}
          className="h-10 flex-[1.1] min-w-0 gap-1.5 bg-blue-600 px-2.5 sm:px-5 text-xs sm:text-sm font-bold text-white hover:bg-blue-700 shadow-sm truncate justify-center text-center"
        >
          <Send className="size-3.5 shrink-0" />
          <span>Send</span>
        </Button>
      </div>

      {/* Send Confirmation Dialog */}
      <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Send this letter now?</DialogTitle>
            <DialogDescription className="space-y-1 pt-2 text-sm text-muted-foreground">
              <p>After sending, you can’t edit it.</p>
              <p>To keep editing later, choose Save Draft.</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirmSendOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-blue-600 font-bold text-white hover:bg-blue-700"
              onClick={() => void handleStartSendWorkflow()}
            >
              Confirm & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Processing Progress Status Modal */}
      <Dialog open={processingOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              {processingComplete ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  Letter Sent Successfully
                </>
              ) : processingError ? (
                <>
                  <AlertCircle className="size-5 text-rose-600" />
                  Sending Failed
                </>
              ) : (
                <>
                  <Loader2 className="size-5 animate-spin text-blue-600" />
                  Preparing Letter
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {processingSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-3 text-sm font-medium">
                {step.status === "completed" ? (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                    <Check className="size-3.5 stroke-[3]" />
                  </span>
                ) : step.status === "active" ? (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                    <Loader2 className="size-3.5 animate-spin" />
                  </span>
                ) : step.status === "failed" ? (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                    <X className="size-3.5 stroke-[3]" />
                  </span>
                ) : (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <span className="size-2 rounded-full bg-muted-foreground/40" />
                  </span>
                )}

                <span
                  className={cn(
                    step.status === "completed" && "text-foreground font-semibold",
                    step.status === "active" && "text-blue-600 dark:text-blue-400 font-semibold",
                    step.status === "failed" && "text-rose-600 dark:text-rose-400 font-semibold",
                    step.status === "pending" && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
            ))}

            {processingError ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                {processingError}
              </div>
            ) : null}
          </div>

          {processingError ? (
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setProcessingOpen(false)}
              >
                Close & Keep Editing
              </Button>
              <Button
                type="button"
                className="bg-blue-600 font-bold text-white hover:bg-blue-700"
                onClick={() => void handleStartSendWorkflow()}
              >
                Retry
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Contextual Letter Field Preview Modal */}
      {previewState && activeSchema ? (() => {
        const activePreviewField = activeSchema.fields.find((f) => f.key === previewState.fieldKey)
        const activePreviewFieldLabel = activePreviewField?.label ?? "Field"
        const activePreviewContext = getLetterFieldPreviewContext(
          activeSchema,
          fieldValues,
          englishText,
          previewState.fieldKey,
          isManuallyEdited
        )
        if (!activePreviewContext) return null
        return (
          <FieldContextPreview
            fieldLabel={activePreviewFieldLabel}
            context={activePreviewContext}
            isPinned={previewState.isPinned}
            onClose={() => setPreviewState(null)}
          />
        )
      })() : null}
    </div>
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
      <Label htmlFor={id} className="text-xs font-semibold text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {selectedOptions.length ? (
        <div className="flex flex-wrap gap-1.5 pb-1">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/35 px-2.5 py-1 text-xs font-medium"
            >
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
        <SelectTrigger id={id} className="h-11 w-full min-w-0 rounded-lg px-3 text-sm">
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
