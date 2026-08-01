"use client"

import Link from "next/link"
import { ChevronRight, ClipboardList, FileText, AlertTriangle, ShieldCheck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { kpis } from "@/lib/mock-data"

export function KpiCards() {
  const { t } = useI18n()

  const items = [
    { label: t.dashboard.openInspections, value: kpis.openInspections, icon: ClipboardList, tone: "info", href: "/inspections", valueClass: "text-info" },
    { label: t.dashboard.pendingApprovals, value: kpis.pendingApprovals, icon: FileText, tone: "warning", href: "/inspections", valueClass: "text-warning-foreground dark:text-warning" },
    { label: t.dashboard.openNcrs, value: kpis.openNcrs, icon: AlertTriangle, tone: "danger", href: "/ncrs", valueClass: "text-destructive" },
    { label: t.dashboard.safetyObservations, value: kpis.safetyObservations, icon: ShieldCheck, tone: "success", href: "/reports", valueClass: "text-success" },
  ] as const

  const bg: Record<string, string> = {
    info: "bg-info/12 text-info",
    warning: "bg-warning/15 text-warning-foreground dark:text-warning",
    danger: "bg-destructive/10 text-destructive",
    success: "bg-success/12 text-success",
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Card key={item.label}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className={`flex size-11 items-center justify-center rounded-full ${bg[item.tone]}`}>
                  <Icon className="size-5" />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span className={`text-3xl font-bold tabular-nums ${item.valueClass}`}>{item.value}</span>
                </div>
              </div>
              <Link
                href={item.href}
                className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {t.common.viewAll}
                <ChevronRight className="size-4 flip-rtl" />
              </Link>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
