export const STAGE_TERM_STATUSES = ["active", "disabled"] as const
export type StageTermStatus = (typeof STAGE_TERM_STATUSES)[number]

export const DUE_DATE_RULES = [
  { value: "none", label: "No automatic due date", labelAr: "لا يوجد تاريخ استحقاق تلقائي" },
  { value: "stage_start", label: "Due when stage starts", labelAr: "مستحق عند بدء المرحلة" },
  { value: "within_3_days", label: "Within 3 days of stage start", labelAr: "خلال 3 أيام من بدء المرحلة" },
  { value: "within_7_days", label: "Within 7 days of stage start", labelAr: "خلال 7 أيام من بدء المرحلة" },
  { value: "within_14_days", label: "Within 14 days of stage start", labelAr: "خلال 14 يومًا من بدء المرحلة" },
  { value: "before_stage_completion", label: "Before stage completion", labelAr: "قبل اكتمال المرحلة" },
  { value: "project_milestone", label: "At related project milestone", labelAr: "عند معلم المشروع المرتبط" },
] as const

export type DueDateRuleValue = (typeof DUE_DATE_RULES)[number]["value"]

export function dueDateRuleLabel(value: string, locale: "en" | "ar" = "en"): string {
  const rule = DUE_DATE_RULES.find((item) => item.value === value)
  if (!rule) return value
  return locale === "ar" ? rule.labelAr : rule.label
}
