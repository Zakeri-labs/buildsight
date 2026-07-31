import Link from "next/link"
import { TriangleAlert, ClipboardCheck, CircleHelp, FileText, FileUp, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ActivityRow } from "@/lib/db/domain"
import { timeAgo } from "@/lib/format"

const typeConfig: Record<
  ActivityRow["type"],
  { icon: React.ElementType; tile: string; label: string }
> = {
  ncr: { icon: TriangleAlert, tile: "bg-red-50 text-red-600", label: "NCR" },
  inspection: { icon: ClipboardCheck, tile: "bg-blue-50 text-blue-600", label: "Inspection" },
  rfi: { icon: CircleHelp, tile: "bg-emerald-50 text-emerald-600", label: "RFI" },
  vo: { icon: FileText, tile: "bg-amber-50 text-amber-600", label: "VO" },
  document: { icon: FileUp, tile: "bg-slate-100 text-slate-600", label: "Letter" },
}

export function ActivityFeed({ items }: { items: ActivityRow[] }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Recent Activity</h2>

      <ul className="mt-4 flex flex-1 flex-col gap-4">
        {items.length === 0 && <li className="text-sm text-muted-foreground">No recent activity.</li>}
        {items.map((a) => {
          const cfg = typeConfig[a.type]
          const Icon = cfg.icon
          return (
            <li key={a.id} className="flex items-start gap-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", cfg.tile)}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  {a.reference ? (
                    <>
                      <span className="font-semibold">{`${cfg.label} #${a.reference}`}</span> {a.verb}
                    </>
                  ) : (
                    <span className="font-semibold">{a.verb}</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{a.projectName}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
            </li>
          )
        })}
      </ul>

      <Link
        href="/reports"
        className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-primary hover:underline"
      >
        View all activity
        <ChevronRight className="size-4 flip-rtl" />
      </Link>
    </div>
  )
}
