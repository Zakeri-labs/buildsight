import { FolderOpen, TriangleAlert, ClipboardCheck, CircleHelp, ArrowUp, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { portfolioKpis, type PortfolioKpi } from "@/lib/portfolio-data"

const iconMap = {
  projects: FolderOpen,
  ncr: TriangleAlert,
  inspection: ClipboardCheck,
  rfi: CircleHelp,
} as const

const toneTile: Record<PortfolioKpi["tone"], string> = {
  blue: "bg-blue-50 text-blue-600",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
  green: "bg-emerald-50 text-emerald-600",
}

const toneSpark: Record<PortfolioKpi["tone"], string> = {
  blue: "text-blue-500",
  red: "text-red-500",
  amber: "text-amber-500",
  green: "text-emerald-500",
}

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const w = 88
  const h = 40
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = w / (data.length - 1)
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 6) - 3}`).join(" ")
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <polyline points={points} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KpiCard({ kpi }: { kpi: PortfolioKpi }) {
  const Icon = iconMap[kpi.icon]
  const TrendIcon = kpi.trend?.direction === "up" ? ArrowUp : ArrowDown
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", toneTile[kpi.tone])}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{kpi.value}</p>
        </div>
        <Sparkline data={kpi.spark} className={toneSpark[kpi.tone]} />
      </div>
      <div className="mt-3 text-sm">
        {kpi.caption && <span className="text-muted-foreground">{kpi.caption}</span>}
        {kpi.trend && (
          <span
            className={cn(
              "inline-flex items-center gap-1 font-medium",
              kpi.trend.good ? "text-emerald-600" : "text-red-600",
            )}
          >
            <TrendIcon className="size-3.5" />
            {kpi.trend.value}
            <span className="font-normal text-muted-foreground">from last week</span>
          </span>
        )}
      </div>
    </div>
  )
}

export function PortfolioKpis() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {portfolioKpis.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  )
}
