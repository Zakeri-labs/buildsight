import Link from "next/link"
import { TriangleAlert, ClipboardCheck, CircleHelp, FileText, FileUp, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { portfolioActivity, type PortfolioActivity } from "@/lib/portfolio-data"

const typeConfig: Record<
  PortfolioActivity["type"],
  { icon: React.ElementType; tile: string; label: string }
> = {
  ncr: { icon: TriangleAlert, tile: "bg-red-50 text-red-600", label: "NCR" },
  inspection: { icon: ClipboardCheck, tile: "bg-blue-50 text-blue-600", label: "Inspection" },
  rfi: { icon: CircleHelp, tile: "bg-emerald-50 text-emerald-600", label: "RFI" },
  vo: { icon: FileText, tile: "bg-amber-50 text-amber-600", label: "VO" },
  document: { icon: FileUp, tile: "bg-slate-100 text-slate-600", label: "Document" },
}

export function ActivityFeed() {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Recent Activity</h2>

      <ul className="mt-4 flex flex-1 flex-col gap-4">
        {portfolioActivity.map((a) => {
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
                      <span className="font-semibold">{`${cfg.label} #${a.reference}`}</span> {a.title}
                    </>
                  ) : (
                    <span className="font-semibold">{a.title}</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{a.project}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{a.time}</span>
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
