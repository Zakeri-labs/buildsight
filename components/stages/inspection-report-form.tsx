"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  Bold,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  FileText,
  ImagePlus,
  Italic,
  Link2,
  Languages,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Redo2,
  Save,
  Send,
  ShieldCheck,
  Table2,
  Trash2,
  Underline,
  Undo2,
  UploadCloud,
  X,
} from "lucide-react"
import {
  decideTermResponseAction,
  deleteResponseAttachmentAction,
  registerResponseAttachmentsAction,
  saveTermResponseAction,
  type AttachmentRegistration,
} from "@/lib/actions/project-stages"
import { saveReportCcRecipientsAction } from "@/lib/actions/report-cc"
import { StageTranslationActions } from "@/components/stages/stage-translation-actions"
import { CcRecipientsField } from "@/components/reports/cc-recipients-field"
import type { ProjectStageAttachment, ProjectStageApproval, ProjectStagePerson, ProjectStageTranslationSummary } from "@/lib/db/project-stages"
import type { ProjectCcCandidate, ReportCcRecipient, ReportCcSelection } from "@/lib/report-cc/types"
import {
  EMPTY_TERM_RESPONSE_CONTENT,
  REPORT_TYPES,
  reportTypeLabel,
  STAGE_DOCUMENT_ACCEPT,
  STAGE_DOCUMENT_MAX_FILES,
  STAGE_EVIDENCE_ACCEPT,
  STAGE_EVIDENCE_MAX_IMAGES,
  resolveStageDocumentMimeType,
  sanitizeEvidenceFileName,
  statusLabel,
  statusTone,
  subtermResponseTypeLabel,
  validateEvidenceImage,
  validateStageDocument,
  type ChecklistItem,
  type ReportSectionKey,
  type ReportTypeValue,
  type ResponseStatus,
  type SubtermResponseType,
  type TermResponseContent,
} from "@/lib/stages/execution"
import { uploadStageEvidence } from "@/lib/stages/evidence-upload"
import { createClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"

const SECTION_META: Array<{ key: ReportSectionKey; title: string; titleAr: string; description: string }> = [
  { key: "feedback", title: "Feedback", titleAr: "الملاحظات العامة", description: "Record the inspection outcome, contractor feedback, and agreed actions." },
  { key: "observation", title: "Observation", titleAr: "المعاينة", description: "Document detailed site observations, locations, materials, and workmanship." },
  { key: "findings", title: "Findings", titleAr: "النتائج", description: "Summarize compliance, non-conformance, test results, and key findings." },
  { key: "recommendations", title: "Recommendations", titleAr: "التوصيات", description: "Provide clear technical recommendations and next steps." },
  { key: "correctiveActions", title: "Corrective Actions", titleAr: "الإجراءات التصحيحية", description: "Define corrective actions, owners, and expected completion requirements." },
]

const COPY = {
  en: {
    back: "Back to Reports",
    project: "Project",
    stage: "Stage",
    report: "Report",
    required: "Required",
    optional: "Optional",
    reportNo: "Report No.",
    visitNo: "Visit No.",
    date: "Date",
    responsible: "Responsible User",
    status: "Status",
    type: "Type",
    subject: "Subject",
    title: "Report Title",
    basic: "Report Information",
    evidence: "Image Evidence",
    evidenceHint: `Upload up to ${STAGE_EVIDENCE_MAX_IMAGES} site images. JPG, PNG, WEBP, or GIF; maximum 15 MB each.`,
    uploadImages: "Upload Images",
    documents: "Document Attachments",
    documentHint: "Attach supporting PDFs, Word, or Excel files.",
    addDocuments: "Add Documents",
    checklist: "Inspection Checklist",
    addItem: "Add item",
    template: "Assigned template",
    noResponsible: "Unassigned",
    saveDraft: "Save Draft",
    saveProgress: "Save In Progress",
    submit: "Submit for Review",
    submitted: "Report submitted for review.",
    saved: "Report saved successfully.",
    review: "Approval Review",
    reviewComments: "Review comments",
    approve: "Approve",
    reject: "Reject",
    history: "Approval history",
    noHistory: "No approval decisions recorded.",
    remove: "Remove",
    selected: "selected",
    translate: "Translate",
    translateHint: "Save the report before translating it.",
  },
  ar: {
    back: "العودة إلى التقارير",
    project: "المشروع",
    stage: "المرحلة",
    report: "التقرير",
    required: "إلزامي",
    optional: "اختياري",
    reportNo: "رقم التقرير",
    visitNo: "رقم الزيارة",
    date: "التاريخ",
    responsible: "المستخدم المسؤول",
    status: "الحالة",
    type: "النوع",
    subject: "الموضوع",
    title: "عنوان التقرير",
    basic: "معلومات التقرير",
    evidence: "صور الإثبات",
    evidenceHint: `يمكن رفع حتى ${STAGE_EVIDENCE_MAX_IMAGES} صور للموقع. الحد الأقصى 15 ميغابايت للصورة.`,
    uploadImages: "رفع الصور",
    documents: "مرفقات المستندات",
    documentHint: "أرفق ملفات PDF أو Word أو Excel الداعمة.",
    addDocuments: "إضافة مستندات",
    checklist: "قائمة فحص التفتيش",
    addItem: "إضافة بند",
    template: "القالب المعيّن",
    noResponsible: "غير معيّن",
    saveDraft: "حفظ المسودة",
    saveProgress: "حفظ قيد التنفيذ",
    submit: "إرسال للمراجعة",
    submitted: "تم إرسال التقرير للمراجعة.",
    saved: "تم حفظ التقرير بنجاح.",
    review: "مراجعة الاعتماد",
    reviewComments: "تعليقات المراجعة",
    approve: "اعتماد",
    reject: "رفض",
    history: "سجل الاعتماد",
    noHistory: "لا توجد قرارات اعتماد مسجلة.",
    remove: "حذف",
    selected: "محدد",
    translate: "ترجمة",
    translateHint: "احفظ التقرير قبل ترجمته.",
  },
} as const

type InitialResponse = {
  id: string
  reportNumber: string
  visitNumber: number
  reportType: string
  subject: string | null
  reportTitle: string
  content: TermResponseContent
  status: ResponseStatus
  createdBy: ProjectStagePerson
  createdAt: string
  updatedAt: string
  attachments: ProjectStageAttachment[]
  approvals: ProjectStageApproval[]
} | null

type PendingFile = { id: string; file: File; previewUrl?: string; progress: number }

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"
}

