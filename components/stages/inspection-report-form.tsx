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
  ChevronDown,
  ClipboardCheck,
  FileDown,
  FileText,
  Hourglass,
  ImagePlus,
  Italic,
  Link2,
  Languages,
  List,
  ListOrdered,
  Loader2,
  MessageSquare,
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
  saveStageReportAction,
  saveTermResponseAction,
  type AttachmentRegistration,
} from "@/lib/actions/project-stages"
import { saveReportCcRecipientsAction } from "@/lib/actions/report-cc"
import { enqueueStageTranslationJob } from "@/lib/stage-translations/client-auto-generation"
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
  getFallbackStageChecklist,
  resolveStageDocumentMimeType,
  sanitizeEvidenceFileName,
  statusLabel,
  statusTone,
  subtermResponseTypeLabel,
  validateEvidenceImage,
  validateStageDocument,
  type ChecklistItem,
  type ChecklistResult,
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
  {
    key: "observation",
    title: "Observation / Work Progress",
    titleAr: "المعاينة وسير العمل",
    description: "Document detailed site observations, locations, materials, and work progress.",
  },
  {
    key: "recommendations",
    title: "Instructions / Recommendations",
    titleAr: "التوصيات والتعليمات",
    description: "Provide clear technical instructions, recommendations, and next steps.",
  },
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
    submitted: "Report submitted. Translation and PDFs are being prepared.",
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
    translateHint: "Submit the report to prepare its translation.",
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
    submitted: "تم إرسال التقرير. جارٍ إعداد الترجمة وملفات PDF.",
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
    translateHint: "أرسل التقرير لبدء إعداد الترجمة.",
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

function normalizedRecipientRole(candidate: ProjectCcCandidate) {
  return (candidate.roleKey?.trim() || candidate.role.trim())
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim()
}

function preferredRecipientCandidate(
  candidates: ProjectCcCandidate[],
  matches: (candidate: ProjectCcCandidate) => boolean,
  excludedIds = new Set<string>(),
) {
  return candidates
    .filter((candidate) => !excludedIds.has(candidate.id) && matches(candidate))
    .sort((left, right) => (left.defaultPriority ?? Number.MAX_SAFE_INTEGER) - (right.defaultPriority ?? Number.MAX_SAFE_INTEGER))[0] ?? null
}

function initialRecipientSelection(
  candidates: ProjectCcCandidate[],
  recipients: ReportCcRecipient[],
  applyNewStageDefaults: boolean,
): ReportCcSelection {
  if (applyNewStageDefaults && recipients.length === 0) {
    const contractor = preferredRecipientCandidate(candidates, (candidate) => {
      const role = normalizedRecipientRole(candidate)
      return role === "contractor" || role.startsWith("contractor (")
    })
    const owner = preferredRecipientCandidate(candidates, (candidate) => {
      const role = normalizedRecipientRole(candidate)
      return role === "client / owner" || role === "owner / client" || role === "client" || role === "owner"
    }, new Set(contractor ? [contractor.id] : []))

    const reportToUserIds = contractor ? [contractor.id] : []
    const ccToUserIds = owner ? [owner.id] : []
    return {
      internalUserIds: Array.from(new Set([...reportToUserIds, ...ccToUserIds])),
      externalRecipients: [],
      reportToUserIds,
      ccToUserIds,
    }
  }

  const reportToRecipient = recipients[0] ?? null
  const reportToUserIds = reportToRecipient?.type === "internal" && reportToRecipient.userId ? [reportToRecipient.userId] : []
  const ccToUserIds = recipients
    .slice(1)
    .filter((recipient) => recipient.type === "internal" && recipient.userId)
    .map((recipient) => recipient.userId as string)

  return {
    internalUserIds: recipients
      .filter((recipient) => recipient.type === "internal" && recipient.userId)
      .map((recipient) => recipient.userId as string),
    externalRecipients: recipients
      .filter((recipient) => recipient.type === "external")
      .map((recipient) => ({
        clientId: recipient.id,
        name: recipient.name,
        email: recipient.email ?? "",
        company: recipient.company ?? "",
        role: recipient.role ?? "",
        group: recipients[0]?.id === recipient.id ? "reportTo" as const : "ccTo" as const,
      })),
    reportToUserIds,
    ccToUserIds,
  }
}

