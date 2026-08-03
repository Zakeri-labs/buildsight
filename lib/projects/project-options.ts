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
  { value: "monthly_2", label: "Monthly 2", labelAr: "شهري 2" },
  { value: "monthly_3", label: "Monthly 3", labelAr: "شهري 3" },
  { value: "monthly_4", label: "Monthly 4", labelAr: "شهري 4" },
  { value: "lump_sum", label: "Lump Sum", labelAr: "مبلغ مقطوع" },
  { value: "visit_basic", label: "Visit Basic", labelAr: "أساسي بالزيارة" },
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
  monthly_4: "Monthly 4",
  monthly_3: "Monthly 3",
  monthly_2: "Monthly 2",
  lump_sum: "Lump Sum",
  visit_basis: "Visit Basis",
  visit_basic: "Visit Basic",
  full_supervision: "Full Supervision",
  periodic_supervision: "Periodic Supervision",
  design_and_supervision: "Design and Supervision",
  construction_management: "Construction Management",
  quality_inspection: "Quality Inspection",
  full_time: "Full-Time Supervision",
  part_time: "Part-Time Supervision",
  periodic: "Periodic Supervision",
  milestone_based: "Milestone-Based Supervision",
  resident: "Resident Supervision",
  on_call: "On-Call Supervision",
  remote: "Remote Supervision",
  consultancy_only: "Consultancy Only",
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
