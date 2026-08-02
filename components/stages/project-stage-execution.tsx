"use client"

import Link from "next/link"
import { ClipboardCheck, FileCheck2, FileText, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ManageProjectStagesButton } from "@/components/stages/project-stage-admin-controls"
import type { ProjectStageExecutionData } from "@/lib/db/project-stages"
import { statusLabel, statusTone } from "@/lib/stages/execution"
import { useI18n } from "@/lib/i18n"

const COPY = {
  en: {
    title: "Project Stages",
    subtitle: "Create, manage, and review reports directly inside each active stage.",
    reports: "Reports",
    pendingReview: "Pending review",
    approved: "Approved",
    openStage: "Open stage",
    noStages: "No active project stages are available.",
    noStagesHint: "An administrator can enable the stages used by this project.",
    noReports: "No reports yet",
  },
  ar: {
    title: "مراحل المشروع",
    subtitle: "إنشاء التقارير وإدارتها ومراجعتها مباشرة داخل كل مرحلة نشطة.",
    reports: "التقارير",
    pendingReview: "بانتظار المراجعة",
    approved: "معتمد",
    openStage: "فتح المرحلة",
    noStages: "لا توجد مراحل نشطة لهذا المشروع.",
    noStagesHint: "يمكن للمسؤول تفعيل المراحل المستخدمة في هذا المشروع.",
    noReports: "لا توجد تقارير بعد",
  },
} as const

export function ProjectStageExecutionView({ data }: { data: ProjectStageExecutionData }) {
  const { locale } = useI18n()
  const copy = COPY[locale === "ar" ? "ar" : "en"]
  const totalReports = data.stages.reduce((sum, stage) => sum + stage.reportSummary.total, 0)
  const approvedReports = data.stages.reduce((sum, stage) => sum + stage.reportSummary.approved, 0)
  const pendingReports = data.stages.reduce((sum, stage) => sum + stage.reportSummary.pendingReview, 0)
  const progress = totalReports ? Math.round((approvedReports / totalReports) * 100) : 0

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <ClipboardCheck className="size-4" />
            <span className="truncate">{data.project.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
            {data.canManage ? <ManageProjectStagesButton projectId={data.project.id} stages={data.availableStages} /> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="grid min-w-0 grid-cols-3 gap-2 sm:min-w-[300px]">
          <Metric value={totalReports} label={copy.reports} />
          <Metric value={pendingReports} label={copy.pendingReview} />
          <Metric value={`${progress}%`} label={copy.approved} />
        </div>
      </div>

      {data.stages.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <FileCheck2 className="mb-4 size-10 text-muted-foreground" />
            <h2 className="font-semibold">{copy.noStages}</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{copy.noStagesHint}</p>
            {data.canManage ? <div className="mt-4"><ManageProjectStagesButton projectId={data.project.id} stages={data.availableStages} /></div> : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.stages.map((stage) => {
            const completed = stage.reportSummary.approved
            const total = stage.reportSummary.total
            const percentage = total ? Math.round((completed / total) * 100) : 0
            return (
              <Link key={stage.id} href={`/projects/${data.project.id}/stages/${stage.id}`} className="group block">
                <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-muted/15">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="size-5" /></span>
                        <div className="min-w-0">
                          <CardTitle className="truncate text-lg">{stage.name}</CardTitle>
                          {stage.description ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{stage.description}</p> : null}
                        </div>
                      </div>
                      <Badge variant="outline" className={stage.status === "disabled" ? "border-slate-200 bg-slate-50 text-slate-700" : statusTone(stage.status)}>{stage.status === "disabled" ? "Disabled" : statusLabel(stage.status)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Metric value={total} label={copy.reports} compact />
                      <Metric value={stage.reportSummary.pendingReview} label={copy.pendingReview} compact />
                      <Metric value={completed} label={copy.approved} compact />
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><ShieldCheck className="size-3.5" />{copy.approved}</span>
                        <span>{percentage}%</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                    <div className="text-sm font-medium text-primary">{total ? copy.openStage : `${copy.openStage} · ${copy.noReports}`}</div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Metric({ value, label, compact = false }: { value: number | string; label: string; compact?: boolean }) {
  return (
    <div className={compact ? "rounded-lg border bg-muted/20 px-2 py-2" : "rounded-xl border bg-muted/25 px-2 py-3"}>
      <div className={compact ? "font-semibold tabular-nums" : "text-lg font-semibold tabular-nums sm:text-xl"}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}
