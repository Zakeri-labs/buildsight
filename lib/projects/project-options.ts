export const PROJECT_TYPES = [
<<<<<<< HEAD
  { value: "residential", label: "Residents", labelAr: "سكني" },
  { value: "commercial", label: "Commercial", labelAr: "تجاري" },
  { value: "other", label: "Other", labelAr: "أخرى" },
=======
  { value: "residential", label: "Residential", labelAr: "سكني" },
  { value: "commercial", label: "Commercial", labelAr: "تجاري" },
>>>>>>> 4ecace8ec62dfcd65d96436381ac0e9bc299038f
  { value: "industrial", label: "Industrial", labelAr: "صناعي" },
  { value: "infrastructure", label: "Infrastructure", labelAr: "بنية أساسية" },
  { value: "mixed_use", label: "Mixed Use", labelAr: "متعدد الاستخدامات" },
  { value: "hospitality", label: "Hospitality", labelAr: "ضيافة" },
  { value: "healthcare", label: "Healthcare", labelAr: "رعاية صحية" },
  { value: "education", label: "Education", labelAr: "تعليمي" },
<<<<<<< HEAD
] as const

export const SUPERVISION_TYPES = [
  { value: "monthly_6_times", label: "Monthly 6 Times", labelAr: "6 زيارات شهريًا" },
  { value: "monthly_4_times", label: "Monthly 4 Times", labelAr: "4 زيارات شهريًا" },
  { value: "lump_sum", label: "Lump Sum", labelAr: "مبلغ مقطوع" },
  { value: "visit_basis", label: "Visit Basis", labelAr: "حسب الزيارة" },
  { value: "other", label: "Other", labelAr: "أخرى" },
=======
  { value: "other", label: "Other", labelAr: "أخرى" },
] as const

export const SUPERVISION_TYPES = [
>>>>>>> 4ecace8ec62dfcd65d96436381ac0e9bc299038f
  { value: "full_supervision", label: "Full Supervision", labelAr: "إشراف كامل" },
  { value: "periodic_supervision", label: "Periodic Supervision", labelAr: "إشراف دوري" },
  { value: "design_and_supervision", label: "Design and Supervision", labelAr: "تصميم وإشراف" },
  { value: "construction_management", label: "Construction Management", labelAr: "إدارة التشييد" },
  { value: "quality_inspection", label: "Quality Inspection", labelAr: "فحص الجودة" },
<<<<<<< HEAD
=======
  { value: "other", label: "Other", labelAr: "أخرى" },
>>>>>>> 4ecace8ec62dfcd65d96436381ac0e9bc299038f
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
