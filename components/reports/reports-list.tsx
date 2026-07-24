"use client"

import { useState } from "react"
import { Plus, FileText, Users, Cloud, Download, ClipboardCheck, ShieldCheck, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PageHeader } from "@/components/dashboard/page-header"
import { ToneBadge } from "@/components/status-badge"
import { useI18n } from "@/lib/i18n"
import { reports, reportsSummary, type ReportType } from "@/lib/mock-data"

const typeMeta: Record<ReportType, { icon: React.ElementType; tone: "info" | "primary" | "success"; labelKey: "typeDaily" | "typeWeekly" | "typeSafety" }> = {
  daily: { icon: ClipboardCheck, tone: "info", labelKey: "typeDaily" },
  weekly: { icon: TrendingUp, tone: "primary", labelKey: "typeWeekly" },
  safety: { icon: ShieldCheck, tone: "success", labelKey: "typeSafety" },
}

export function ReportsList() {
  const { t } = useI18n()
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.reports.title}
        subtitle={t.reports.subtitle}
        action={
          <Button>
            <Plus data-icon="inline-start" />
            {t.reports.newReport}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard icon={FileText} label={t.reports.totalReports} value={reportsSummary.totalReports} tone="text-info" />
        <SummaryCard icon={Users} label={t.reports.avgManpower} value={reportsSummary.avgManpower} tone="text-primary" />
        <SummaryCard icon={ClipboardCheck} label={t.reports.openIssues} value={reportsSummary.openIssues} tone="text-destructive" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {reports.map((report) => {
          const meta = typeMeta[report.type]
          const Icon = meta.icon
          const isOpen = selected === report.id
          return (
            <Card key={report.id} className="gap-0">
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Icon className="size-5" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <CardTitle className="text-sm">{report.title}</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{report.id}</span>
                      <ToneBadge tone={meta.tone}>{t.reports[meta.labelKey]}</ToneBadge>
                    </div>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{report.date}</span>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Users className="size-4" />
                    {report.manpower}
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Cloud className="size-4" />
                    {report.weather}
                  </span>
                  <div className="ms-auto flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarFallback className="text-[10px]">{report.authorInitials}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">{report.author}</span>
                  </div>
                </div>

                {isOpen && (
                  <div className="flex flex-col gap-2 border-t border-border pt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.reports.activities}
                    </h4>
                    <ul className="flex list-inside list-disc flex-col gap-1 text-sm">
                      {report.activities.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(isOpen ? null : report.id)}
                  >
                    {isOpen ? t.common.viewAll : t.reports.viewReport}
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Download data-icon="inline-start" />
                    {t.reports.export}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: number
  tone: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <Icon className={`size-6 ${tone}`} />
        </span>
        <div className="flex flex-col">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  )
}
