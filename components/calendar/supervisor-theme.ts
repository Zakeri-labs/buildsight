export type SupervisorColorTheme = {
  bg: string
  text: string
  border: string
  ring: string
  label: string
}

/**
  * Curated 16-color palette with high visual contrast and distinct hue separation.
  * Ensures adjacent supervisors on calendar views & legend remain easily distinguishable.
  */
export const SUPERVISOR_PALETTE: SupervisorColorTheme[] = [
  { bg: "bg-red-600 dark:bg-red-500", text: "text-white", border: "border-red-700", ring: "ring-red-300", label: "Red" },
  { bg: "bg-amber-500 dark:bg-amber-600", text: "text-amber-950 dark:text-white", border: "border-amber-600", ring: "ring-amber-300", label: "Amber" },
  { bg: "bg-emerald-600 dark:bg-emerald-500", text: "text-white", border: "border-emerald-700", ring: "ring-emerald-300", label: "Emerald" },
  { bg: "bg-blue-600 dark:bg-blue-500", text: "text-white", border: "border-blue-700", ring: "ring-blue-300", label: "Royal Blue" },
  { bg: "bg-purple-600 dark:bg-purple-500", text: "text-white", border: "border-purple-700", ring: "ring-purple-300", label: "Deep Purple" },
  { bg: "bg-teal-600 dark:bg-teal-500", text: "text-white", border: "border-teal-700", ring: "ring-teal-300", label: "Teal" },
  { bg: "bg-orange-600 dark:bg-orange-500", text: "text-white", border: "border-orange-700", ring: "ring-orange-300", label: "Orange" },
  { bg: "bg-pink-600 dark:bg-pink-500", text: "text-white", border: "border-pink-700", ring: "ring-pink-300", label: "Pink" },
  { bg: "bg-cyan-600 dark:bg-cyan-500", text: "text-white", border: "border-cyan-700", ring: "ring-cyan-300", label: "Cyan" },
  { bg: "bg-lime-600 dark:bg-lime-500", text: "text-slate-950 dark:text-white", border: "border-lime-700", ring: "ring-lime-300", label: "Lime" },
  { bg: "bg-violet-600 dark:bg-violet-500", text: "text-white", border: "border-violet-700", ring: "ring-violet-300", label: "Violet" },
  { bg: "bg-rose-600 dark:bg-rose-500", text: "text-white", border: "border-rose-700", ring: "ring-rose-300", label: "Rose" },
  { bg: "bg-fuchsia-600 dark:bg-fuchsia-500", text: "text-white", border: "border-fuchsia-700", ring: "ring-fuchsia-300", label: "Fuchsia" },
  { bg: "bg-sky-600 dark:bg-sky-500", text: "text-white", border: "border-sky-700", ring: "ring-sky-300", label: "Sky Blue" },
  { bg: "bg-indigo-600 dark:bg-indigo-500", text: "text-white", border: "border-indigo-700", ring: "ring-indigo-300", label: "Indigo" },
  { bg: "bg-yellow-500 dark:bg-yellow-600", text: "text-yellow-950 dark:text-white", border: "border-yellow-600", ring: "ring-yellow-300", label: "Yellow" },
]

/** 32-bit FNV-1a hash algorithm for uniform palette index distribution */
function fnv1aHash(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

/**
 * Deterministically retrieves a distinct color theme for a supervisor.
 * Prefers `supervisorId`; falls back to `supervisorName` if ID is absent.
 */
export function getSupervisorTheme(
  supervisorId?: string | null,
  supervisorName?: string | null
): SupervisorColorTheme {
  const key = (supervisorId?.trim() || supervisorName?.trim() || "").toLowerCase()
  if (!key) {
    return {
      bg: "bg-slate-400 dark:bg-slate-500",
      text: "text-white",
      border: "border-slate-500",
      ring: "ring-slate-300",
      label: "Neutral",
    }
  }

  const hash = fnv1aHash(key)
  const index = hash % SUPERVISOR_PALETTE.length
  return SUPERVISOR_PALETTE[index]
}

export function getSupervisorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
