export const PROJECT_TYPES = [
  { value: "residential", label: "Residential", labelAr: "سكني" },
  { value: "commercial", label: "Commercial", labelAr: "تجاري" },
  { value: "industrial", label: "Industrial", labelAr: "صناعي" },
  { value: "infrastructure", label: "Infrastructure", labelAr: "بنية أساسية" },
  { value: "mixed_use", label: "Mixed Use", labelAr: "متعدد الاستخدامات" },
  { value: "hospitality", label: "Hospitality", labelAr: "ضيافة" },
  { value: "healthcare", label: "Healthcare", labelAr: "رعاية صحية" },
  { value: "education", label: "Education", labelAr: "تعليمي" },
  { value: "other", label: "Other", labelAr: "أخرى" },
] as const

export const SUPERVISION_TYPES = [
  { value: "full_supervision", label: "Full Supervision", labelAr: "إشراف كامل" },
  { value: "periodic_supervision", label: "Periodic Supervision", labelAr: "إشراف دوري" },
  { value: "design_and_supervision", label: "Design and Supervision", labelAr: "تصميم وإشراف" },
  { value: "construction_management", label: "Construction Management", labelAr: "إدارة التشييد" },
  { value: "quality_inspection", label: "Quality Inspection", labelAr: "فحص الجودة" },
  { value: "other", label: "Other", labelAr: "أخرى" },
] as const

export type ProjectTypeValue = (typeof PROJECT_TYPES)[number]["value"]
export type SupervisionTypeValue = (typeof SUPERVISION_TYPES)[number]["value"]

const projectTypeValues = new Set<string>(PROJECT_TYPES.map((item) => item.value))
const supervisionTypeValues = new Set<string>(SUPERVISION_TYPES.map((item) => item.value))

export function isProjectTypeValue(value: unknown): value is ProjectTypeValue {
  return typeof value === "string" && projectTypeValues.has(value)
}

export function isSupervisionTypeValue(value: unknown): value is SupervisionTypeValue {
  return typeof value === "string" && supervisionTypeValues.has(value)
}
