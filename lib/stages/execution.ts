export const PROJECT_STAGE_TERM_STATUSES = [
  "not_started",
  "draft",
  "in_progress",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "completed",
] as const

export type ProjectStageTermStatus = (typeof PROJECT_STAGE_TERM_STATUSES)[number]

export const RESPONSE_STATUSES = [
  "draft",
  "in_progress",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "completed",
] as const

export type ResponseStatus = (typeof RESPONSE_STATUSES)[number]

export const REPORT_TYPES = [
  { value: "inspection_report", label: "Inspection Report", labelAr: "تقرير تفتيش" },
  { value: "site_visit_report", label: "Site Visit Report", labelAr: "تقرير زيارة موقع" },
  { value: "progress_report", label: "Progress Report", labelAr: "تقرير تقدم" },
  { value: "test_report", label: "Test Report", labelAr: "تقرير اختبار" },
  { value: "quality_report", label: "Quality Report", labelAr: "تقرير جودة" },
  { value: "safety_report", label: "Safety Report", labelAr: "تقرير سلامة" },
  { value: "commissioning_report", label: "Commissioning Report", labelAr: "تقرير تشغيل" },
  { value: "closeout_report", label: "Closeout Report", labelAr: "تقرير إغلاق" },
] as const

export type ReportTypeValue = (typeof REPORT_TYPES)[number]["value"]

