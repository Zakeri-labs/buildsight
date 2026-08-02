export const PROJECT_STATUS_OPTIONS = [
  { value: "active", label: "Active", labelAr: "نشط" },
  { value: "inactive", label: "Inactive", labelAr: "غير نشط" },
  { value: "completed", label: "Completed", labelAr: "مكتمل" },
  { value: "stopped", label: "Stopped", labelAr: "متوقف" },
  { value: "final_visit", label: "Final Visit", labelAr: "الزيارة النهائية" },
  { value: "not_started", label: "Not Started", labelAr: "لم يبدأ" },
] as const

export type ProjectStatusValue = (typeof PROJECT_STATUS_OPTIONS)[number]["value"]

export const PROJECT_STATUS_BADGE_CLASS: Record<ProjectStatusValue, string> = {
  active: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  inactive: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  stopped: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
  final_visit: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300",
  not_started: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
}

export function normalizeProjectStatus(status: string | null | undefined): ProjectStatusValue {
  const normalized = status?.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_") ?? ""

  if (normalized === "inactive" || normalized === "disabled" || normalized === "suspended") return "inactive"
  if (normalized === "completed" || normalized === "complete" || normalized === "finished") return "completed"
  if (normalized === "stopped" || normalized === "on_hold" || normalized === "paused") return "stopped"
  if (normalized === "final_visit" || normalized === "handover" || normalized === "final_inspection") return "final_visit"
  if (normalized === "not_started" || normalized === "planning" || normalized === "planned" || normalized === "draft") return "not_started"
  if (normalized === "active" || normalized === "in_progress" || normalized === "under_construction") return "active"
  return "active"
}

export function projectStatusLabel(status: ProjectStatusValue, isArabic = false): string {
  const option = PROJECT_STATUS_OPTIONS.find((item) => item.value === status)!
  return isArabic ? option.labelAr : option.label
}
