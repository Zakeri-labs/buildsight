"use client"

import Image from "next/image"
import { MapPin, Building, HardHat, ClipboardList, CalendarDays } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { activeProject } from "@/lib/mock-data"
import { DonutChart } from "@/components/dashboard/donut-chart"

function Meta({ icon: Icon, label, value, valueClass }: { icon: typeof Building; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`truncate text-sm font-medium ${valueClass ?? ""}`}>{value}</p>
      </div>
    </div>
  )
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export function ProjectSummary() {
  const { t } = useI18n()
  const p = activeProject

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-col gap-4 sm:flex-row">
          <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-xl sm:h-36 sm:w-44">
            <Image src={p.image || "/placeholder.svg"} alt={p.name} fill className="object-cover" sizes="200px" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <h2 className="text-xl font-bold text-balance">{p.name}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                {p.location}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
              <Meta icon={Building} label={t.dashboard.statusLabel} value={t.dashboard.underConstruction} valueClass="text-success" />
              <Meta icon={HardHat} label={t.dashboard.contractor} value={p.contractor} />
              <Meta icon={ClipboardList} label={t.dashboard.consultant} value={p.consultant} />
              <Meta icon={CalendarDays} label={t.dashboard.targetHandover} value={p.targetHandover} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 border-t pt-6 lg:border-s lg:border-t-0 lg:ps-8 lg:pt-0">
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-semibold text-muted-foreground">{t.dashboard.overallProgress}</p>
            <DonutChart
              size={140}
              strokeWidth={14}
              total={100}
              segments={[
                { value: p.progress.actual, color: "var(--chart-2)" },
                { value: p.progress.delay, color: "var(--chart-3)" },
              ]}
              centerTop={<span className="text-3xl font-bold tabular-nums">{p.progress.actual}%</span>}
            />
          </div>
          <div className="flex w-40 flex-col gap-2.5">
            <LegendRow color="var(--chart-1)" label={t.dashboard.planned} value={`${p.progress.planned}%`} />
            <LegendRow color="var(--chart-2)" label={t.dashboard.actual} value={`${p.progress.actual}%`} />
            <LegendRow color="var(--chart-3)" label={t.dashboard.delay} value={`${p.progress.delay}%`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
