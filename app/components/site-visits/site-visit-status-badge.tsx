import { cn } from "@/lib/utils"
import type { SiteVisitStatus } from "@/lib/site-visits/types"

const styles: Record<SiteVisitStatus, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  scheduled: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  cancelled: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
}

export function siteVisitStatusLabel(status: SiteVisitStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function SiteVisitStatusBadge({ status }: { status: SiteVisitStatus }) {
  return <span className={cn("inline-flex rounded-md px-2.5 py-1 text-xs font-semibold", styles[status])}>{siteVisitStatusLabel(status)}</span>
}
