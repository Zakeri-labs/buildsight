export const PROJECT_TYPES = [
  { value: "residential", label: "Residents", labelAr: "سكني" },
  { value: "commercial", label: "Commercial", labelAr: "تجاري" },
  { value: "other", label: "Other", labelAr: "أخرى" },
  { value: "industrial", label: "Industrial", labelAr: "صناعي" },
  { value: "infrastructure", label: "Infrastructure", labelAr: "بنية أساسية" },
  { value: "mixed_use", label: "Mixed Use", labelAr: "متعدد الاستخدامات" },
  { value: "hospitality", label: "Hospitality", labelAr: "ضيافة" },
  { value: "healthcare", label: "Healthcare", labelAr: "رعاية صحية" },
  { value: "education", label: "Education", labelAr: "تعليمي" },
] as const

export const SUPERVISION_TYPES = [
  { value: "full_time", label: "Full-Time Supervision", labelAr: "إشراف بدوام كامل" },
  { value: "part_time", label: "Part-Time Supervision", labelAr: "إشراف بدوام جزئي" },
  { value: "periodic", label: "Periodic Supervision", labelAr: "إشراف دوري" },
  { value: "milestone_based", label: "Milestone-Based Supervision", labelAr: "إشراف حسب المراحل" },
  { value: "resident", label: "Resident Supervision", labelAr: "إشراف مقيم" },
  { value: "on_call", label: "On-Call Supervision", labelAr: "إشراف عند الطلب" },
  { value: "remote", label: "Remote Supervision", labelAr: "إشراف عن بُعد" },
  { value: "consultancy_only", label: "Consultancy Only", labelAr: "استشارات فقط" },
  { value: "other", label: "Other", labelAr: "أخرى" },
] as const

export const PROJECT_PRIORITIES = [
  { value: "low", label: "Low", labelAr: "منخفضة" },
  { value: "medium", label: "Medium", labelAr: "متوسطة" },
  { value: "high", label: "High", labelAr: "عالية" },
  { value: "urgent", label: "Urgent", labelAr: "عاجلة" },
] as const

export type ProjectTypeValue = (typeof PROJECT_TYPES)[number]["value"]
export type SupervisionTypeValue = (typeof SUPERVISION_TYPES)[number]["value"]
export type ProjectPriorityValue = (typeof PROJECT_PRIORITIES)[number]["value"]

const projectTypeValues = new Set<string>(PROJECT_TYPES.map((item) => item.value))
const supervisionTypeValues = new Set<string>(SUPERVISION_TYPES.map((item) => item.value))
const projectPriorityValues = new Set<string>(PROJECT_PRIORITIES.map((item) => item.value))

const LEGACY_SUPERVISION_LABELS: Record<string, string> = {
  monthly_6_times: "Monthly 6 Times",
  monthly_4_times: "Monthly 4 Times",
  lump_sum: "Lump Sum",
  visit_basis: "Visit Basis",
  full_supervision: "Full Supervision",
  periodic_supervision: "Periodic Supervision",
  design_and_supervision: "Design and Supervision",
  construction_management: "Construction Management",
  quality_inspection: "Quality Inspection",
}

export function isProjectTypeValue(value: unknown): value is ProjectTypeValue {
  return typeof value === "string" && projectTypeValues.has(value)
}

export function isSupervisionTypeValue(value: unknown): value is SupervisionTypeValue {
  return typeof value === "string" && supervisionTypeValues.has(value)
}

export function isProjectPriorityValue(value: unknown): value is ProjectPriorityValue {
  return typeof value === "string" && projectPriorityValues.has(value)
}

export function projectPriorityLabel(value: string | null | undefined, isArabic = false): string {
  if (!value?.trim()) return isArabic ? "غير محدد" : "Not set"
  const option = PROJECT_PRIORITIES.find((item) => item.value === value)
  if (option) return isArabic ? option.labelAr : option.label
  return value.trim().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

export function supervisionTypeLabel(value: string | null | undefined, otherValue?: string | null): string {
  if (!value) return "Not specified"
  if (value === "other") return otherValue?.trim() || "Not specified"
  return SUPERVISION_TYPES.find((option) => option.value === value)?.label
    ?? LEGACY_SUPERVISION_LABELS[value]
    ?? value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}
