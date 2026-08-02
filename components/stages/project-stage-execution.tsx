"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileCheck2,
  FileEdit,
  FileText,
  Hourglass,
  Plus,
  User,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ManageProjectStagesButton } from "@/components/stages/project-stage-admin-controls"
import type { ProjectStageExecutionData } from "@/lib/db/project-stages"
import { statusLabel, statusTone, type ResponseStatus } from "@/lib/stages/execution"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

const COPY = {
  en: {
    title: "Visit Reports",
    subtitle: "Track construction lifecycle reports, progress, and inspection details.",
    noStages: "No active project stages are available.",
    noStagesHint: "An administrator can activate the construction stages used by this project.",
    noReports: "No inspection reports have been registered for this stage yet.",
    addReport: "Add Report",
    reports: "Reports",
    viewReport: "View / Edit Report",
  },
  ar: {
    title: "تقارير المعاينة",
    subtitle: "متابعة تقارير دورة حياة الإنشاء وسير العمل ونسب الإنجاز.",
    noStages: "لا توجد مراحل نشطة لهذا المشروع.",
    noStagesHint: "يمكن للمسؤول تفعيل مراحل الإنشاء المستخدمة في هذا المشروع.",
    noReports: "لم يتم تسجيل أي تقارير معاينة لهذه المرحلة بعد.",
    addReport: "إضافة تقرير",
    reports: "التقارير",
    viewReport: "عرض / تعديل التقرير",
  },
} as const

function formatDate(value: string, locale: "en" | "ar") {
  const date = new Date(value)
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date)
}

function ReportStatusIcon({ status }: { status: ResponseStatus }) {
  switch (status) {
    case "approved":
    case "completed":
      return (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          <CheckCircle2 className="size-4.5" />
        </div>
      )
    case "submitted":
    case "under_review":
      return (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <Clock className="size-4.5" />
        </div>
      )
    case "in_progress":
      return (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
          <Hourglass className="size-4.5" />
        </div>
      )
    case "rejected":
      return (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          <XCircle className="size-4.5" />
        </div>
      )
    case "draft":
    default:
      return (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
          <FileEdit className="size-4.5" />
        </div>
      )
  }
}

