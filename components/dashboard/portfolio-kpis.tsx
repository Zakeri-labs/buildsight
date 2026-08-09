import { FolderOpen, TriangleAlert, ClipboardCheck, FileCheck2, ArrowUp, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type KpiTone = "blue" | "red" | "amber" | "green"

export type KpiCardData = {
  key: string
  label: string
  value: number
  tone: KpiTone
  icon: "projects" | "ncr" | "inspection" | "wir"
  caption?: string
  trend?: { direction: "up" | "down"; value: number; good: boolean }
  spark: number[]
}

const iconMap = {
  projects: FolderOpen,
  ncr: TriangleAlert,
  inspection: ClipboardCheck,
  wir: FileCheck2,
} as const

const toneTile: Record<KpiTone, string> = {
  blue: "bg-blue-50 text-blue-600",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
  green: "bg-emerald-50 text-emerald-600",
}

const toneSpark: Record<KpiTone, string> = {
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

function KpiCard({ kpi }: { kpi: KpiCardData }) {
  const Icon = iconMap[kpi.icon]
  const TrendIcon = kpi.trend?.direction === "up" ? ArrowUp : ArrowDown
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", toneTile[kpi.tone])}>
          <Icon className="size-5" />
        </span>
        <p className="text-sm font-semibold text-foreground">{kpi.label}</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-4xl font-bold leading-none tracking-tight text-foreground">{kpi.value}</p>
        <Sparkline data={kpi.spark} className={cn("mb-0.5", toneSpark[kpi.tone])} />
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

export function PortfolioKpis({ kpis }: { kpis: KpiCardData[] }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6 sm:grid-cols-2",
        kpis.length === 3 ? "lg:grid-cols-3" : "xl:grid-cols-4",
      )}
    >
      {kpis.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  )
}