function checklistFromTemplate(reference: string | null): ChecklistItem[] {
  if (!reference?.trim()) return []
  try {
    const parsed = JSON.parse(reference) as { checklist?: unknown[] }
    if (Array.isArray(parsed.checklist)) {
      return parsed.checklist.map((item) => ({
        id: crypto.randomUUID(),
        label: typeof item === "string" ? item : String((item as { label?: unknown })?.label ?? "Checklist item"),
        checked: false,
        result: "" as const,
      }))
    }
  } catch {
    // A plain template reference is still useful as an automatically loaded checklist prompt.
  }
  const values = reference.split(/[\n|;]/).map((item) => item.trim()).filter(Boolean)
  return values.map((label) => ({ id: crypto.randomUUID(), label: values.length === 1 ? `Complete assigned template: ${label}` : label, checked: false, result: "" as const }))
}


function plainResponseText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim()
}

function configuredResponseError(
  responseType: SubtermResponseType,
  content: TermResponseContent,
  imageCount: number,
  documentCount: number,
) {
  switch (responseType) {
    case "text":
      return plainResponseText(content.answer || content.feedback) ? null : "A written response is required before submission."
    case "inspection_checklist": {
      const rows = content.checklist.filter((item) => item.label.trim())
      if (!rows.length) return "Add at least one checklist item before submission."
      return rows.every((item) => item.result === "pass" || item.result === "fail" || item.result === "na") ? null : "Complete every checklist item before submission."
    }
    case "yes_no":
      return content.selection === "yes" || content.selection === "no" ? null : "Select Yes or No before submission."
    case "pass_fail":
      return content.selection === "pass" || content.selection === "fail" || content.selection === "na" ? null : "Select Pass, Fail, or N/A before submission."
    case "measurement":
      return content.measurementValue.trim() && Number.isFinite(Number(content.measurementValue)) ? null : "Enter a valid measurement before submission."
    case "date":
      return content.dateValue && Number.isFinite(Date.parse(content.dateValue)) ? null : "Select a valid date before submission."
    case "file_upload":
      return documentCount > 0 ? null : "Upload at least one file before submission."
    case "photo_evidence":
      return imageCount > 0 ? null : "Upload at least one photo before submission."
    default:
      return null
  }
}

function formatDate(value: string | Date, locale: "en" | "ar") {
  const date = typeof value === "string" ? new Date(value) : value
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date)
}