export function reportTypeLabel(value: string, locale: "en" | "ar" = "en") {
  const definition = REPORT_TYPES.find((item) => item.value === value)
  if (definition) return locale === "ar" ? definition.labelAr : definition.label

  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export const SUBTERM_RESPONSE_TYPES = [
  { value: "combined", label: "Combined Response" },
  { value: "text", label: "Text Response" },
  { value: "inspection_checklist", label: "Inspection Checklist" },
  { value: "yes_no", label: "Yes / No" },
  { value: "pass_fail", label: "Pass / Fail" },
  { value: "measurement", label: "Number / Measurement" },
  { value: "date", label: "Date" },
  { value: "file_upload", label: "File Upload" },
  { value: "photo_evidence", label: "Photo Evidence" },
] as const

export type SubtermResponseType = (typeof SUBTERM_RESPONSE_TYPES)[number]["value"]

export function isSubtermResponseType(value: unknown): value is SubtermResponseType {
  return typeof value === "string" && SUBTERM_RESPONSE_TYPES.some((item) => item.value === value)
}

export function subtermResponseTypeLabel(value: SubtermResponseType) {
  return SUBTERM_RESPONSE_TYPES.find((item) => item.value === value)?.label ?? "Combined Response"
}

export const STAGE_EVIDENCE_BUCKET = "project-stage-evidence"
const configuredEvidenceLimit = Number(process.env.NEXT_PUBLIC_STAGE_EVIDENCE_MAX_IMAGES || 8)
export const STAGE_EVIDENCE_MAX_IMAGES = Number.isFinite(configuredEvidenceLimit)
  ? Math.min(20, Math.max(1, Math.floor(configuredEvidenceLimit)))
  : 8
export const STAGE_EVIDENCE_MAX_FILE_BYTES = 15 * 1024 * 1024
export const STAGE_EVIDENCE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"
export const STAGE_DOCUMENT_MAX_FILES = 10
export const STAGE_DOCUMENT_MAX_FILE_BYTES = 50 * 1024 * 1024
export const STAGE_DOCUMENT_ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const
export const STAGE_DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx"
const STAGE_DOCUMENT_MIME_BY_EXTENSION: Record<string, (typeof STAGE_DOCUMENT_ACCEPTED_MIME_TYPES)[number]> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

export type ReportSectionKey =
  | "feedback"
  | "observation"
  | "findings"
  | "recommendations"
  | "correctiveActions"

export type ChecklistResult = "" | "pass" | "fail" | "na" | "in_progress"

export type ChecklistItem = {
  id: string
  label: string
  checked: boolean
  result?: ChecklistResult
  notes?: string
}

export type TermResponseContent = Record<ReportSectionKey, string> & {
  checklist: ChecklistItem[]
  answer: string
  selection: string
  measurementValue: string
  measurementUnit: string
  dateValue: string
}

export const EMPTY_TERM_RESPONSE_CONTENT: TermResponseContent = {
  feedback: "",
  observation: "",
  findings: "",
  recommendations: "",
  correctiveActions: "",
  checklist: [],
  answer: "",
  selection: "",
  measurementValue: "",
  measurementUnit: "",
  dateValue: "",
}

export function sanitizeReportHtml(value: unknown) {
  return (typeof value === "string" ? value : "")
    .slice(0, 250_000)
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link|base)[\s\S]*?>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link|base)\b[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:(["'])[\s\S]*?\1|[^\s>]+)/gi, "")
    .replace(/(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi, "")
}

export function isResponseStatus(value: string): value is ResponseStatus {
  return (RESPONSE_STATUSES as readonly string[]).includes(value)
}

export function isReportType(value: string): value is ReportTypeValue {
  return REPORT_TYPES.some((item) => item.value === value)
}

export function statusLabel(status: ProjectStageTermStatus | ResponseStatus | string | null | undefined, locale: "en" | "ar" = "en") {
  if (!status) return "—"
  const labels: Record<string, readonly [string, string]> = {
    not_started: ["Not Started", "لم يبدأ"],
    draft: ["Draft", "مسودة"],
    in_progress: ["In Progress", "قيد التنفيذ"],
    submitted: ["Submitted", "تم الإرسال"],
    under_review: ["Under Review", "قيد المراجعة"],
    approved: ["Approved", "معتمد"],
    rejected: ["Rejected", "مرفوض"],
    completed: ["Completed", "مكتمل"],
  }
  const found = labels[status]
  if (found) return found[locale === "ar" ? 1 : 0]
  return String(status).replace(/[_-]+/g, " ")
}

export function statusTone(status: ProjectStageTermStatus | ResponseStatus) {
  switch (status) {
    case "approved":
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
    case "submitted":
    case "under_review":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
    case "rejected":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    case "in_progress":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
    case "draft":
      return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300"
    default:
      return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
  }
}

export function sanitizeEvidenceFileName(value: string) {
  const cleaned = value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-")
  return cleaned.replace(/^[-.]+|[-.]+$/g, "") || "evidence"
}

export function validateEvidenceImage(file: File): string | null {
  if (!STAGE_EVIDENCE_ACCEPT.split(",").includes(file.type)) return `${file.name} is not a supported image type.`
  if (file.size > STAGE_EVIDENCE_MAX_FILE_BYTES) return `${file.name} exceeds the 15 MB limit.`
  return null
}

export function resolveStageDocumentMimeType(file: Pick<File, "name" | "type">) {
  const allowed = STAGE_DOCUMENT_ACCEPTED_MIME_TYPES as readonly string[]
  if (allowed.includes(file.type)) return file.type
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ""
  return STAGE_DOCUMENT_MIME_BY_EXTENSION[extension] ?? null
}

export function validateStageDocument(file: File): string | null {
  if (!resolveStageDocumentMimeType(file)) return `${file.name} is not a supported document type.`
  if (file.size > STAGE_DOCUMENT_MAX_FILE_BYTES) return `${file.name} exceeds the 50 MB limit.`
  return null
}

const DEFAULT_STAGE_CHECKLIST_LIBRARY: Record<string, string[]> = {
  "earth work excavation": [
    "Check for Setting out and Levels/Set backs as per Excavation Scheme plan.",
    "Check for Layout of Excavation with reference to grids and keeping allowance from face of substructure.",
    "Ensure protection of existing services /Neighbors Plot boundary",
    "Ensure proper access for Trucks / Dumpers and other vehicles.",
    "Depth of the Excavation",
    "PCC Bottom level",
    "Verify the foundation data with respect to geotechnical report.",
    "Check for soil dressing, loose earth removed and area is leveled.",
    "Check for the soil preserved at site for backfilling and dispose soil not suitable for filling.",
    "All area well illuminated and ensure proper barricading the excavated area.",
  ],
  pcc: [
    "Check for location / Bottom level of footing",
    "The surface compaction completed",
    "FDT report submitted for review",
    "Check for formwork including form oil applied and laid to the correct dimensions including line",
    "Check for concrete top level marked at required places",
    "1000-guage Polythene sheet providedetc.",
  ],
  footing: [
    "The setback of the building as per the drawing",
    "Front side of the building",
    "Left side of the building",
    "Right side of the building",
    "Rear side of the building",
    "Nearest Road level/Plinth level/Interlock level marking at the site",
    "Structural grid line and architectural grid lines are provided as per the drawing",
    "Footing formwork including form oil applied and laid to the correct dimensions including line, level and plumb checked.",
    "Supporting of the formwork",
    "All columns sizes and orientation",
    "Sizes (length and Diameter) of re-bar of the footings",
    "Spacing of re-bar as per the drawing",
    "Direction and Alignment of the re-bar",
    "Right angle of the footing & Column",
    "Cover of concrete around reinforcement steel maintained as per requirement",
    "Separator (Chair Bar) is provided properly between top and bottom re-bar.",
    "Development length of the re-bar of the footing as per requirement",
    "Sizes (length and Diameter) of re-bar of the Columns",
    "Reinforcement bars are free from rust,mill scales, cleaned concrete droppings and any other such impurities",
    "Sizes/Spacings of the stirrups of re-bar of the Columns",
  ],
}

export function getFallbackStageChecklist(stageName: string): Array<{ id: string; reportName: string }> {
  if (!stageName) return []
  const clean = stageName.trim().toLowerCase()

  let key = ""
  if (clean.includes("excavation") || clean.includes("earth work")) key = "earth work excavation"
  else if (clean.includes("pcc")) key = "pcc"
  else if (clean.includes("footing")) key = "footing"

  const items = key ? DEFAULT_STAGE_CHECKLIST_LIBRARY[key] : null
  if (!items) return []

  return items.map((reportName, idx) => ({
    id: `fallback-${key}-${idx + 1}`,
    reportName,
  }))
}

