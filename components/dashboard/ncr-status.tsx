"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { ncrStatus } from "@/lib/mock-data"
import { DonutChart } from "@/components/dashboard/donut-chart"

export function NcrStatus() {
  const { t } = useI18n()

  const legend = [
    { label: t.dashboard.open, value: ncrStatus.open, color: "var(--chart-3)" },
    { label: t.dashboard.inReview, value: ncrStatus.inReview, color: "var(--chart-4)" },
    { label: t.dashboard.closed, value: ncrStatus.closed, color: "var(--chart-2)" },
  ]

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{t.dashboard.ncrStatus}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="flex items-center gap-6">
          <DonutChart
            size={130}
            strokeWidth={14}
            segments={[
              { value: ncrStatus.closed, color: "var(--chart-2)" },
              { value: ncrStatus.inReview, color: "var(--chart-4)" },
              { value: ncrStatus.open, color: "var(--chart-3)" },
            ]}
            centerTop={<span className="text-3xl font-bold tabular-nums">{ncrStatus.total}</span>}
            centerBottom={<span className="text-xs text-muted-foreground">{t.common.total}</span>}
          />
          <div className="flex flex-1 flex-col gap-3">
            {legend.map((l) => (
              <div key={l.label} className="flex items-center gap-2 text-sm">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="flex-1 text-muted-foreground">{l.label}</span>
                <span className="font-semibold tabular-nums">{l.value}</span>
              </div>
            ))}
          </div>
        </div>
        <Link
          href="/ncrs"
          className="mt-auto flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t.common.viewAll}
          <ChevronRight className="size-4 flip-rtl" />
        </Link>
      </CardContent>
    </Card>
  )
}
