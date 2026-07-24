"use client"

import { useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/lib/i18n"
import { progressSeries } from "@/lib/mock-data"

export function ProgressChart() {
  const { t } = useI18n()
  const [period, setPeriod] = useState("weekly")

  const config = {
    planned: { label: t.dashboard.plannedPct, color: "var(--chart-1)" },
    actual: { label: t.dashboard.actualPct, color: "var(--chart-2)" },
  } satisfies ChartConfig

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t.dashboard.constructionProgress}</CardTitle>
        <Select value={period} onValueChange={(v) => setPeriod(v as string)}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue placeholder={t.common.weekly}>
              {(value) =>
                value === "daily"
                  ? t.common.daily
                  : value === "monthly"
                    ? t.common.monthly
                    : t.common.weekly
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="daily">{t.common.daily}</SelectItem>
              <SelectItem value="weekly">{t.common.weekly}</SelectItem>
              <SelectItem value="monthly">{t.common.monthly}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex-1">
        <ChartContainer config={config} className="h-64 w-full">
          <LineChart data={progressSeries} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={28}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              dataKey="planned"
              type="monotone"
              stroke="var(--color-planned)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              dataKey="actual"
              type="monotone"
              stroke="var(--color-actual)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ChartContainer>
        <div className="mt-4 flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} />
            <span className="text-muted-foreground">{t.dashboard.plannedPct}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: "var(--chart-2)" }} />
            <span className="text-muted-foreground">{t.dashboard.actualPct}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
