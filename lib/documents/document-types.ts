export type DocumentTypeGroup =
  | "inspection"
  | "quality"
  | "safety"
  | "report"
  | "drawing"
  | "submittal"
  | "commercial"
  | "communication"
  | "management"
  | "other"

export type DocumentTypeIconKey =
  | "inspection"
  | "quality"
  | "safety"
  | "report"
  | "drawing"
  | "submittal"
  | "commercial"
  | "communication"
  | "document"

const badgeStyles = {
  inspection: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  quality: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  safety: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  report: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  drawing: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  submittal: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  commercial: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  communication: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  management: "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
  other: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
} as const

export const DOCUMENT_TYPES = [
  { value: "ncr", label: "NCR — Non-Conformance Report", shortLabel: "NCR", group: "quality", icon: "quality" },
  { value: "ipc", label: "IPC — Inspection and Test Plan / Inspection Process Control", shortLabel: "IPC", group: "inspection", icon: "inspection" },
  { value: "inspection_report", label: "Inspection Report", shortLabel: "Inspection Report", group: "inspection", icon: "inspection" },
  { value: "site_inspection_request", label: "Site Inspection Request", shortLabel: "Site Inspection", group: "inspection", icon: "inspection" },
  { value: "material_inspection_request", label: "Material Inspection Request", shortLabel: "Material Inspection", group: "inspection", icon: "inspection" },
  { value: "request_for_inspection", label: "Request for Inspection (RFI)", shortLabel: "RFI · Inspection", group: "inspection", icon: "inspection" },
  { value: "request_for_information", label: "Request for Information (RFI)", shortLabel: "RFI · Information", group: "communication", icon: "communication" },
  { value: "method_statement", label: "Method Statement", shortLabel: "Method Statement", group: "management", icon: "document" },
  { value: "risk_assessment", label: "Risk Assessment", shortLabel: "Risk Assessment", group: "safety", icon: "safety" },
  { value: "job_safety_analysis", label: "Job Safety Analysis (JSA)", shortLabel: "JSA", group: "safety", icon: "safety" },
  { value: "permit_to_work", label: "Permit to Work", shortLabel: "Permit to Work", group: "safety", icon: "safety" },
  { value: "toolbox_talk", label: "Toolbox Talk", shortLabel: "Toolbox Talk", group: "safety", icon: "safety" },
  { value: "daily_report", label: "Daily Report", shortLabel: "Daily Report", group: "report", icon: "report" },
  { value: "weekly_report", label: "Weekly Report", shortLabel: "Weekly Report", group: "report", icon: "report" },
  { value: "monthly_report", label: "Monthly Report", shortLabel: "Monthly Report", group: "report", icon: "report" },
  { value: "progress_report", label: "Progress Report", shortLabel: "Progress Report", group: "report", icon: "report" },
  { value: "incident_report", label: "Incident Report", shortLabel: "Incident Report", group: "safety", icon: "safety" },
  { value: "safety_observation", label: "Safety Observation", shortLabel: "Safety Observation", group: "safety", icon: "safety" },
  { value: "quality_observation", label: "Quality Observation", shortLabel: "Quality Observation", group: "quality", icon: "quality" },
  { value: "corrective_action_report", label: "Corrective Action Report", shortLabel: "Corrective Action", group: "quality", icon: "quality" },
  { value: "preventive_action_report", label: "Preventive Action Report", shortLabel: "Preventive Action", group: "quality", icon: "quality" },
  { value: "punch_list", label: "Punch List / Snag List", shortLabel: "Punch / Snag List", group: "quality", icon: "quality" },
  { value: "defect_report", label: "Defect Report", shortLabel: "Defect Report", group: "quality", icon: "quality" },
  { value: "test_report", label: "Test Report", shortLabel: "Test Report", group: "quality", icon: "quality" },
  { value: "commissioning_report", label: "Commissioning Report", shortLabel: "Commissioning", group: "report", icon: "report" },
  { value: "handover_document", label: "Handover Document", shortLabel: "Handover", group: "management", icon: "document" },
  { value: "as_built_document", label: "As-Built Document", shortLabel: "As-Built", group: "drawing", icon: "drawing" },
  { value: "drawing", label: "Drawing", shortLabel: "Drawing", group: "drawing", icon: "drawing" },
  { value: "shop_drawing", label: "Shop Drawing", shortLabel: "Shop Drawing", group: "drawing", icon: "drawing" },
  { value: "technical_submittal", label: "Technical Submittal", shortLabel: "Technical Submittal", group: "submittal", icon: "submittal" },
  { value: "material_submittal", label: "Material Submittal", shortLabel: "Material Submittal", group: "submittal", icon: "submittal" },
  { value: "document_submittal", label: "Document Submittal", shortLabel: "Document Submittal", group: "submittal", icon: "submittal" },
  { value: "transmittal", label: "Transmittal", shortLabel: "Transmittal", group: "communication", icon: "communication" },
  { value: "technical_query", label: "Technical Query", shortLabel: "Technical Query", group: "communication", icon: "communication" },
  { value: "change_request", label: "Change Request", shortLabel: "Change Request", group: "commercial", icon: "commercial" },
  { value: "variation_order", label: "Variation Order", shortLabel: "Variation Order", group: "commercial", icon: "commercial" },
  { value: "site_instruction", label: "Site Instruction", shortLabel: "Site Instruction", group: "communication", icon: "communication" },
  { value: "work_order", label: "Work Order", shortLabel: "Work Order", group: "management", icon: "document" },
  { value: "meeting_minutes", label: "Meeting Minutes", shortLabel: "Meeting Minutes", group: "communication", icon: "communication" },
  { value: "checklist", label: "Checklist", shortLabel: "Checklist", group: "management", icon: "document" },
  { value: "certificate", label: "Certificate", shortLabel: "Certificate", group: "management", icon: "document" },
  { value: "approval", label: "Approval", shortLabel: "Approval", group: "management", icon: "document" },
  { value: "specification", label: "Specification", shortLabel: "Specification", group: "management", icon: "document" },
  { value: "procedure", label: "Procedure", shortLabel: "Procedure", group: "management", icon: "document" },
  { value: "policy", label: "Policy", shortLabel: "Policy", group: "management", icon: "document" },
  { value: "manual", label: "Manual", shortLabel: "Manual", group: "management", icon: "document" },
  { value: "schedule", label: "Schedule", shortLabel: "Schedule", group: "management", icon: "document" },
  { value: "bill_of_quantities", label: "Bill of Quantities (BOQ)", shortLabel: "BOQ", group: "commercial", icon: "commercial" },
  { value: "other", label: "Other", shortLabel: "Other", group: "other", icon: "document" },
] as const