export function InspectionReportForm({
  project,
  stage,
  term: legacyTerm,
  reportConfig: stageReportConfig,
  parentTerm = null,
  response,
  translation,
  canReview,
  canManage,
  isMember = false,
  currentUserId,
  currentUserPerson,
  workflowActive,
  canEdit,
  suggestedVisitNumber,
  initialResponseId,
  ccCandidates,
  initialCcRecipients,
  stageSubterms,
  siteVisitRequestId = null,
}: {
  project: { id: string; name: string; code: string | null }
  stage: { id: string; name: string }
  term?: {
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
  reportConfig?: {
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
  parentTerm?: { id: string; name: string } | null
  response: InitialResponse
  translation?: ProjectStageTranslationSummary | null
  canReview: boolean
  canManage?: boolean
  isMember?: boolean
  currentUserId?: string
  currentUserPerson?: ProjectStagePerson | null
  workflowActive: boolean
  canEdit: boolean
  suggestedVisitNumber: number
  initialResponseId: string
  ccCandidates: ProjectCcCandidate[]
  initialCcRecipients: ReportCcRecipient[]
  stageSubterms?: Array<{ id: string; reportName: string }>
  siteVisitRequestId?: string | null
}) {
  const router = useRouter()
  const reportDefinition = stageReportConfig ?? legacyTerm
  if (!reportDefinition) throw new Error("Report configuration is missing.")
  const isDirectStageReport = Boolean(stageReportConfig)
  const [resolvedStageId, setResolvedStageId] = useState(stage.id)
  const reportsHref = `/projects/${project.id}/stages/${resolvedStageId}`
  const { locale } = useI18n()
  const copy = COPY[locale]
  const cleanStageName = stage.name.replace(/^\d+[\.\s\-]+/, "")
  const cleanTermReportName = reportDefinition.reportName.replace(/^\d+[\.\s\-]+/, "")
  const reportDate = response?.createdAt ?? new Date().toISOString()
  const [reportType, setReportType] = useState<ReportTypeValue>((REPORT_TYPES.some((item) => item.value === response?.reportType) ? response?.reportType : "inspection_report") as ReportTypeValue)
  const [visitNumber, setVisitNumber] = useState(response?.visitNumber ?? suggestedVisitNumber)
  const initialVisitFormatted = String(visitNumber).padStart(3, "0")
  const defaultReportTitlePattern = locale === "ar"
    ? `زيارة ${initialVisitFormatted} - ${cleanStageName} Report`
    : `Visit ${initialVisitFormatted} - ${cleanStageName} Report`
  const [subject, setSubject] = useState(response?.subject ?? "")
  const [reportTitle, setReportTitle] = useState(response?.reportTitle ?? defaultReportTitlePattern)
  const [content, setContent] = useState<TermResponseContent>(() => {
    let initialChecklist: ChecklistItem[] = []
    if (response?.content.checklist?.length) {
      initialChecklist = response.content.checklist
    } else if (stageSubterms?.length) {
      initialChecklist = stageSubterms.map((item) => ({
        id: crypto.randomUUID(),
        label: item.reportName.replace(/^\d+[\.\s\-]+/, ""),
        checked: false,
        result: "" as const,
      }))
    } else {
      const fallbackItems = getFallbackStageChecklist(stage.name)
      if (fallbackItems.length) {
        initialChecklist = fallbackItems.map((item) => ({
          id: crypto.randomUUID(),
          label: item.reportName.replace(/^\d+[\.\s\-]+/, ""),
          checked: false,
          result: "" as const,
        }))
      } else {
        initialChecklist = checklistFromTemplate(reportDefinition.templateReference)
      }
    }
    return {
      ...(response?.content ?? EMPTY_TERM_RESPONSE_CONTENT),
      checklist: initialChecklist,
    }
  })
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
  const [expandedChecklistCommentId, setExpandedChecklistCommentId] = useState<string | null>(null)
  const [ccSelection, setCcSelection] = useState<ReportCcSelection>(() => initialRecipientSelection(
    ccCandidates,
    initialCcRecipients,
    isDirectStageReport && response === null,
  ))
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
  const isMemberExistingReport = isMember && Boolean(response)
  const isMemberReadOnlyReport = isMemberExistingReport && (pendingReview || statusLocked)
  const canRenderReviewerActions = canReview && !isMember
  const directTranslationAvailable = !isDirectStageReport || ["submitted", "under_review", "rejected", "approved", "completed"].includes(status)

  const updateSection = useCallback((key: ReportSectionKey, value: string) => {
    setContent((current) => ({ ...current, [key]: value }))
  }, [])

  const ensureResponse = async (saveStatus: "draft" | "in_progress" = "draft") => {
    const targetResponseId = responseId ?? initialResponseId
    const reportInput = {
      projectId: project.id,
      responseId: targetResponseId,
      reportType,
      subject,
      reportTitle,
      content,
      approvalRequired: reportDefinition.approvalRequired,
      responseType: reportDefinition.responseType,
      responsibleUserId: reportDefinition.responsibleUser?.id ?? null,
      templateReference: reportDefinition.templateReference,
      instructions: reportDefinition.instructions,
      saveStatus,
    }
    const result = isDirectStageReport
      ? await saveStageReportAction({ ...reportInput, stageId: resolvedStageId, siteVisitRequestId })
      : await saveTermResponseAction({ ...reportInput, termId: reportDefinition.id })
    if (!result.ok) throw new Error(result.error)
    setResponseId(result.data.responseId)
    setResolvedStageId(result.data.projectStageId)
    setReportNumber(result.data.reportNumber)
    setVisitNumber(result.data.visitNumber)
    setStatus(result.data.status as ResponseStatus)
    return result.data
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
      const totalRecipients = ccSelection.internalUserIds.length + ccSelection.externalRecipients.length
      const reportToCount = (ccSelection.reportToUserIds?.length ?? 0) + ccSelection.externalRecipients.filter((r) => (r as any).group === "reportTo" || !(r as any).group).length
      const ccToCount = (ccSelection.ccToUserIds?.length ?? 0) + ccSelection.externalRecipients.filter((r) => (r as any).group === "ccTo").length

      if (totalRecipients === 0 || reportToCount === 0 || ccToCount === 0) {
        setError(
          locale === "ar"
            ? "يرجى تحديد مستلم التقرير (Report to) ومستلم النسخة (CC to) قبل إرسال التقرير."
            : "Please select both 'Report to' and 'CC to' recipients before submitting the report for review."
        )
        return
      }

      const validationError = configuredResponseError(
        reportDefinition.responseType,
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
      const savedResponse = await ensureResponse(mode === "progress" ? "in_progress" : "draft")
      const id = savedResponse.responseId
      let routeStageId = savedResponse.projectStageId
      if (ccSelection.internalUserIds.length || ccSelection.externalRecipients.length || initialCcRecipients.length) {
        const ccResult = await saveReportCcRecipientsAction({
          projectId: project.id,
          responseId: id,
          context: "report",
          internalUserIds: ccSelection.internalUserIds,
          externalRecipients: ccSelection.externalRecipients,
          reportToUserIds: isDirectStageReport ? ccSelection.reportToUserIds : undefined,
          ccToUserIds: isDirectStageReport ? ccSelection.ccToUserIds : undefined,
        })
        if (!ccResult.ok) throw new Error(ccResult.error)
      }
      await uploadFiles(id, pendingImages, "evidence_image")
      await uploadFiles(id, pendingDocuments, "document")
      if (mode === "submit") {
        const reportInput = {
          projectId: project.id,
          responseId: id,
          reportType,
          subject,
          reportTitle,
          content,
          approvalRequired: reportDefinition.approvalRequired,
          responseType: reportDefinition.responseType,
          responsibleUserId: reportDefinition.responsibleUser?.id ?? null,
          templateReference: reportDefinition.templateReference,
          instructions: reportDefinition.instructions,
          submit: true as const,
        }
        const result = isDirectStageReport
          ? await saveStageReportAction({ ...reportInput, stageId: routeStageId, siteVisitRequestId })
          : await saveTermResponseAction({ ...reportInput, termId: reportDefinition.id })
        if (!result.ok) throw new Error(result.error)
        routeStageId = result.data.projectStageId
        setResolvedStageId(result.data.projectStageId)
        setVisitNumber(result.data.visitNumber)
        setStatus(result.data.status as ResponseStatus)
        setSuccess(copy.submitted)
        if (isDirectStageReport) {
          enqueueStageTranslationJob({
            projectId: project.id,
            stageId: result.data.projectStageId,
            responseId: id,
          })
        }
        if (isMember) {
          router.replace(`/projects/${project.id}/stages`)
          router.refresh()
          return
        }
      } else {
        setStatus(mode === "progress" ? "in_progress" : "draft")
        setSuccess(copy.saved)
      }
      if (!response) {
        router.replace(`/projects/${project.id}/stages/${routeStageId}/reports/${id}`)
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
      const id = responseId ?? (await ensureResponse("draft")).responseId
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
      const id = responseId ?? (await ensureResponse("draft")).responseId
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

  const formattedVisitNo = String(visitNumber).padStart(3, "0")
  const projectCode = project.code?.trim() || "PROJ"
  const displayReportNo = response?.reportNumber && response.reportNumber.includes("/")
    ? response.reportNumber
    : `${projectCode}/${formattedVisitNo}`
  const creatorPerson = response?.createdBy ?? currentUserPerson ?? {
    id: currentUserId ?? "",
    name: "Project member",
    email: null,
    avatarUrl: null,
  }

  return (
    <div className={cn("mx-auto flex w-full max-w-7xl flex-col gap-3 md:gap-5 md:pb-24", isMemberReadOnlyReport ? "pb-4" : "pb-[calc(4.75rem+env(safe-area-inset-bottom))]")}>
      <Link href={reportsHref} className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground md:gap-2 md:text-sm">
        <ArrowLeft className="size-4 flip-rtl" />{copy.back}
      </Link>

      <nav aria-label="Breadcrumb" className="hidden flex-wrap items-center gap-1.5 text-xs text-muted-foreground md:flex">
        <span>{project.name}</span><span aria-hidden>/</span><span>{cleanStageName}</span>
        <span aria-hidden>/</span><span className="font-medium text-foreground">{response ? response.reportTitle.replace(/^\d+[\.\s\-]+/, "") : (locale === "ar" ? "تقرير جديد" : "New Report")}</span>
      </nav>

      <Card className="overflow-hidden border-primary/20 py-0">
        <div className="bg-primary px-3 py-3 text-primary-foreground md:px-6 md:py-4">
          <div className={cn("flex items-start justify-between gap-2 md:items-center md:gap-3", isMemberExistingReport && "flex-col md:flex-row")}>
            <div className="flex min-w-0 items-center gap-2 md:gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 md:size-11 md:rounded-xl"><ClipboardCheck className="size-5 md:size-6" /></span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70 md:text-xs">{parentTerm ? "Sub-term Response" : "Construction Inspection / Report"}</p>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 md:mt-1 md:gap-2">
                  <h1 className="min-w-0 text-base font-semibold leading-tight md:text-2xl">{cleanTermReportName}</h1>
                  <Badge
                    variant="outline"
                    className={reportDefinition.required
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-white/30 bg-white/10 text-white"}
                  >
                    {reportDefinition.required ? copy.required : copy.optional}
                  </Badge>
                  {parentTerm ? <Badge variant="outline" className="border-white/30 bg-white/10 text-white">{subtermResponseTypeLabel(reportDefinition.responseType)}</Badge> : null}
                </div>
              </div>
            </div>
            <div className={cn("flex shrink-0 flex-col items-end gap-1 md:flex-row md:flex-wrap md:items-center md:gap-2", isMemberExistingReport && "w-full items-stretch md:w-auto md:items-center")}>
              {responseId && directTranslationAvailable ? (
                <StageTranslationActions
                  projectId={project.id}
                  stageId={resolvedStageId}
                  termId={isDirectStageReport ? resolvedStageId : reportDefinition.id}
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
              <div className={cn("flex items-center gap-1.5", isMemberExistingReport && "justify-between md:justify-start")}>
                <Badge variant="outline" className={cn("w-fit border-white/30 bg-white/10 text-white", status !== "draft" && "border-white/40")}>{statusLabel(status, locale)}</Badge>
                {isMemberExistingReport && pendingReview ? <Badge variant="outline" className="border-white/30 bg-white/10 text-[10px] text-white md:hidden">{locale === "ar" ? "بانتظار المراجعة" : "Pending Review"}</Badge> : null}
              </div>
            </div>
          </div>
        </div>
        <CardContent className="grid grid-cols-3 gap-px bg-border p-0 md:grid-cols-2 lg:grid-cols-3">
          <HeaderCell label={copy.project} value={project.name} />
          <HeaderCell label={copy.stage} value={cleanStageName} />
          <HeaderCell label={copy.visitNo} value={formattedVisitNo} />
          <HeaderCell label={copy.reportNo} value={displayReportNo} />
          <HeaderCell label={copy.date} value={formatDate(reportDate, locale)} />
          <HeaderCell
            label={isDirectStageReport ? (locale === "ar" ? "المشرف" : "Supervisor") : (locale === "ar" ? "مقدم التقرير" : "Created By")}
            value={creatorPerson.name}
            person={creatorPerson}
          />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-3 py-2.5 dark:border-blue-800/60 dark:bg-blue-900/50 md:px-6 md:py-3.5">
          <CardTitle className="text-sm font-semibold text-blue-950 dark:text-blue-100 md:text-base">{copy.basic}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-3 md:gap-5 md:p-6">
          <div className="space-y-2">
            <Label htmlFor="report-title">{copy.title} <span className="text-destructive">*</span></Label>
            <Input id="report-title" value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} maxLength={250} disabled={isLocked} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-subject">{copy.subject}</Label>
            <Input id="report-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Inspection location, package, activity, or reference" disabled={isLocked} />
          </div>
        </CardContent>
      </Card>

      <CcRecipientsField
        candidates={ccCandidates}
        value={ccSelection}
        onChange={setCcSelection}
        disabled={isLocked || busy !== null}
      />

      {reportDefinition.templateReference ? <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100"><FileText className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">{copy.template}</p><p className="mt-0.5 text-xs opacity-80">{reportDefinition.templateReference}</p></div></div> : null}

      {reportDefinition.responseType !== "combined" && reportDefinition.responseType !== "inspection_checklist" ? (
        <Card className="gap-0 py-0">
          <CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6">
            <CardTitle className="text-base font-semibold text-blue-950 dark:text-blue-100">{subtermResponseTypeLabel(reportDefinition.responseType)}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            {reportDefinition.responseType === "text" ? (
              <div className="space-y-2">
                <Label htmlFor="configured-text-response">Written Response <span className="text-destructive">*</span></Label>
                <textarea id="configured-text-response" value={content.answer} onChange={(event) => setContent((current) => ({ ...current, answer: event.target.value.slice(0, 10000) }))} rows={7} disabled={isLocked} className="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" placeholder="Enter the required response" />
              </div>
            ) : reportDefinition.responseType === "yes_no" || reportDefinition.responseType === "pass_fail" ? (
              <div className="space-y-3">
                <Label>Result <span className="text-destructive">*</span></Label>
                <div className="flex flex-wrap gap-2">
                  {(reportDefinition.responseType === "yes_no" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] : [{ value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }, { value: "na", label: "N/A" }]).map((option) => (
                    <Button key={option.value} type="button" variant={content.selection === option.value ? "default" : "outline"} disabled={isLocked} onClick={() => setContent((current) => ({ ...current, selection: option.value }))}>{option.label}</Button>
                  ))}
                </div>
              </div>
            ) : reportDefinition.responseType === "measurement" ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.45fr)]">
                <div className="space-y-2"><Label htmlFor="measurement-value">Value <span className="text-destructive">*</span></Label><Input id="measurement-value" inputMode="decimal" value={content.measurementValue} onChange={(event) => setContent((current) => ({ ...current, measurementValue: event.target.value }))} placeholder="Enter numeric value" disabled={isLocked} /></div>
                <div className="space-y-2"><Label htmlFor="measurement-unit">Unit</Label><Input id="measurement-unit" value={content.measurementUnit} onChange={(event) => setContent((current) => ({ ...current, measurementUnit: event.target.value.slice(0, 100) }))} placeholder="mm, m², MPa…" disabled={isLocked} /></div>
              </div>
            ) : reportDefinition.responseType === "date" ? (
              <div className="max-w-sm space-y-2"><Label htmlFor="configured-date">Date <span className="text-destructive">*</span></Label><Input id="configured-date" type="date" value={content.dateValue} onChange={(event) => setContent((current) => ({ ...current, dateValue: event.target.value }))} disabled={isLocked} /></div>
            ) : (
              <p className="text-sm text-muted-foreground">{reportDefinition.responseType === "file_upload" ? "Upload at least one supporting file before submitting for review." : "Upload at least one evidence photo before submitting for review."}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:gap-5 xl:grid-cols-2">
        <AttachmentCard
          title={copy.evidence}
          description={copy.evidenceHint}
          icon={<ImagePlus className="size-5" />}
          actionLabel={copy.uploadImages}
          onAction={() => imageInputRef.current?.click()}
          disabled={isLocked || busy !== null || evidenceImages.length + pendingImages.length >= STAGE_EVIDENCE_MAX_IMAGES}
          hideActionOnMobile={isMemberReadOnlyReport}
        >
          <input ref={imageInputRef} type="file" accept={STAGE_EVIDENCE_ACCEPT} multiple className="hidden" onChange={(event) => { addImages(Array.from(event.target.files ?? [])); event.target.value = "" }} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
            {evidenceImages.map((attachment) => <EvidenceTile key={attachment.id} src={`/api/stage-evidence?path=${encodeURIComponent(attachment.storagePath)}`} name={attachment.originalFilename} onRemove={isLocked ? undefined : () => void removeExisting(attachment)} />)}
            {pendingImages.map((item) => <EvidenceTile key={item.id} src={item.previewUrl ?? ""} name={item.file.name} progress={item.progress} onRemove={() => removePending("image", item.id)} />)}
            {!evidenceImages.length && !pendingImages.length ? (
              isMemberReadOnlyReport ? (
                <>
                  <div className="col-span-full flex min-h-12 items-center justify-center rounded-lg border border-dashed px-2 text-center text-[11px] text-muted-foreground md:hidden">
                    {locale === "ar" ? "لا توجد صور مرفقة." : "No images attached."}
                  </div>
                  <div className="col-span-full hidden md:block"><EmptyAttachment text={copy.uploadImages} onClick={() => imageInputRef.current?.click()} /></div>
                </>
              ) : <EmptyAttachment text={copy.uploadImages} onClick={() => imageInputRef.current?.click()} />
            ) : null}
          </div>
        </AttachmentCard>

        <AttachmentCard
          title={copy.documents}
          description={copy.documentHint}
          icon={<FileText className="size-5" />}
          actionLabel={copy.addDocuments}
          onAction={() => documentInputRef.current?.click()}
          disabled={isLocked || busy !== null || documentAttachments.length + pendingDocuments.length >= STAGE_DOCUMENT_MAX_FILES}
          hideActionOnMobile={isMemberReadOnlyReport}
        >
          <input ref={documentInputRef} type="file" accept={STAGE_DOCUMENT_ACCEPT} multiple className="hidden" onChange={(event) => { addDocuments(Array.from(event.target.files ?? [])); event.target.value = "" }} />
          <div className="space-y-2">
            {documentAttachments.map((attachment) => <DocumentRow key={attachment.id} name={attachment.originalFilename} href={`/api/stage-evidence?path=${encodeURIComponent(attachment.storagePath)}&download=1&filename=${encodeURIComponent(attachment.originalFilename)}`} onRemove={isLocked ? undefined : () => void removeExisting(attachment)} />)}
            {pendingDocuments.map((item) => <DocumentRow key={item.id} name={item.file.name} progress={item.progress} onRemove={() => removePending("document", item.id)} />)}
            {!documentAttachments.length && !pendingDocuments.length ? (
              isMemberReadOnlyReport ? (
                <>
                  <div className="flex min-h-12 items-center justify-center rounded-lg border border-dashed px-2 text-center text-[11px] text-muted-foreground md:hidden">
                    {locale === "ar" ? "لا توجد مستندات مرفقة." : "No documents attached."}
                  </div>
                  <div className="hidden md:block"><EmptyAttachment text={copy.addDocuments} compact onClick={() => documentInputRef.current?.click()} /></div>
                </>
              ) : <EmptyAttachment text={copy.addDocuments} compact onClick={() => documentInputRef.current?.click()} />
            ) : null}
          </div>
        </AttachmentCard>
      </div>

      {reportDefinition.responseType === "combined" || reportDefinition.responseType === "inspection_checklist" ? (
        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between border-b border-blue-200/80 bg-blue-100/70 px-3 py-2.5 dark:border-blue-800/60 dark:bg-blue-900/50 md:px-6 md:py-3.5">
            <CardTitle className="text-sm font-semibold text-blue-950 dark:text-blue-100 md:text-base">{copy.checklist}</CardTitle>
            <Button type="button" variant="outline" size="sm" disabled={isLocked} className={cn(isMemberReadOnlyReport && "hidden md:inline-flex")} onClick={() => setContent((current) => ({ ...current, checklist: [...current.checklist, { id: crypto.randomUUID(), label: "", checked: false, result: "" }] }))}><Plus className="size-4" />{copy.addItem}</Button>
          </div>
          <CardContent className="space-y-1.5 p-2 md:space-y-3 md:p-6">
            {content.checklist.length ? (
              <>
                <div className={cn("grid items-center gap-1.5 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden", reportDefinition.responseType === "inspection_checklist" ? "grid-cols-[64px_minmax(0,1fr)_58px]" : "grid-cols-[30px_minmax(0,1fr)_58px]")}>
                  <span>{locale === "ar" ? "الحالة" : "Status"}</span>
                  <span>{locale === "ar" ? "بند الفحص" : "Inspection Item"}</span>
                  <span className="text-center">{locale === "ar" ? "تعليق" : "Comment"}</span>
                </div>
                {content.checklist.map((item, index) => (
                  <div key={item.id} className="contents">
                    <div className="rounded-lg border bg-muted/20 p-1.5 md:hidden">
                      <div className={cn("grid items-center gap-1.5", reportDefinition.responseType === "inspection_checklist" ? "grid-cols-[64px_minmax(0,1fr)_58px]" : "grid-cols-[30px_minmax(0,1fr)_58px]")}>
                        {reportDefinition.responseType === "inspection_checklist" ? (
                          <Select value={item.result || "pending"} onValueChange={(value) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, result: value === "pending" ? "" : (value as "pass" | "fail" | "na"), checked: value === "pass" } : row) }))} disabled={isLocked}>
                            <SelectTrigger className="h-8 min-w-0 px-1 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem><SelectItem value="na">N/A</SelectItem></SelectContent>
                          </Select>
                        ) : (() => {
                          const itemResult = item.result || (item.checked ? "pass" : "")
                          let btnClasses = "border-slate-300 bg-slate-100/90 text-slate-400 hover:bg-slate-200/90 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                          let icon = <Check className="size-3.5" />
                          let statusTooltip = "Empty / Click to change state"
                          if (itemResult === "pass") { btnClasses = "border-emerald-600 bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700 dark:border-emerald-600 dark:bg-emerald-600"; icon = <Check className="size-3.5 stroke-[2.5]" />; statusTooltip = "Done / Passed" }
                          else if (itemResult === "fail") { btnClasses = "border-rose-600 bg-rose-600 text-white shadow-2xs hover:bg-rose-700 dark:border-rose-600 dark:bg-rose-600"; icon = <X className="size-3.5 stroke-[2.5]" />; statusTooltip = "Not Done / Failed" }
                          else if (itemResult === "in_progress") { btnClasses = "border-amber-500 bg-amber-500 text-white shadow-2xs hover:bg-amber-600 dark:border-amber-500 dark:bg-amber-500"; icon = <Hourglass className="size-3" />; statusTooltip = "In Progress" }
                          return <button type="button" disabled={isLocked} onClick={() => {
                            let nextResult: ChecklistResult = ""; let nextChecked = false
                            if (!itemResult) { nextResult = "pass"; nextChecked = true }
                            else if (itemResult === "pass") nextResult = "fail"
                            else if (itemResult === "fail") nextResult = "in_progress"
                            setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, result: nextResult, checked: nextChecked } : row) }))
                          }} className={cn("flex size-7 shrink-0 items-center justify-center rounded-md border transition-all duration-150", btnClasses)} title={statusTooltip} aria-label={`Mark checklist item ${index + 1}: ${statusTooltip}`}>{icon}</button>
                        })()}
                        <Input className="h-8 min-w-0 px-2 text-xs leading-tight" value={item.label} disabled={isLocked} onChange={(event) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, label: event.target.value } : row) }))} placeholder={`Checklist item ${index + 1}`} />
                        <div className="flex items-center justify-end gap-0.5">
                          <button type="button" disabled={isLocked && !item.notes?.trim()} aria-label={`${isLocked ? "View" : "Edit"} comment for checklist item ${index + 1}`} aria-expanded={expandedChecklistCommentId === item.id} onClick={() => setExpandedChecklistCommentId((current) => current === item.id ? null : item.id)} className={cn("relative flex size-7 items-center justify-center rounded-md border text-muted-foreground transition-colors", item.notes?.trim() ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted", isLocked && !item.notes?.trim() && "opacity-40")}>
                            <MessageSquare className="size-3.5" />
                            {item.notes?.trim() ? <span className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-primary" aria-hidden="true" /> : null}
                          </button>
                          <Button type="button" variant="ghost" size="icon-xs" disabled={isLocked} className={cn(isMemberReadOnlyReport && "hidden md:inline-flex")} onClick={() => { setExpandedChecklistCommentId((current) => current === item.id ? null : current); setContent((current) => ({ ...current, checklist: current.checklist.filter((row) => row.id !== item.id) })) }} aria-label={copy.remove}><Trash2 className="size-3.5" /></Button>
                        </div>
                      </div>
                      {expandedChecklistCommentId === item.id ? (
                        <div className="mt-1.5 border-t pt-1.5">
                          {isLocked ? (
                            <p className="rounded-md bg-background px-2 py-1.5 text-xs leading-relaxed text-foreground">{item.notes?.trim() || (locale === "ar" ? "لا يوجد تعليق." : "No comment.")}</p>
                          ) : (
                            <Input className="h-8 px-2 text-xs" value={item.notes ?? ""} onChange={(event) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, notes: event.target.value } : row) }))} placeholder="Comment / reference" />
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className={cn("hidden gap-2 rounded-xl border bg-muted/20 p-3 md:grid md:items-center", reportDefinition.responseType === "inspection_checklist" ? "sm:grid-cols-[minmax(0,1fr)_150px_minmax(180px,0.55fr)_auto]" : "sm:grid-cols-[auto_minmax(0,1fr)_minmax(180px,0.55fr)_auto]")}>
                      {reportDefinition.responseType === "inspection_checklist" ? (
                        <>
                          <Input value={item.label} disabled={isLocked} onChange={(event) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, label: event.target.value } : row) }))} placeholder={`Check item ${index + 1}`} />
                          <Select value={item.result || "pending"} onValueChange={(value) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, result: value === "pending" ? "" : (value as "pass" | "fail" | "na"), checked: value === "pass" } : row) }))} disabled={isLocked}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="pending">Select result</SelectItem><SelectItem value="pass">Pass</SelectItem><SelectItem value="fail">Fail</SelectItem><SelectItem value="na">N/A</SelectItem></SelectContent>
                          </Select>
                        </>
                      ) : (
                        <>
                          {(() => {
                            const itemResult = item.result || (item.checked ? "pass" : "")
                            let btnClasses = "border-slate-300 bg-slate-100/90 text-slate-400 hover:bg-slate-200/90 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
                            let icon = <Check className="size-3.5" />
                            let statusTooltip = "Empty / Click to change state"
                            if (itemResult === "pass") { btnClasses = "border-emerald-600 bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700 dark:border-emerald-600 dark:bg-emerald-600"; icon = <Check className="size-4 stroke-[2.5]" />; statusTooltip = "Done / Passed" }
                            else if (itemResult === "fail") { btnClasses = "border-rose-600 bg-rose-600 text-white shadow-2xs hover:bg-rose-700 dark:border-rose-600 dark:bg-rose-600"; icon = <X className="size-4 stroke-[2.5]" />; statusTooltip = "Not Done / Failed" }
                            else if (itemResult === "in_progress") { btnClasses = "border-amber-500 bg-amber-500 text-white shadow-2xs hover:bg-amber-600 dark:border-amber-500 dark:bg-amber-500"; icon = <Hourglass className="size-3.5" />; statusTooltip = "In Progress" }
                            return <button type="button" disabled={isLocked} onClick={() => {
                              let nextResult: ChecklistResult = ""; let nextChecked = false
                              if (!itemResult) { nextResult = "pass"; nextChecked = true }
                              else if (itemResult === "pass") nextResult = "fail"
                              else if (itemResult === "fail") nextResult = "in_progress"
                              setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, result: nextResult, checked: nextChecked } : row) }))
                            }} className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg border transition-all duration-150", btnClasses)} title={statusTooltip} aria-label={`Mark checklist item ${index + 1}: ${statusTooltip}`}>{icon}</button>
                          })()}
                          <Input value={item.label} disabled={isLocked} onChange={(event) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, label: event.target.value } : row) }))} placeholder={`Checklist item ${index + 1}`} />
                        </>
                      )}
                      <Input value={item.notes ?? ""} disabled={isLocked} onChange={(event) => setContent((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, notes: event.target.value } : row) }))} placeholder="Comment / reference" />
                      <Button type="button" variant="ghost" size="icon" disabled={isLocked} onClick={() => setContent((current) => ({ ...current, checklist: current.checklist.filter((row) => row.id !== item.id) }))} aria-label={copy.remove}><Trash2 className="size-4" /></Button>
                    </div>
                  </div>
                ))}
              </>
            ) : <p className="py-4 text-center text-sm text-muted-foreground">No checklist items. Add items for this inspection.</p>}
          </CardContent>
        </Card>
      ) : null}

      {reportDefinition.responseType === "combined" ? SECTION_META.map((section) => (
        <RichSectionEditor key={section.key} title={locale === "ar" ? section.titleAr : section.title} description={section.description} value={content[section.key]} onChange={(value) => updateSection(section.key, value)} allowTable={section.key === "feedback"} disabled={isLocked} uploadInlineImage={uploadInlineImage} />
      )) : reportDefinition.responseType === "inspection_checklist" ? (
        <RichSectionEditor title="Overall Notes" description="Add overall inspection observations or follow-up notes." value={content.feedback} onChange={(value) => updateSection("feedback", value)} allowTable={false} disabled={isLocked} uploadInlineImage={uploadInlineImage} />
      ) : reportDefinition.responseType === "text" ? null : (
        <RichSectionEditor title="Comments / Notes" description="Add context, observations, or supporting notes." value={content.feedback} onChange={(value) => updateSection("feedback", value)} allowTable={false} disabled={isLocked} uploadInlineImage={uploadInlineImage} />
      )}

      {responseId && (status === "submitted" || status === "under_review" || status === "rejected" || status === "approved") ? (
        isMember
          ? approvalHistory.length > 0
            ? <MemberApprovalHistoryPanel approvals={approvalHistory} copy={copy} locale={locale} />
            : null
          : <ApprovalPanel canReview={canReview} status={status} comments={reviewComments} onComments={setReviewComments} onDecision={decide} busy={busy} approvals={approvalHistory} copy={copy} locale={locale} />
      ) : null}

      {!workflowActive ? <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"><AlertCircle className="mt-0.5 size-4 shrink-0" />This workflow item is disabled for the project. Existing review history remains available, but new employee work is blocked.</div> : null}

      {((canRenderReviewerActions && pendingReview) || (workflowActive && isEditable)) ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur md:start-64 md:z-30 md:px-8 md:py-3">
          <div className="mx-auto flex max-w-7xl flex-col-reverse gap-1.5 md:flex-row md:items-center md:justify-between md:gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {error ? (
                <div role="alert" className="flex max-w-xl items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
                  <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span className="truncate">{error}</span>
                </div>
              ) : success ? (
                <div role="status" className="flex max-w-xl items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">{success}</span>
                </div>
              ) : null}
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-1.5 md:w-auto md:gap-3 shrink-0">
              {canRenderReviewerActions && pendingReview ? (
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
                <div className="grid w-full grid-cols-3 gap-1.5 md:flex md:w-auto md:items-center md:gap-3">
                  <Button variant="outline" size="lg" className="min-w-0 px-1.5 text-[10px] md:px-2.5 md:text-sm" disabled={busy !== null} onClick={() => void save("draft")}>{busy === "draft" ? <Loader2 className="size-3.5 animate-spin md:size-4" /> : <Save className="size-3.5 md:size-4" />}<span className="md:hidden">Draft</span><span className="hidden md:inline">{copy.saveDraft}</span></Button>
                  <Button variant="outline" size="lg" className="min-w-0 px-1.5 text-[10px] md:px-2.5 md:text-sm" disabled={busy !== null} onClick={() => void save("progress")}>{busy === "progress" ? <Loader2 className="size-3.5 animate-spin md:size-4" /> : <ClipboardCheck className="size-3.5 md:size-4" />}<span className="md:hidden">In Progress</span><span className="hidden md:inline">{copy.saveProgress}</span></Button>
                  <Button size="lg" className="min-w-0 px-1.5 text-[10px] md:px-2.5 md:text-sm" disabled={busy !== null} onClick={() => void save("submit")}>{busy === "submit" ? <Loader2 className="size-3.5 animate-spin md:size-4" /> : <Send className="size-3.5 md:size-4" />}<span className="md:hidden">Submit</span><span className="hidden md:inline">{copy.submit}</span></Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function HeaderCell({ label, value, person }: { label: string; value: string; person?: ProjectStagePerson | null }) {
  return <div className="min-w-0 bg-card px-2 py-2.5 md:min-h-20 md:px-5 md:py-4"><p className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground md:text-[11px] md:tracking-wider">{label}</p>{person ? <div className="mt-1 flex min-w-0 items-center gap-1.5 md:mt-2 md:gap-2"><span className="hidden md:inline-flex"><Avatar size="sm">{person.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(person.avatarUrl)} alt="" /> : null}<AvatarFallback>{initials(person.name)}</AvatarFallback></Avatar></span><span className="min-w-0 break-words text-[11px] font-medium leading-tight md:truncate md:text-base md:leading-normal">{value}</span></div> : <p className="mt-1 break-words text-[11px] font-medium leading-tight [overflow-wrap:anywhere] md:mt-2 md:break-normal md:text-base md:leading-normal md:[overflow-wrap:normal]">{value}</p>}</div>
}

function AttachmentCard({ title, description, icon, actionLabel, onAction, disabled, hideActionOnMobile = false, children }: { title: string; description: string; icon: ReactNode; actionLabel: string; onAction: () => void; disabled: boolean; hideActionOnMobile?: boolean; children: ReactNode }) {
  return (
    <Card className="min-w-0 gap-0 py-0">
      <div className="flex items-center justify-between gap-1.5 border-b border-blue-200/80 bg-blue-100/70 px-2 py-2 dark:border-blue-800/60 dark:bg-blue-900/50 md:gap-4 md:px-6 md:py-3.5">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-1 text-[11px] font-semibold leading-tight text-blue-950 dark:text-blue-100 md:gap-2 md:text-base">
            <span className="hidden text-primary md:inline-flex">{icon}</span>
            {title}
          </CardTitle>
          <p className="mt-0.5 hidden text-xs text-muted-foreground md:block">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onAction}
          disabled={disabled}
          title={actionLabel}
          aria-label={actionLabel}
          className={cn("size-8 shrink-0 rounded-lg p-0 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary md:size-11 md:rounded-xl", hideActionOnMobile && "hidden md:inline-flex")}
        >
          <UploadCloud className="size-4 text-primary md:size-5" />
        </Button>
      </div>
      <CardContent className="p-2 md:p-5">{children}</CardContent>
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
        compact ? "min-h-14 md:min-h-20" : "col-span-full min-h-20 md:min-h-32",
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
  return <div className="flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 md:gap-3 md:rounded-xl md:px-3 md:py-2.5">{href ? <a href={href} className="flex min-w-0 flex-1 items-center gap-3 hover:text-primary">{body}</a> : body}{onRemove ? <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${name}`}><Trash2 className="size-4" /></Button> : null}</div>
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
  const [mobileExpanded, setMobileExpanded] = useState(false)

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

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="relative">
        <CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-3 py-2.5 pe-10 dark:border-blue-800/60 dark:bg-blue-900/50 md:px-6 md:py-3.5 md:pe-6">
          <CardTitle className="text-sm font-semibold text-blue-950 dark:text-blue-100 md:text-base">{title}</CardTitle>
          <p className="hidden text-xs text-muted-foreground md:block">{description}</p>
        </CardHeader>
        <button
          type="button"
          className="absolute end-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-blue-950/70 transition-colors hover:bg-blue-200/70 md:hidden"
          onClick={() => setMobileExpanded((expanded) => !expanded)}
          aria-expanded={mobileExpanded}
          aria-label={`${mobileExpanded ? "Collapse" : "Expand"} ${title}`}
        >
          <ChevronDown className={cn("size-4 transition-transform", !mobileExpanded && "-rotate-90")} />
        </button>
      </div>
      <div className={cn(!mobileExpanded && "hidden md:block")}>
        <div className={cn("flex flex-wrap items-center gap-0.5 border-b bg-muted/35 px-2 py-1.5 md:gap-1 md:px-3 md:py-2", disabled && "hidden md:flex")}>
          <EditorButton label="Bold" onClick={() => command("bold")} disabled={disabled}><Bold /></EditorButton>
          <EditorButton label="Italic" onClick={() => command("italic")} disabled={disabled}><Italic /></EditorButton>
          <EditorButton label="Underline" onClick={() => command("underline")} disabled={disabled}><Underline /></EditorButton>
          <span className="mx-0.5 h-5 w-px bg-border md:mx-1" />
          <EditorButton label="Bulleted list" onClick={() => command("insertUnorderedList")} disabled={disabled}><List /></EditorButton>
          <EditorButton label="Numbered list" onClick={() => command("insertOrderedList")} disabled={disabled}><ListOrdered /></EditorButton>
          <EditorButton label="Link" onClick={addLink} disabled={disabled}><Link2 /></EditorButton>
          {allowTable ? <EditorButton label="Insert table" onClick={addTable} disabled={disabled}><Table2 /></EditorButton> : null}
          <EditorButton label="Inline image" onClick={() => { saveSelection(); imageInputRef.current?.click() }} disabled={disabled || uploading}>{uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}</EditorButton>
          <span className="mx-0.5 h-5 w-px bg-border md:mx-1" />
          <EditorButton label="Undo" onClick={() => command("undo")} disabled={disabled}><Undo2 /></EditorButton>
          <EditorButton label="Redo" onClick={() => command("redo")} disabled={disabled}><Redo2 /></EditorButton>
          <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={imageSelected} />
        </div>
        {uploadError ? <div className="border-b bg-red-50 px-4 py-2 text-xs text-red-700">{uploadError}</div> : null}
        <div ref={editorRef} contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" onFocus={saveSelection} onKeyUp={saveSelection} onMouseUp={saveSelection} onInput={() => onChange(editorRef.current?.innerHTML ?? "")} className={cn("inspection-editor bg-background px-3 py-3 text-sm outline-none md:min-h-56 md:px-7 md:py-5", disabled ? "min-h-0" : "min-h-36")} />
      </div>
    </Card>
  )
}

function EditorButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onMouseDown={(event) => { event.preventDefault(); onClick() }} className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40 [&_svg]:size-4">{children}</button>
}

function ApprovalPanel({ canReview, status, comments, onComments, onDecision, busy, approvals, copy, locale }: { canReview: boolean; status: ResponseStatus; comments: string; onComments: (value: string) => void; onDecision: (decision: "approved" | "rejected") => void; busy: string | null; approvals: ProjectStageApproval[]; copy: (typeof COPY)["en"] | (typeof COPY)["ar"]; locale: "en" | "ar" }) {
  return <Card className="gap-0 py-0"><CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6"><CardTitle className="flex items-center gap-2 text-base font-semibold text-blue-950 dark:text-blue-100"><ShieldCheck className="size-5 text-primary" />{copy.review}</CardTitle></CardHeader><CardContent className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">{canReview && (status === "submitted" || status === "under_review") ? <div className="space-y-3"><Label htmlFor="review-comments">{copy.reviewComments}</Label><textarea id="review-comments" value={comments} onChange={(event) => onComments(event.target.value)} rows={5} className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20" placeholder="Record acceptance notes, required corrections, or reasons for rejection." /><div className="flex flex-wrap justify-end gap-2"><Button variant="destructive" disabled={busy !== null} onClick={() => onDecision("rejected")}>{busy === "reject" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}{copy.reject}</Button><Button disabled={busy !== null} onClick={() => onDecision("approved")}>{busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{copy.approve}</Button></div></div> : <div className="rounded-xl border bg-muted/20 p-4"><p className="text-sm font-semibold">{statusLabel(status, locale)}</p><p className="mt-1 text-xs text-muted-foreground">{status === "approved" ? "This report has been approved." : "This report is awaiting an authorized reviewer."}</p></div>}<div><h3 className="mb-3 text-sm font-semibold">{copy.history}</h3>{approvals.length ? <div className="space-y-3">{approvals.map((approval) => <div key={approval.id} className="rounded-xl border p-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Avatar size="sm">{approval.reviewer.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(approval.reviewer.avatarUrl)} alt="" /> : null}<AvatarFallback>{initials(approval.reviewer.name)}</AvatarFallback></Avatar><div><p className="text-sm font-medium">{approval.reviewer.name}</p><p className="text-xs text-muted-foreground">{formatDate(approval.decidedAt, locale)}</p></div></div><Badge variant="outline" className={statusTone(approval.decision)}>{statusLabel(approval.decision, locale)}</Badge></div>{approval.comments ? <p className="mt-3 rounded-lg bg-muted/35 p-2 text-xs">{approval.comments}</p> : null}</div>)}</div> : <p className="text-sm text-muted-foreground">{copy.noHistory}</p>}</div></CardContent></Card>
}

function MemberApprovalHistoryPanel({ approvals, copy, locale }: { approvals: ProjectStageApproval[]; copy: (typeof COPY)["en"] | (typeof COPY)["ar"]; locale: "en" | "ar" }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-3.5 sm:px-6">
        <CardTitle className="text-base font-semibold">{copy.history}</CardTitle>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        <div className="space-y-3">
          {approvals.map((approval) => (
            <div key={approval.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Avatar size="sm">
                    {approval.reviewer.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(approval.reviewer.avatarUrl)} alt="" /> : null}
                    <AvatarFallback>{initials(approval.reviewer.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{approval.reviewer.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(approval.decidedAt, locale)}</p>
                  </div>
                </div>
                <Badge variant="outline" className={statusTone(approval.decision)}>{statusLabel(approval.decision, locale)}</Badge>
              </div>
              {approval.comments ? <p className="mt-3 rounded-lg bg-muted/35 p-2 text-xs">{approval.comments}</p> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
