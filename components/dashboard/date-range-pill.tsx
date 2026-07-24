import { Calendar, ChevronDown } from "lucide-react"
import { dashboardDateRange } from "@/lib/portfolio-data"

export function DateRangePill() {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
    >
      <Calendar className="size-4 text-muted-foreground" />
      <span>{dashboardDateRange}</span>
      <ChevronDown className="size-4 text-muted-foreground" />
    </button>
  )
}