export type DocumentTypeValue = (typeof DOCUMENT_TYPES)[number]["value"]
export type DocumentTypeDefinition = (typeof DOCUMENT_TYPES)[number] & { badgeClassName: string }

const DOCUMENT_TYPE_VALUES = new Set<string>(DOCUMENT_TYPES.map((type) => type.value))
const DOCUMENT_TYPE_BY_VALUE = new Map<DocumentTypeValue, DocumentTypeDefinition>(
  DOCUMENT_TYPES.map((type) => [
    type.value,
    { ...type, badgeClassName: badgeStyles[type.group] },
  ]),
)

const LEGACY_DOCUMENT_TYPE_MAP: Record<string, DocumentTypeValue> = {
  general: "other",
  "general document": "other",
  contract: "other",
  report: "other",
  submittal: "document_submittal",
  rfi: "request_for_information",
  "request for information": "request_for_information",
  "request for inspection": "request_for_inspection",
  ncr: "ncr",
  drawing: "drawing",
}

export function isDocumentTypeValue(value: unknown): value is DocumentTypeValue {
  return typeof value === "string" && DOCUMENT_TYPE_VALUES.has(value)
}

export function normalizeDocumentType(value: unknown): DocumentTypeValue {
  if (isDocumentTypeValue(value)) return value
  if (typeof value !== "string") return "other"

  const normalized = value.trim().toLowerCase().replaceAll("-", " ").replaceAll("_", " ").replace(/\s+/g, " ")
  return LEGACY_DOCUMENT_TYPE_MAP[normalized] ?? "other"
}

export function getDocumentTypeDefinition(value: unknown): DocumentTypeDefinition {
  return DOCUMENT_TYPE_BY_VALUE.get(normalizeDocumentType(value)) ?? DOCUMENT_TYPE_BY_VALUE.get("other")!
}

export function getDocumentTypeLabel(value: unknown): string {
  return getDocumentTypeDefinition(value).label
}

export function getDocumentTypeShortLabel(value: unknown): string {
  return getDocumentTypeDefinition(value).shortLabel
}
