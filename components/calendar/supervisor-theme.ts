export type SupervisorColorTheme = {
  bg: string
  text: string
  border: string
  ring: string
  label: string
}

export const SUPERVISOR_PALETTE: SupervisorColorTheme[] = [
  { bg: "bg-indigo-600 dark:bg-indigo-500", text: "text-white", border: "border-indigo-700", ring: "ring-indigo-300", label: "Indigo" },
  { bg: "bg-amber-500 dark:bg-amber-600", text: "text-amber-950 dark:text-white", border: "border-amber-600", ring: "ring-amber-300", label: "Amber" },
  { bg: "bg-purple-600 dark:bg-purple-500", text: "text-white", border: "border-purple-700", ring: "ring-purple-300", label: "Purple" },
  { bg: "bg-teal-600 dark:bg-teal-500", text: "text-white", border: "border-teal-700", ring: "ring-teal-300", label: "Teal" },
  { bg: "bg-rose-600 dark:bg-rose-500", text: "text-white", border: "border-rose-700", ring: "ring-rose-300", label: "Rose" },
  { bg: "bg-cyan-600 dark:bg-cyan-500", text: "text-white", border: "border-cyan-700", ring: "ring-cyan-300", label: "Cyan" },
  { bg: "bg-orange-500 dark:bg-orange-600", text: "text-white", border: "border-orange-600", ring: "ring-orange-300", label: "Orange" },
  { bg: "bg-emerald-600 dark:bg-emerald-500", text: "text-white", border: "border-emerald-700", ring: "ring-emerald-300", label: "Emerald" },
  { bg: "bg-violet-600 dark:bg-violet-500", text: "text-white", border: "border-violet-700", ring: "ring-violet-300", label: "Violet" },
  { bg: "bg-sky-600 dark:bg-sky-500", text: "text-white", border: "border-sky-700", ring: "ring-sky-300", label: "Sky" },
]

export function getSupervisorTheme(supervisorId: string | null | undefined): SupervisorColorTheme {
  if (!supervisorId) {
    return {
      bg: "bg-slate-400 dark:bg-slate-500",
      text: "text-white",
      border: "border-slate-500",
      ring: "ring-slate-300",
      label: "Neutral",
    }
  }
  let hash = 0
  for (let i = 0; i < supervisorId.length; i++) {
    hash = (hash << 5) - hash + supervisorId.charCodeAt(i)
    hash |= 0
  }
  const index = Math.abs(hash) % SUPERVISOR_PALETTE.length
  return SUPERVISOR_PALETTE[index]
}

export function getSupervisorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
