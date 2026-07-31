"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ManageProjectStagesButton } from "@/components/stages/project-stage-admin-controls"
import type { ProjectStageExecutionData, ProjectStageTermExecution } from "@/lib/db/project-stages"
import { statusLabel, statusTone, subtermResponseTypeLabel } from "@/lib/stages/execution"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"

const COPY = {
  en: {
    title: "Project Stages",
    subtitle: "Track construction lifecycle reports, responsibilities, and approvals.",
    complete: "complete",
    completed: "completed",
    required: "Required",
    optional: "Optional",
    overdue: "Overdue",
    unassigned: "Unassigned",
    approval: "Approval",
    noApproval: "Not required",
    pendingApproval: "Pending approval",
    noStages: "No active project stages are available.",
    noStagesHint: "An administrator can activate the construction stages used by this project.",
    noTerms: "No terms have been added to this stage.",
    openReport: "Open report",
    archived: "Archived",
    parentRecord: "Open existing parent record",
    subterms: "Sub-terms",
  },
  ar: {
    title: "مراحل المشروع",
    subtitle: "متابعة تقارير دورة حياة الإنشاء والمسؤوليات والموافقات.",
    complete: "مكتمل",
    completed: "مكتمل",
    required: "إلزامي",
    optional: "اختياري",
    overdue: "متأخر",
    unassigned: "غير معيّن",
    approval: "الموافقة",
    noApproval: "غير مطلوبة",
    pendingApproval: "بانتظار الموافقة",
    noStages: "لا توجد مراحل نشطة لهذا المشروع.",
    noStagesHint: "يمكن للمسؤول تفعيل مراحل الإنشاء المستخدمة في هذا المشروع.",
    noTerms: "لم تتم إضافة بنود إلى هذه المرحلة.",
    openReport: "فتح التقرير",
    archived: "مؤرشف",
    parentRecord: "فتح سجل البند الرئيسي الحالي",
    subterms: "البنود الفرعية",
  },
} as const

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"
}

function isComplete(term: ProjectStageTermExecution) {
  return term.status === "approved" || term.status === "completed"
}

function isOverdue(term: ProjectStageTermExecution) {
  if (!term.dueDate || isComplete(term)) return false
  const due = new Date(`${term.dueDate}T23:59:59`)
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now()
}

function actionableTerms(terms: ProjectStageTermExecution[]) {
  return terms.flatMap((term) => {
    const activeSubterms = term.subterms.filter((subterm) => subterm.isActive)
    return activeSubterms.length ? activeSubterms : [term]
  })
}

function progressTerms(terms: ProjectStageTermExecution[]) {
  const actionable = actionableTerms(terms).filter((term) => term.isActive)
  const required = actionable.filter((term) => term.required)
  return required.length ? required : actionable
}