export function InspectionReportForm({
  project,
  stage,
  term,
  parentTerm,
  response,
  translation,
  canReview,
  workflowActive,
  canEdit,
  suggestedVisitNumber,
  initialResponseId,
  ccCandidates,
  initialCcRecipients,
}: {
  project: { id: string; name: string; code: string | null }
  stage: { id: string; name: string }
  term: {
    id: string
    reportName: string
    required: boolean
    responsibleUser: ProjectStagePerson | null
    templateReference: string | null
    responseType: SubtermResponseType
    instructions: string | null
    approvalRequired: boolean
    status: string
  }
  parentTerm: { id: string; name: string } | null
  response: InitialResponse
  translation?: ProjectStageTranslationSummary | null
  canReview: boolean
  workflowActive: boolean
  canEdit: boolean
  suggestedVisitNumber: number
  initialResponseId: string
  ccCandidates: ProjectCcCandidate[]
  initialCcRecipients: ReportCcRecipient[]
}) {
  const router = useRouter()
  const { locale } = useI18n()
  const copy = COPY[locale]
  const reportDate = response?.createdAt ?? new Date().toISOString()
  const [reportType, setReportType] = useState<ReportTypeValue>((REPORT_TYPES.some((item) => item.value === response?.reportType) ? response?.reportType : "inspection_report") as ReportTypeValue)
  const [visitNumber, setVisitNumber] = useState(response?.visitNumber ?? suggestedVisitNumber)
  const [subject, setSubject] = useState(response?.subject ?? "")
  const [reportTitle, setReportTitle] = useState(response?.reportTitle ?? term.reportName)
  const [content, setContent] = useState<TermResponseContent>(() => ({
    ...(response?.content ?? EMPTY_TERM_RESPONSE_CONTENT),
    checklist: response?.content.checklist.length ? response.content.checklist : checklistFromTemplate(term.templateReference),
  }))
  const [responseId, setResponseId] = useState(response?.id ?? null)
  const [reportNumber, setReportNumber] = useState(response?.reportNumber ?? "Auto-generated on save")
  const [status, setStatus] = useState<ResponseStatus>(response?.status ?? "draft")
  const [existingAttachments, setExistingAttachments] = useState(response?.attachments ?? [])
  const [pendingImages, setPendingImages] = useState<PendingFile[]>([])
  const [pendingDocuments, setPendingDocuments] = useState<PendingFile[]>([])
  const [busy, setBusy] = useState<"draft" | "progress" | "submit" | "approve" | "reject" | "inline" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [reviewComments, setReviewComments] = useState("")
  const [approvalHistory, setApprovalHistory] = useState(response?.approvals ?? [])
  const [ccSelection, setCcSelection] = useState<ReportCcSelection>(() => ({
    internalUserIds: initialCcRecipients.filter((recipient) => recipient.type === "internal" && recipient.userId).map((recipient) => recipient.userId as string),
    externalRecipients: initialCcRecipients.filter((recipient) => recipient.type === "external").map((recipient) => ({
      clientId: recipient.id,
      name: recipient.name,
      email: recipient.email ?? "",
      company: recipient.company ?? "",
      role: recipient.role ?? "",
    })),
  }))
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const documentInputRef = useRef<HTMLInputElement | null>(null)
  const pendingImagesRef = useRef<PendingFile[]>([])

  useEffect(() => {
    pendingImagesRef.current = pendingImages
  }, [pendingImages])

  useEffect(() => () => {
    for (const item of pendingImagesRef.current) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    }
  }, [])

  useEffect(() => {
    if (response) {
      setResponseId(response.id)
      setReportNumber(response.reportNumber)
      setStatus(response.status)
      setExistingAttachments(response.attachments ?? [])
      setApprovalHistory(response.approvals ?? [])
    }
  }, [response])

  const evidenceImages = existingAttachments.filter((item) => item.attachmentKind === "evidence_image")
  const documentAttachments = existingAttachments.filter((item) => item.attachmentKind === "document")
  const statusLocked = status === "approved" || status === "completed"
  const pendingReview = status === "submitted" || status === "under_review"
  const isEditable = canEdit && !statusLocked && !pendingReview
  const isLocked = !isEditable || !workflowActive

  const updateSection = useCallback((key: ReportSectionKey, value: string) => {
    setContent((current) => ({ ...current, [key]: value }))
  }, [])

  const ensureResponse = async (saveStatus: "draft" | "in_progress" = "draft") => {
    const targetResponseId = responseId ?? initialResponseId
    const result = await saveTermResponseAction({
      projectId: project.id,
      termId: term.id,
      responseId: targetResponseId,
      reportType,
      subject,
      reportTitle,
      content,
      saveStatus,
    })
    if (!result.ok) throw new Error(result.error)
    setResponseId(result.data.responseId)
    setReportNumber(result.data.reportNumber)
    setVisitNumber(result.data.visitNumber)
    setStatus(result.data.status as ResponseStatus)
    return result.data.responseId
  }

  const uploadFiles = async (id: string, files: PendingFile[], kind: "evidence_image" | "document") => {
    if (!files.length) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error("Your session has expired. Sign in again.")
    const registrations: AttachmentRegistration[] = []
    const uploadedPaths: string[] = []
    try {
      for (let index = 0; index < files.length; index += 1) {
        const item = files[index]
        const folder = kind === "evidence_image" ? "evidence" : "documents"
        const safeName = sanitizeEvidenceFileName(item.file.name)
        const path = `${project.id}/${id}/${folder}/${crypto.randomUUID()}-${safeName}`
        let mimeType = item.file.type
        if (kind === "evidence_image") {
          if (!mimeType || !mimeType.startsWith("image/")) {
            const ext = item.file.name.toLowerCase().match(/\.[^.]+$/)?.[0]
            if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg"
            else if (ext === ".png") mimeType = "image/png"
            else if (ext === ".webp") mimeType = "image/webp"
            else if (ext === ".gif") mimeType = "image/gif"
            else mimeType = "image/jpeg"
          }
        } else {
          mimeType = resolveStageDocumentMimeType(item.file) ?? "application/octet-stream"
        }
        await uploadStageEvidence(item.file, path, session.access_token, (progress) => {
          const update = (rows: PendingFile[]) => rows.map((row) => row.id === item.id ? { ...row, progress } : row)
          if (kind === "evidence_image") setPendingImages(update)
          else setPendingDocuments(update)
        }, mimeType)
        uploadedPaths.push(path)
        registrations.push({
          storagePath: path,
          originalFilename: item.file.name,
          mimeType,
          sizeBytes: item.file.size,
          attachmentKind: kind,
          sortOrder: existingAttachments.length + index,
        })
      }
      const registered = await registerResponseAttachmentsAction({ projectId: project.id, responseId: id, attachments: registrations })
      if (!registered.ok) throw new Error(registered.error)
      const newAttachments: ProjectStageAttachment[] = registrations.map((item, index) => ({
        id: registered.data.ids[index] ?? crypto.randomUUID(),
        storagePath: item.storagePath,
        originalFilename: item.originalFilename,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        attachmentKind: item.attachmentKind,
        sortOrder: item.sortOrder ?? index,
        createdAt: new Date().toISOString(),
      }))
      setExistingAttachments((current) => [...current, ...newAttachments])
      if (kind === "evidence_image") {
        files.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl))
        setPendingImages((current) => current.filter((row) => !files.some((f) => f.id === row.id)))
      } else {
        setPendingDocuments((current) => current.filter((row) => !files.some((f) => f.id === row.id)))
      }
    } catch (uploadError) {
      if (uploadedPaths.length) {
        await supabase.storage.from("project-stage-evidence").remove(uploadedPaths).catch(() => undefined)
      }
      throw uploadError
    }
  }

  const save = async (mode: "draft" | "progress" | "submit") => {
    if (!reportTitle.trim()) {
      setError(locale === "ar" ? "عنوان التقرير مطلوب." : "Report title is required.")
      return
    }
    if (mode === "submit") {
      const validationError = configuredResponseError(
        term.responseType,
        content,
        evidenceImages.length + pendingImages.length,
        documentAttachments.length + pendingDocuments.length,
      )
      if (validationError) {
        setError(validationError)
        return
      }
    }
    setError(null)
    setSuccess(null)
    setBusy(mode)
    try {
      const id = await ensureResponse(mode === "progress" ? "in_progress" : "draft")
      const ccResult = await saveReportCcRecipientsAction({
        projectId: project.id,
        responseId: id,
        context: "report",
        internalUserIds: ccSelection.internalUserIds,
        externalRecipients: ccSelection.externalRecipients,
      })
      if (!ccResult.ok) throw new Error(ccResult.error)
      await uploadFiles(id, pendingImages, "evidence_image")
      await uploadFiles(id, pendingDocuments, "document")
      if (mode === "submit") {
        const result = await saveTermResponseAction({
          projectId: project.id,
          termId: term.id,
          responseId: id,
          reportType,
          subject,
          reportTitle,
          content,
          submit: true,
        })
        if (!result.ok) throw new Error(result.error)
        setVisitNumber(result.data.visitNumber)
        setStatus(result.data.status as ResponseStatus)
        setSuccess(result.data.status === "completed" ? copy.saved : copy.submitted)
      } else {
        setStatus(mode === "progress" ? "in_progress" : "draft")
        setSuccess(copy.saved)
      }
      if (!response) {
        router.replace(`/projects/${project.id}/stages/${stage.id}/terms/${term.id}/reports/${id}`)
      }
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the report.")
    } finally {
      setBusy(null)
    }
  }

  const addImages = (files: File[]) => {
    const available = STAGE_EVIDENCE_MAX_IMAGES - evidenceImages.length - pendingImages.length
    if (available <= 0) {
      setError(`A maximum of ${STAGE_EVIDENCE_MAX_IMAGES} evidence images is allowed.`)
      return
    }
    const accepted = files.slice(0, available)
    const invalid = accepted.map(validateEvidenceImage).find(Boolean)
    if (invalid) {
      setError(invalid)
      return
    }
    setPendingImages((current) => [
      ...current,
      ...accepted.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), progress: 0 })),
    ])
    setError(null)
  }

  const addDocuments = (files: File[]) => {
    const available = STAGE_DOCUMENT_MAX_FILES - documentAttachments.length - pendingDocuments.length
    if (available <= 0) {
      setError(`A maximum of ${STAGE_DOCUMENT_MAX_FILES} document attachments is allowed.`)
      return
    }
    const accepted = files.slice(0, available)
    const invalid = accepted.map(validateStageDocument).find(Boolean)
    if (invalid) {
      setError(invalid)
      return
    }
    setPendingDocuments((current) => [...current, ...accepted.map((file) => ({ id: crypto.randomUUID(), file, progress: 0 }))])
    setError(null)
  }

  const removePending = (kind: "image" | "document", id: string) => {
    if (kind === "image") {
      setPendingImages((current) => {
        const item = current.find((row) => row.id === id)
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
        return current.filter((row) => row.id !== id)
      })
    } else setPendingDocuments((current) => current.filter((row) => row.id !== id))
  }

  const removeExisting = async (attachment: ProjectStageAttachment) => {
    setError(null)
    const result = await deleteResponseAttachmentAction({ projectId: project.id, attachmentId: attachment.id })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setExistingAttachments((current) => current.filter((item) => item.id !== attachment.id))
  }

  const uploadInlineImage = async (file: File) => {
    const validationError = validateEvidenceImage(file)
    if (validationError) throw new Error(validationError)
    setBusy("inline")
    try {
      const id = responseId ?? await ensureResponse("draft")
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error("Your session has expired. Sign in again.")
      const storagePath = `${project.id}/${id}/inline/${crypto.randomUUID()}-${sanitizeEvidenceFileName(file.name)}`
      await uploadStageEvidence(file, storagePath, session.access_token, () => undefined)
      const registered = await registerResponseAttachmentsAction({
        projectId: project.id,
        responseId: id,
        attachments: [{ storagePath, originalFilename: file.name, mimeType: file.type, sizeBytes: file.size, attachmentKind: "inline_image" }],
      })
      if (!registered.ok) {
        await supabase.storage.from("project-stage-evidence").remove([storagePath])
        throw new Error(registered.error)
      }
      return `/api/stage-evidence?path=${encodeURIComponent(storagePath)}`
    } finally {
      setBusy(null)
    }
  }

  const decide = async (decision: "approved" | "rejected") => {
    setError(null)
    setSuccess(null)
    setBusy(decision === "approved" ? "approve" : "reject")
    try {
      const id = responseId ?? await ensureResponse("draft")
      await uploadFiles(id, pendingImages, "evidence_image")
      await uploadFiles(id, pendingDocuments, "document")
      const result = await decideTermResponseAction({ projectId: project.id, responseId: id, decision, comments: reviewComments })
      if (!result.ok) throw new Error(result.error)
      setStatus(decision)
      setReviewComments("")
      setSuccess(decision === "approved" ? (locale === "ar" ? "تم اعتماد التقرير بنجاح." : "Report approved successfully.") : (locale === "ar" ? "تم رفض التقرير مع ملاحظات." : "Report rejected with comments."))
      router.refresh()
    } catch (decideError) {
      setError(decideError instanceof Error ? decideError.message : "Unable to record review decision.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-24">
      <Link href={`/projects/${project.id}/stages/${stage.id}/terms/${term.id}`} className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 flip-rtl" />{copy.back}
      </Link>

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>{project.name}</span><span aria-hidden>/</span><span>{stage.name}</span>
        {parentTerm ? <><span aria-hidden>/</span><span>{parentTerm.name}</span><span aria-hidden>/</span><span>{term.reportName}</span></> : <><span aria-hidden>/</span><span>{term.reportName}</span></>}
        <span aria-hidden>/</span><span className="font-medium text-foreground">{response ? response.reportTitle : "New Report"}</span>
      </nav>

      <Card className="overflow-hidden border-primary/20 py-0">
        <div className="bg-primary px-5 py-4 text-primary-foreground sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-white/15"><ClipboardCheck className="size-6" /></span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{parentTerm ? "Sub-term Response" : "Construction Inspection / Report"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold sm:text-2xl">{term.reportName}</h1>
                  <Badge
                    variant="outline"
                    className={term.required
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-white/30 bg-white/10 text-white"}
                  >
                    {term.required ? copy.required : copy.optional}
                  </Badge>
                  {parentTerm ? <Badge variant="outline" className="border-white/30 bg-white/10 text-white">{subtermResponseTypeLabel(term.responseType)}</Badge> : null}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {responseId ? (
                <StageTranslationActions
                  projectId={project.id}
                  stageId={stage.id}
                  termId={term.id}
                  responseId={responseId}
                  responseUpdatedAt={response?.updatedAt ?? new Date().toISOString()}
                  translation={translation}
                  inHeader
                />
              ) : (
                <Button type="button" size="sm" variant="secondary" className="bg-white/70 text-primary" disabled title={copy.translateHint}>
                  <Languages className="size-4" />{copy.translate}
                </Button>
              )}
              <Badge variant="outline" className={cn("w-fit border-white/30 bg-white/10 text-white", status !== "draft" && "border-white/40")}>{statusLabel(status, locale)}</Badge>
            </div>
          </div>
        </div>
        <CardContent className="grid gap-px bg-border p-0 sm:grid-cols-2 lg:grid-cols-4">
          <HeaderCell label={copy.project} value={project.name} />
          <HeaderCell label={copy.stage} value={stage.name} />
          <HeaderCell label={copy.reportNo} value={reportNumber} />
          <HeaderCell label={copy.visitNo} value={String(visitNumber)} />
          <HeaderCell label={copy.date} value={formatDate(reportDate, locale)} />
          <HeaderCell label={copy.responsible} value={term.responsibleUser?.name ?? copy.noResponsible} person={term.responsibleUser} />
          <HeaderCell label={copy.status} value={statusLabel(status, locale)} />
          <HeaderCell label={copy.report} value={term.reportName} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6"><CardTitle className="text-base font-semibold text-blue-950 dark:text-blue-100">{copy.basic}</CardTitle></CardHeader>
        <CardContent className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          <div className="space-y-2 sm:col-span-2 lg:col-span-4"><Label htmlFor="report-title">{copy.title} <span className="text-destructive">*</span></Label><Input id="report-title" value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} maxLength={250} disabled={isLocked} /></div>
          <div className="space-y-2"><Label>{copy.type}</Label><Select value={reportType} onValueChange={(value) => setReportType(value as ReportTypeValue)} disabled={isLocked}><SelectTrigger className="w-full"><SelectValue>{(value) => reportTypeLabel(String(value ?? reportType), locale)}</SelectValue></SelectTrigger><SelectContent>{REPORT_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{reportTypeLabel(item.value, locale)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="visit-no">{copy.visitNo}</Label><Input id="visit-no" type="number" min={1} value={visitNumber} readOnly aria-readonly="true" className="bg-muted/40" /></div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-2"><Label htmlFor="report-subject">{copy.subject}</Label><Input id="report-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Inspection location, package, activity, or reference" disabled={isLocked} /></div>
        </CardContent>
      </Card>

      <CcRecipientsField
        candidates={ccCandidates}
        value={ccSelection}
        onChange={setCcSelection}
        disabled={isLocked || busy !== null}
      />

      {term.templateReference ? <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100"><FileText className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">{copy.template}</p><p className="mt-0.5 text-xs opacity-80">{term.templateReference}</p></div></div> : null}
      {term.instructions ? <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"><p className="font-semibold">Description / Instructions</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{term.instructions}</p></div> : null}

      {term.responseType !== "combined" && term.responseType !== "inspection_checklist" ? (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6">
            <CardTitle className="text-base font-semibold text-blue-950 dark:text-blue-100">{subtermResponseTypeLabel(term.responseType)}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            {term.responseType === "text" ? (
              <div className="space-y-2">
                <Label htmlFor="configured-text-response">Written Response <span className="text-destructive">*</span></Label>
                <textarea id="configured-text-response" value={content.answer} onChange={(event) => setContent((current) => ({ ...current, answer: event.target.value.slice(0, 10000) }))} rows={7} disabled={isLocked} className="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" placeholder="Enter the required response" />
              </div>
            ) : term.responseType === "yes_no" || term.responseType === "pass_fail" ? (
              <div className="space-y-3">
                <Label>Result <span className="text-destructive">*</span></Label>
                <div className="flex flex-wrap gap-2">
                  {(term.responseType === "yes_no" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] : [{ value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }, { value: "na", label: "N/A" }]).map((option) => (
                    <Button key={option.value} type="button" variant={content.selection === option.value ? "default" : "outline"} disabled={isLocked} onClick={() => setContent((current) => ({ ...current, selection: option.value }))}>{option.label}</Button>
                  ))}
                </div>
              </div>
            ) : term.responseType === "measurement" ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.45fr)]">
                <div className="space-y-2"><Label htmlFor="measurement-value">Value <span className="text-destructive">*</span></Label><Input id="measurement-value" inputMode="decimal" value={content.measurementValue} onChange={(event) => setContent((current) => ({ ...current, measurementValue: event.target.value }))} placeholder="Enter numeric value" disabled={isLocked} /></div>
                <div className="space-y-2"><Label htmlFor="measurement-unit">Unit</Label><Input id="measurement-unit" value={content.measurementUnit} onChange={(event) => setContent((current) => ({ ...current, measurementUnit: event.target.value.slice(0, 100) }))} placeholder="mm, m², MPa…" disabled={isLocked} /></div>
              </div>
            ) : term.responseType === "date" ? (
              <div className="max-w-sm space-y-2"><Label htmlFor="configured-date">Date <span className="text-destructive">*</span></Label><Input id="configured-date" type="date" value={content.dateValue} onChange={(event) => setContent((current) => ({ ...current, dateValue: event.target.value }))} disabled={isLocked} /></div>
            ) : (
              <p className="text-sm text-muted-foreground">{term.responseType === "file_upload" ? "Upload at least one supporting file before submitting for review." : "Upload at least one evidence photo before submitting for review."}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <AttachmentCard
          title={copy.evidence}
          description={copy.evidenceHint}
          icon={<ImagePlus className="size-5" />}
          actionLabel={copy.uploadImages}
          onAction={() => imageInputRef.current?.click()}
          disabled={isLocked || busy !== null || evidenceImages.length + pendingImages.length >= STAGE_EVIDENCE_MAX_IMAGES}
        >
          <input ref={imageInputRef} type="file" accept={STAGE_EVIDENCE_ACCEPT} multiple className="hidden" onChange={(event) => { addImages(Array.from(event.target.files ?? [])); event.target.value = "" }} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
            {evidenceImages.map((attachment) => <EvidenceTile key={attachment.id} src={`/api/stage-evidence?path=${encodeURIComponent(attachment.storagePath)}`} name={attachment.originalFilename} onRemove={isLocked ? undefined : () => void removeExisting(attachment)} />)}
            {pendingImages.map((item) => <EvidenceTile key={item.id} src={item.previewUrl ?? ""} name={item.file.name} progress={item.progress} onRemove={() => removePending("image", item.id)} />)}
            {!evidenceImages.length && !pendingImages.length ? <EmptyAttachment text={copy.uploadImages} onClick={() => imageInputRef.current?.click()} /> : null}
          </div>
        </AttachmentCard>

        <AttachmentCard
          title={copy.documents}
          description={copy.documentHint}
          icon={<FileText className="size-5" />}
          actionLabel={copy.addDocuments}
          onAction={() => documentInputRef.current?.click()}
          disabled={isLocked || busy !== null || documentAttachments.length + pendingDocuments.length >= STAGE_DOCUMENT_MAX_FILES}
        >
          <input ref={documentInputRef} type="file" accept={STAGE_DOCUMENT_ACCEPT} multiple className="hidden" onChange={(event) => { addDocuments(Array.from(event.target.files ?? [])); event.target.value = "" }} />
          <div className="space-y-2">
            {documentAttachments.map((attachment) => <DocumentRow key={attachment.id} name={attachment.originalFilename} href={`/api/stage-evidence?path=${encodeURIComponent(attachment.storagePath)}&download=1&filename=${encodeURIComponent(attachment.originalFilename)}`} onRemove={isLocked ? undefined : () => void removeExisting(attachment)} />)}
            {pendingDocuments.map((item) => <DocumentRow key={item.id} name={item.file.name} progress={item.progress} onRemove={() => removePending("document", item.id)} />)}
            {!documentAttachments.length && !pendingDocuments.length ? <EmptyAttachment text={copy.addDocuments} compact onClick={() => documentInputRef.current?.click()} /> : null}
          </div>
        </AttachmentCard>
      </div>

      {term.responseType === "combined" || term.responseType === "inspection_checklist" ? (
        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6">
            <CardTitle className="text-base font-semibold text-blue-950 dark:text-blue-100">{copy.checklist}</CardTitle>
            <Button type="button" variant="outline" size="sm" disabled={isLocked} onClick={() => setContent((current) => ({ ...current, checklist: [...current.checklist, { id: crypto.randomUUID(), label: "", checked: false, result: "" }] }))}><Plus className="size-4" />{copy.addItem}</Button>
          </div>
          <CardContent className="space-y-3 p-5 sm:p-6">
            {content.checklist.length ? content.checklist.map((item, index) => (
              <div key={item.id} className={cn("grid gap-2 rounded-xl border bg-muted/20 p-3 sm:items-center", term.responseType === "inspection_checklist" ? "sm:grid-cols-[minmax(0,1fr)_150px_minmax(180px,0.55fr)_auto]" : "sm:grid-cols-[auto_minmax(0,1fr)_minmax(180px,0.55fr)_auto]")}>
                {term.responseType === "inspection_checklist" ? (
                  <>
                    <Input value={item.label} disabled={isLocked} onChange={(event) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, label: event.target.value } : row) }))} placeholder={`Check item ${index + 1}`} />
                    <Select value={item.result || "pending"} onValueChange={(value) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, result: value === "pending" ? "" : (value as "pass" | "fail" | "na"), checked: value === "pass" } : row) }))} disabled={isLocked}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="pending">Select result</SelectItem><SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem><SelectItem value="na">N/A</SelectItem></SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <button type="button" disabled={isLocked} onClick={() => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, checked: !row.checked, result: !row.checked ? "pass" : "" } : row) }))} className={cn("flex size-7 items-center justify-center rounded-lg border", item.checked ? "border-emerald-600 bg-emerald-600 text-white" : "bg-background")} aria-label={`Mark checklist item ${index + 1}`}><Check className="size-4" /></button>
                    <Input value={item.label} disabled={isLocked} onChange={(event) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, label: event.target.value } : row) }))} placeholder={`Checklist item ${index + 1}`} />
                  </>
                )}
                <Input value={item.notes ?? ""} disabled={isLocked} onChange={(event) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, notes: event.target.value } : row) }))} placeholder="Comment / reference" />
                <Button type="button" variant="ghost" size="icon" disabled={isLocked} onClick={() => setContent((current) => ({ ...current, checklist: current.checklist.filter((row) => row.id !== item.id) }))} aria-label={copy.remove}><Trash2 className="size-4" /></Button>
              </div>
            )) : <p className="py-4 text-center text-sm text-muted-foreground">No checklist items. Add items for this inspection.</p>}
          </CardContent>
        </Card>
      ) : null}

      {term.responseType === "combined" ? SECTION_META.map((section) => (
        <RichSectionEditor key={section.key} title={locale === "ar" ? section.titleAr : section.title} description={section.description} value={content[section.key]} onChange={(value) => updateSection(section.key, value)} allowTable={section.key === "feedback"} disabled={isLocked} uploadInlineImage={uploadInlineImage} />
      )) : term.responseType === "inspection_checklist" ? (
        <RichSectionEditor title="Overall Notes" description="Add overall inspection observations or follow-up notes." value={content.feedback} onChange={(value) => updateSection("feedback", value)} allowTable={false} disabled={isLocked} uploadInlineImage={uploadInlineImage} />
      ) : term.responseType === "text" ? null : (
        <RichSectionEditor title="Comments / Notes" description="Add context, observations, or supporting notes." value={content.feedback} onChange={(value) => updateSection("feedback", value)} allowTable={false} disabled={isLocked} uploadInlineImage={uploadInlineImage} />
      )}

      {responseId && (status === "submitted" || status === "under_review" || status === "rejected" || status === "approved") ? (
        <ApprovalPanel canReview={canReview} status={status} comments={reviewComments} onComments={setReviewComments} onDecision={decide} busy={busy} approvals={approvalHistory} copy={copy} locale={locale} />
      ) : null}

      {!workflowActive ? <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"><AlertCircle className="mt-0.5 size-4 shrink-0" />This workflow item is disabled for the project. Existing review history remains available, but new employee work is blocked.</div> : null}
      {error ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div> : null}
      {success ? <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{success}</div> : null}

      {((canReview && pendingReview) || (workflowActive && isEditable)) ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur md:start-64 md:px-8">
          <div className="mx-auto flex max-w-7xl flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            {canReview && pendingReview ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={busy !== null}
                  className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                  onClick={() => void decide("rejected")}
                >
                  {busy === "reject" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                  {locale === "ar" ? "رفض التقرير" : "Reject Report"}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  disabled={busy !== null}
                  className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  onClick={() => void decide("approved")}
                >
                  {busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {locale === "ar" ? "اعتماد التقرير" : "Approve Report"}
                </Button>
              </div>
            ) : null}
            {workflowActive && isEditable ? (
              <>
                <Button variant="outline" size="lg" disabled={busy !== null} onClick={() => void save("draft")}>{busy === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{copy.saveDraft}</Button>
                <Button variant="outline" size="lg" disabled={busy !== null} onClick={() => void save("progress")}>{busy === "progress" ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}{copy.saveProgress}</Button>
                <Button size="lg" disabled={busy !== null} onClick={() => void save("submit")}>{busy === "submit" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{copy.submit}</Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function HeaderCell({ label, value, person }: { label: string; value: string; person?: ProjectStagePerson | null }) {
  return <div className="min-h-20 bg-card px-5 py-4"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>{person ? <div className="mt-2 flex items-center gap-2"><Avatar size="sm">{person.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(person.avatarUrl)} alt="" /> : null}<AvatarFallback>{initials(person.name)}</AvatarFallback></Avatar><span className="truncate font-medium">{value}</span></div> : <p className="mt-2 font-medium">{value}</p>}</div>
}

function AttachmentCard({ title, description, icon, actionLabel, onAction, disabled, children }: { title: string; description: string; icon: ReactNode; actionLabel: string; onAction: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-4 border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-blue-950 dark:text-blue-100">
            <span className="text-primary">{icon}</span>
            {title}
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onAction}
          disabled={disabled}
          title={actionLabel}
          aria-label={actionLabel}
          className="size-11 shrink-0 rounded-xl p-0 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          <UploadCloud className="size-5 text-primary" />
        </Button>
      </div>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  )
}

function EmptyAttachment({ text, compact = false, onClick }: { text: string; compact?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded-xl border border-dashed text-center text-xs text-muted-foreground transition-colors",
        onClick && "cursor-pointer hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
        compact ? "min-h-20" : "col-span-full min-h-32",
      )}
    >
      <span>
        <UploadCloud className="mx-auto mb-2 size-5 text-primary/70" />
        {text}
      </span>
    </div>
  )
}

function EvidenceTile({ src, name, progress, onRemove }: { src: string; name: string; progress?: number; onRemove?: () => void }) {
  return <div className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted"><img src={src} alt={name} className="size-full object-cover" />{onRemove ? <button type="button" onClick={onRemove} className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${name}`}><X className="size-4" /></button> : null}{progress !== undefined && progress > 0 && progress < 100 ? <div className="absolute inset-x-2 bottom-2"><div className="h-1.5 overflow-hidden rounded-full bg-black/30"><div className="h-full bg-white" style={{ width: `${progress}%` }} /></div></div> : null}<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-5"><p className="truncate text-[11px] font-medium text-white">{name}</p></div></div>
}

function DocumentRow({ name, href, progress, onRemove }: { name: string; href?: string; progress?: number; onRemove?: () => void }) {
  const body = <><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p>{progress !== undefined && progress > 0 ? <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div> : <p className="text-xs text-muted-foreground">Supporting document</p>}</div>{href ? <FileDown className="size-4 text-muted-foreground" /> : null}</>
  return <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5">{href ? <a href={href} className="flex min-w-0 flex-1 items-center gap-3 hover:text-primary">{body}</a> : body}{onRemove ? <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${name}`}><Trash2 className="size-4" /></Button> : null}</div>
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function RichSectionEditor({ title, description, value, onChange, allowTable, disabled, uploadInlineImage }: { title: string; description: string; value: string; onChange: (value: string) => void; allowTable: boolean; disabled: boolean; uploadInlineImage: (file: File) => Promise<string> }) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => { if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value || "<p><br></p>" }, [])
  const saveSelection = () => {
    const selection = window.getSelection()
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) savedRangeRef.current = selection.getRangeAt(0).cloneRange()
  }
  const restore = () => {
    editorRef.current?.focus()
    const selection = window.getSelection()
    if (selection && savedRangeRef.current) { selection.removeAllRanges(); selection.addRange(savedRangeRef.current) }
  }
  const command = (name: string, argument?: string) => { restore(); document.execCommand(name, false, argument); onChange(editorRef.current?.innerHTML ?? "") }
  const addLink = () => { const href = window.prompt("Enter link URL"); if (href) command("createLink", href) }
  const addTable = () => command("insertHTML", '<table><tbody><tr><th>Item</th><th>Requirement</th><th>Result</th></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>')
  const imageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setUploadError(null); setUploading(true)
    try {
      const src = await uploadInlineImage(file)
      const safeName = escapeHtml(file.name)
      restore()
      document.execCommand("insertHTML", false, `<figure contenteditable="false"><img src="${escapeHtml(src)}" alt="${safeName}"><figcaption>${safeName}</figcaption></figure><p><br></p>`)
      onChange(editorRef.current?.innerHTML ?? "")
    }
    catch (error) { setUploadError(error instanceof Error ? error.message : "Unable to upload inline image.") }
    finally { setUploading(false) }
  }
  return <Card className="gap-0 overflow-hidden py-0"><CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6"><CardTitle className="text-base font-semibold text-blue-950 dark:text-blue-100">{title}</CardTitle><p className="text-xs text-muted-foreground">{description}</p></CardHeader><div className="flex flex-wrap items-center gap-1 border-b bg-muted/35 px-3 py-2"><EditorButton label="Bold" onClick={() => command("bold")} disabled={disabled}><Bold /></EditorButton><EditorButton label="Italic" onClick={() => command("italic")} disabled={disabled}><Italic /></EditorButton><EditorButton label="Underline" onClick={() => command("underline")} disabled={disabled}><Underline /></EditorButton><span className="mx-1 h-5 w-px bg-border" /><EditorButton label="Bulleted list" onClick={() => command("insertUnorderedList")} disabled={disabled}><List /></EditorButton><EditorButton label="Numbered list" onClick={() => command("insertOrderedList")} disabled={disabled}><ListOrdered /></EditorButton><EditorButton label="Link" onClick={addLink} disabled={disabled}><Link2 /></EditorButton>{allowTable ? <EditorButton label="Insert table" onClick={addTable} disabled={disabled}><Table2 /></EditorButton> : null}<EditorButton label="Inline image" onClick={() => { saveSelection(); imageInputRef.current?.click() }} disabled={disabled || uploading}>{uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}</EditorButton><span className="mx-1 h-5 w-px bg-border" /><EditorButton label="Undo" onClick={() => command("undo")} disabled={disabled}><Undo2 /></EditorButton><EditorButton label="Redo" onClick={() => command("redo")} disabled={disabled}><Redo2 /></EditorButton><input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={imageSelected} /></div>{uploadError ? <div className="border-b bg-red-50 px-4 py-2 text-xs text-red-700">{uploadError}</div> : null}<div ref={editorRef} contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" onFocus={saveSelection} onKeyUp={saveSelection} onMouseUp={saveSelection} onInput={() => onChange(editorRef.current?.innerHTML ?? "")} className="inspection-editor min-h-56 bg-background px-5 py-5 outline-none sm:px-7" /></Card>
}

function EditorButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onMouseDown={(event) => { event.preventDefault(); onClick() }} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40 [&_svg]:size-4">{children}</button>
}

function ApprovalPanel({ canReview, status, comments, onComments, onDecision, busy, approvals, copy, locale }: { canReview: boolean; status: ResponseStatus; comments: string; onComments: (value: string) => void; onDecision: (decision: "approved" | "rejected") => void; busy: string | null; approvals: ProjectStageApproval[]; copy: (typeof COPY)["en"] | (typeof COPY)["ar"]; locale: "en" | "ar" }) {
  return <Card className="gap-0 py-0"><CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6"><CardTitle className="flex items-center gap-2 text-base font-semibold text-blue-950 dark:text-blue-100"><ShieldCheck className="size-5 text-primary" />{copy.review}</CardTitle></CardHeader><CardContent className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">{canReview && (status === "submitted" || status === "under_review") ? <div className="space-y-3"><Label htmlFor="review-comments">{copy.reviewComments}</Label><textarea id="review-comments" value={comments} onChange={(event) => onComments(event.target.value)} rows={5} className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" placeholder="Record acceptance notes, required corrections, or reasons for rejection." /><div className="flex flex-wrap justify-end gap-2"><Button variant="destructive" disabled={busy !== null} onClick={() => onDecision("rejected")}>{busy === "reject" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}{copy.reject}</Button><Button disabled={busy !== null} onClick={() => onDecision("approved")}>{busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{copy.approve}</Button></div></div> : <div className="rounded-xl border bg-muted/20 p-4"><p className="text-sm font-semibold">{statusLabel(status, locale)}</p><p className="mt-1 text-xs text-muted-foreground">{status === "approved" ? "This report has been approved." : "This report is awaiting an authorized reviewer."}</p></div>}<div><h3 className="mb-3 text-sm font-semibold">{copy.history}</h3>{approvals.length ? <div className="space-y-3">{approvals.map((approval) => <div key={approval.id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Avatar size="sm">{approval.reviewer.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(approval.reviewer.avatarUrl)} alt="" /> : null}<AvatarFallback>{initials(approval.reviewer.name)}</AvatarFallback></Avatar><div><p className="text-sm font-medium">{approval.reviewer.name}</p><p className="text-xs text-muted-foreground">{formatDate(approval.decidedAt, locale)}</p></div></div><Badge variant="outline" className={statusTone(approval.decision)}>{statusLabel(approval.decision, locale)}</Badge></div>{approval.comments ? <p className="mt-3 rounded-lg bg-muted/35 p-2 text-xs">{approval.comments}</p> : null}</div>)}</div> : <p className="text-sm text-muted-foreground">{copy.noHistory}</p>}</div></CardContent></Card>
}