export function ProjectStageExecutionView({ data }: { data: ProjectStageExecutionData }) {
  const { locale } = useI18n()
  const language: "en" | "ar" = locale === "ar" ? "ar" : "en"
  const copy = COPY[language]
  const [openStages, setOpenStages] = useState<Set<string>>(() => new Set(data.stages.slice(0, 2).map((stage) => stage.id)))

  const totals = useMemo(() => {
    let totalItems = 0
    let checkedItems = 0

    for (const stage of data.stages) {
      const stageReportsMap = new Map<string, any>()
      for (const term of stage.terms ?? []) {
        const responses = term.responses ?? (term.response ? [term.response] : [])
        for (const resp of responses) {
          if (!stageReportsMap.has(resp.id)) {
            stageReportsMap.set(resp.id, resp)
          }
        }
      }
      for (const report of stage.reports ?? []) {
        if (!stageReportsMap.has(report.id)) {
          stageReportsMap.set(report.id, report)
        }
      }
      const stageReports = Array.from(stageReportsMap.values())

      for (const report of stageReports) {
        const checklist = report.content?.checklist ?? []
        for (const item of checklist) {
          totalItems++
          if (item.checked || item.result === "pass") {
            checkedItems++
          }
        }
      }
    }

    const percentage = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0
    return { total: totalItems, completed: checkedItems, percentage }
  }, [data.stages])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{copy.title}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{copy.subtitle}</p>
        </div>
        <div className="grid min-w-0 grid-cols-3 gap-2 sm:min-w-[270px] sm:gap-3">
          <Metric value={totals.total} label={language === "ar" ? "بنود الفحص" : "Checklist Items"} />
          <Metric value={totals.completed} label={language === "ar" ? "تم فحصها" : "Checked"} />
          <Metric value={`${totals.percentage}%`} label={language === "ar" ? "نسبة الإنجاز" : "Progress"} />
        </div>
      </div>

      {data.stages.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <FileCheck2 className="mb-4 size-10 text-muted-foreground" />
            <h2 className="font-semibold">{copy.noStages}</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{copy.noStagesHint}</p>
            {data.canManage ? (
              <div className="mt-4">
                <ManageProjectStagesButton projectId={data.project.id} stages={data.availableStages} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {data.stages.map((stage) => {
            const open = openStages.has(stage.id)
            const cleanStageName = stage.name.replace(/^\d+[\.\s\-]+/, "")

            const stageReportsMap = new Map<string, any>()
            for (const term of stage.terms ?? []) {
              const responses = term.responses ?? (term.response ? [term.response] : [])
              for (const resp of responses) {
                if (!stageReportsMap.has(resp.id)) {
                  stageReportsMap.set(resp.id, resp)
                }
              }
            }
            for (const report of stage.reports ?? []) {
              if (!stageReportsMap.has(report.id)) {
                stageReportsMap.set(report.id, report)
              }
            }
            const stageReports = Array.from(stageReportsMap.values())

            let stageTotalCheckboxes = 0
            let stageCheckedCheckboxes = 0

            for (const report of stageReports) {
              const checklist = report.content?.checklist ?? []
              for (const item of checklist) {
                stageTotalCheckboxes++
                if (item.checked || item.result === "pass") {
                  stageCheckedCheckboxes++
                }
              }
            }

            const stageCheckboxPercentage =
              stageTotalCheckboxes > 0 ? Math.round((stageCheckedCheckboxes / stageTotalCheckboxes) * 100) : 0

            return (
              <Card key={stage.id} className="gap-0 overflow-hidden py-0 shadow-sm border-slate-200/80 dark:border-slate-800">
                <CardHeader className="border-b bg-slate-50/50 px-4 py-3.5 dark:bg-slate-900/50 sm:px-5">
                  <div className="flex w-full items-center justify-between gap-4">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() =>
                        setOpenStages((current) => {
                          const next = new Set(current)
                          if (next.has(stage.id)) next.delete(stage.id)
                          else next.add(stage.id)
                          return next
                        })
                      }
                      className="flex min-w-0 flex-1 items-center gap-3 text-start group"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4 flip-rtl" />}
                      </span>
                      <CardTitle className="truncate text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                        {cleanStageName}
                      </CardTitle>
                      <span className="rounded-full bg-slate-200/60 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400 whitespace-nowrap">
                        {stageReports.length} {copy.reports}
                      </span>
                    </button>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {stageCheckedCheckboxes} / {stageTotalCheckboxes} ({stageCheckboxPercentage}%)
                      </span>
                      <Link
                        href={`/projects/${data.project.id}/stages/${stage.id}/reports/new`}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "h-8 gap-1.5 px-3 text-xs font-semibold shrink-0 shadow-2xs hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Plus className="size-3.5" />
                        {copy.addReport}
                      </Link>
                    </div>
                  </div>
                </CardHeader>

                {open ? (
                  <CardContent className="p-0">
                    {stageReports.length ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {stageReports.map((report) => (
                          <div
                            key={report.id}
                            className="group/item flex flex-wrap items-center justify-between gap-4 p-4 transition-all duration-150 hover:bg-slate-50/80 dark:hover:bg-slate-900/60"
                          >
                            <div className="flex min-w-0 items-center gap-3.5">
                              <ReportStatusIcon status={report.status} />

                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <Link
                                    href={`/projects/${data.project.id}/stages/${stage.id}/reports/${report.id}`}
                                    className="font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-primary transition-colors truncate"
                                  >
                                    {report.reportTitle || report.reportNumber}
                                  </Link>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shadow-2xs",
                                      statusTone(report.status)
                                    )}
                                  >
                                    <span className="size-1.5 rounded-full bg-current" />
                                    {statusLabel(report.status, language)}
                                  </Badge>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                  <span className="font-mono font-medium rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {report.reportNumber}
                                  </span>
                                  <span>•</span>
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {language === "ar" ? `زيارة #${report.visitNumber}` : `Visit #${report.visitNumber}`}
                                  </span>
                                  {report.createdBy?.name ? (
                                    <>
                                      <span>•</span>
                                      <span className="inline-flex items-center gap-1">
                                        <User className="size-3 text-slate-400" />
                                        {report.createdBy.name}
                                      </span>
                                    </>
                                  ) : null}
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="size-3 text-slate-400" />
                                    {formatDate(report.createdAt, language)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <Link
                              href={`/projects/${data.project.id}/stages/${stage.id}/reports/${report.id}`}
                              className="h-8 shrink-0 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary transition-all duration-150 group-hover/item:bg-primary group-hover/item:text-white group-hover/item:shadow-sm inline-flex items-center gap-1.5"
                            >
                              <Eye className="size-3.5" />
                              <span>{copy.viewReport}</span>
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="p-6 text-center text-sm text-muted-foreground">{copy.noReports}</p>
                    )}
                  </CardContent>
                ) : null}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Metric({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-xl border bg-muted/25 px-2 py-3 text-center sm:px-3">
      <div className="text-lg font-semibold tabular-nums sm:text-xl">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}