export function ProjectStageExecutionView({ data }: { data: ProjectStageExecutionData }) {
  const { locale } = useI18n()
  const language: "en" | "ar" = locale === "ar" ? "ar" : "en"
  const copy = COPY[language]
  const [openStages, setOpenStages] = useState<Set<string>>(() => new Set(data.stages.slice(0, 2).map((stage) => stage.id)))

  const totals = useMemo(() => {
    const terms = data.stages.flatMap((stage) => progressTerms(stage.terms))
    const completed = terms.filter(isComplete).length
    const percentage = terms.length ? Math.round((completed / terms.length) * 100) : 0
    return { total: terms.length, completed, percentage }
  }, [data.stages])

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
        <div className="grid min-w-0 grid-cols-3 gap-2 sm:min-w-[270px] sm:gap-3">
          <Metric value={totals.total} label={language === "ar" ? "التقارير" : "Reports"} />
          <Metric value={totals.completed} label={copy.completed} />
          <Metric value={`${totals.percentage}%`} label={language === "ar" ? "نسبة الإنجاز" : "Progress"} />
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
        <div className="flex flex-col gap-4">
          {data.stages.map((stage) => {
            const open = openStages.has(stage.id)
            const stageTerms = progressTerms(stage.terms)
            const completed = stageTerms.filter(isComplete).length
            const total = stageTerms.length
            const percentage = total ? Math.round((completed / total) * 100) : 0
            return (
              <Card key={stage.id} className="gap-0 overflow-hidden py-0">
                <CardHeader className="border-b px-4 py-4 sm:px-5">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenStages((current) => {
                      const next = new Set(current)
                      if (next.has(stage.id)) next.delete(stage.id)
                      else next.add(stage.id)
                      return next
                    })}
                    className="flex w-full items-center gap-4 text-start"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {open ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5 flip-rtl" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="truncate text-base sm:text-lg">{stage.name}</CardTitle>
                        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{percentage}% {copy.complete}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={percentage} className="h-2 flex-1" />
                        <span className="whitespace-nowrap text-xs text-muted-foreground">{completed}/{total}</span>
                      </div>
                    </div>
                  </button>
                </CardHeader>

                {open ? (
                  <CardContent className="p-0">
                    {stage.terms.length ? (
                      <div className="divide-y">
                        {stage.terms.map((term) => (
                          <TermGroup key={term.id} projectId={data.project.id} stageId={stage.id} term={term} copy={copy} locale={language} />
                        ))}
                      </div>
                    ) : <p className="p-6 text-center text-sm text-muted-foreground">{copy.noTerms}</p>}
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

function TermGroup({
  projectId,
  stageId,
  term,
  copy,
  locale,
}: {
  projectId: string
  stageId: string
  term: ProjectStageTermExecution
  copy: (typeof COPY)["en"] | (typeof COPY)["ar"]
  locale: "en" | "ar"
}) {
  const [open, setOpen] = useState(true)
  const activeSubterms = term.subterms.filter((subterm) => subterm.isActive)
  const visibleSubterms = activeSubterms
  const hasSubterms = visibleSubterms.length > 0

  if (!hasSubterms) {
    return (
      <div className="flex items-center gap-1 px-4 py-4 transition-colors hover:bg-muted/35 sm:px-5">
        <TermLink projectId={projectId} stageId={stageId} term={term} copy={copy} locale={locale} />
      </div>
    )
  }

  const countedSubterms = (() => {
    const required = activeSubterms.filter((subterm) => subterm.required)
    return required.length ? required : activeSubterms
  })()
  const completed = countedSubterms.filter(isComplete).length
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-4 hover:bg-muted/30 sm:px-5">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-start">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4 flip-rtl" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold">{term.reportName}</p>
              <Badge variant="outline" className={term.required ? "border-amber-200 bg-amber-50 text-amber-700" : "text-muted-foreground"}>{term.required ? copy.required : copy.optional}</Badge>
              <Badge variant="outline" className={statusTone(term.status)}>{statusLabel(term.status, locale)}</Badge>
              <Badge variant="secondary">{activeSubterms.length} {copy.subterms}</Badge>
            </div>
            <div className="mt-2 flex max-w-xl items-center gap-3">
              <Progress value={countedSubterms.length ? Math.round((completed / countedSubterms.length) * 100) : 0} className="h-1.5 flex-1" />
              <span className="whitespace-nowrap text-xs text-muted-foreground">{completed} / {countedSubterms.length} {copy.complete}</span>
            </div>
          </div>
        </button>
        {term.response ? (
          <Link href={`/projects/${projectId}/stages/${stageId}/terms/${term.id}`} className="hidden text-xs font-medium text-primary hover:underline sm:inline">
            {copy.parentRecord}
          </Link>
        ) : null}
      </div>
      {open ? (
        <div className="border-t bg-muted/10 py-1 ps-6 sm:ps-10">
          {visibleSubterms.map((subterm) => (
            <div key={subterm.id} className="relative flex items-center gap-1 border-s border-border/70 px-3 py-3 pe-4 before:absolute before:start-0 before:top-1/2 before:w-3 before:border-t before:border-border/70 sm:px-5">
              {subterm.isActive ? (
                <TermLink projectId={projectId} stageId={stageId} term={subterm} copy={copy} locale={locale} compact />
              ) : (
                <div className="min-w-0 flex-1 opacity-65">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{subterm.reportName}</p>
                    <Badge variant="outline">{copy.archived}</Badge>
                    <Badge variant="outline" className={statusTone(subterm.status)}>{statusLabel(subterm.status, locale)}</Badge>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TermLink({
  projectId,
  stageId,
  term,
  copy,
  locale,
  compact = false,
}: {
  projectId: string
  stageId: string
  term: ProjectStageTermExecution
  copy: (typeof COPY)["en"] | (typeof COPY)["ar"]
  locale: "en" | "ar"
  compact?: boolean
}) {
  const overdue = isOverdue(term)
  const complete = isComplete(term)
  return (
    <Link
      href={`/projects/${projectId}/stages/${stageId}/terms/${term.id}`}
      className={cn("group grid min-w-0 flex-1 gap-3", compact ? "md:grid-cols-[minmax(220px,1.4fr)_minmax(160px,0.8fr)_auto] md:items-center" : "lg:grid-cols-[minmax(260px,1.4fr)_minmax(180px,0.8fr)_minmax(150px,0.65fr)_auto] lg:items-center")}
      aria-label={`${copy.openReport}: ${term.reportName}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border",
          complete ? "border-emerald-200 bg-emerald-50 text-emerald-600" : overdue ? "border-red-200 bg-red-50 text-red-600" : "border-slate-200 bg-white text-slate-400 dark:bg-slate-950",
        )}>
          {complete ? <CheckCircle2 className="size-4" /> : overdue ? <AlertTriangle className="size-4" /> : <Circle className="size-4" />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold group-hover:text-primary">{term.reportName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={term.required ? "border-amber-200 bg-amber-50 text-amber-700" : "text-muted-foreground"}>{term.required ? copy.required : copy.optional}</Badge>
            <Badge variant="outline" className={statusTone(term.status)}>{statusLabel(term.status, locale)}</Badge>
            {compact ? <Badge variant="secondary">{subtermResponseTypeLabel(term.responseType)}</Badge> : null}
            {overdue ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">{copy.overdue}</Badge> : null}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2 text-sm">
        {term.response?.createdBy || term.responsibleUser ? (() => {
          const user = term.response?.createdBy ?? term.responsibleUser!
          return (
            <>
              <Avatar>
                {user.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(user.avatarUrl)} alt="" /> : null}
                <AvatarFallback>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.role || "Admin"}</p>
              </div>
            </>
          )
        })() : term.responsibleOrganization ? (
          <><Building2 className="size-4 text-muted-foreground" /><span className="truncate">{term.responsibleOrganization.name}</span></>
        ) : (
          <><UserRound className="size-4 text-muted-foreground" /><span className="text-muted-foreground">{copy.unassigned}</span></>
        )}
      </div>

      {!compact ? (
        <div className="hidden items-center gap-2 text-sm lg:flex">
          <ShieldCheck className={cn("size-4", term.status === "approved" ? "text-emerald-600" : term.status === "rejected" ? "text-red-600" : "text-muted-foreground/60")} />
          <div>
            <p className="text-xs text-muted-foreground">{copy.approval}</p>
            <p className="font-medium">{term.status === "submitted" || term.status === "under_review" ? copy.pendingApproval : term.approvalRequired ? statusLabel(term.status, locale) : copy.noApproval}</p>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 md:justify-end">
        {term.dueDate ? (
          <span className={cn("inline-flex items-center gap-1 text-xs", overdue ? "font-semibold text-red-600" : "text-muted-foreground")}>
            <Clock3 className="size-3.5" />
            {new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${term.dueDate}T00:00:00`))}
          </span>
        ) : null}
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
      </div>
    </Link>
  )
}
