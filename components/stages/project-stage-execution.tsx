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
import type { ProjectStageExecutionData, ProjectStageTermExecution } from "@/lib/db/project-stages"
import { statusLabel, statusTone } from "@/lib/stages/execution"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"

const COPY = {
  en: {
    title: "Project Stages",
    subtitle: "Track construction lifecycle reports, responsibilities, and approvals.",
    complete: "complete",
    completed: "completed",
    remaining: "remaining",
    required: "Required",
    optional: "Optional",
    overdue: "Overdue",
    responsible: "Responsible",
    unassigned: "Unassigned",
    approval: "Approval",
    requiredApproval: "Required",
    noApproval: "Not required",
    pendingApproval: "Pending approval",
    noStages: "No project stages are available.",
    noStagesHint: "Run the latest Supabase migration so project stages can be instantiated from the stage templates.",
    openReport: "Open report",
  },
  ar: {
    title: "مراحل المشروع",
    subtitle: "متابعة تقارير دورة حياة الإنشاء والمسؤوليات والموافقات.",
    complete: "مكتمل",
    completed: "مكتمل",
    remaining: "متبقٍ",
    required: "إلزامي",
    optional: "اختياري",
    overdue: "متأخر",
    responsible: "المسؤول",
    unassigned: "غير معيّن",
    approval: "الموافقة",
    requiredApproval: "مطلوبة",
    noApproval: "غير مطلوبة",
    pendingApproval: "بانتظار الموافقة",
    noStages: "لا توجد مراحل متاحة لهذا المشروع.",
    noStagesHint: "نفّذ آخر ترحيل لقاعدة بيانات Supabase لإنشاء مراحل المشروع من القوالب.",
    openReport: "فتح التقرير",
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

function approvalText(
  term: ProjectStageTermExecution,
  copy: (typeof COPY)["en"] | (typeof COPY)["ar"],
  locale: "en" | "ar",
) {
  if (!term.approvalRequired) return copy.noApproval
  if (term.status === "approved") return statusLabel("approved", locale)
  if (term.status === "rejected") return statusLabel("rejected", locale)
  if (term.status === "submitted" || term.status === "under_review") return copy.pendingApproval
  return copy.requiredApproval
}

export function ProjectStageExecutionView({ data }: { data: ProjectStageExecutionData }) {
  const { locale } = useI18n()
  const copy = COPY[locale]
  const [openStages, setOpenStages] = useState<Set<string>>(() => new Set(data.stages.slice(0, 2).map((stage) => stage.id)))

  const totals = useMemo(() => {
    const terms = data.stages.flatMap((stage) => stage.terms)
    const completed = terms.filter(isComplete).length
    const percentage = terms.length ? Math.round((completed / terms.length) * 100) : 0
    return { total: terms.length, completed, remaining: Math.max(0, terms.length - completed), percentage }
  }, [data.stages])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <ClipboardCheck className="size-4" />
            {data.project.name}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="grid min-w-[270px] grid-cols-3 gap-3">
          <Metric value={totals.total} label={copy.complete === "complete" ? "Reports" : "التقارير"} />
          <Metric value={totals.completed} label={copy.completed} />
          <Metric value={`${totals.percentage}%`} label={locale === "ar" ? "نسبة الإنجاز" : "Progress"} />
        </div>
      </div>

      {data.stages.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <FileCheck2 className="mb-4 size-10 text-muted-foreground" />
            <h2 className="font-semibold">{copy.noStages}</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{copy.noStagesHint}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {data.stages.map((stage) => {
            const open = openStages.has(stage.id)
            const completed = stage.terms.filter(isComplete).length
            const total = stage.terms.length
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
                    <div className="divide-y">
                      {stage.terms.map((term) => (
                        <TermRow key={term.id} projectId={data.project.id} stageId={stage.id} term={term} copy={copy} locale={locale} />
                      ))}
                    </div>
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

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border bg-muted/25 px-3 py-3 text-center">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}

function TermRow({
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
  const overdue = isOverdue(term)
  const complete = isComplete(term)
  const translationAvailable = Boolean(term.response && term.translation?.status === "completed")

  return (
    <div className="px-4 py-4 transition-colors hover:bg-muted/35 sm:px-5">
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center">
        <Link
          href={`/projects/${projectId}/stages/${stageId}/terms/${term.id}`}
          className="group grid min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(260px,1.4fr)_minmax(180px,0.8fr)_minmax(150px,0.65fr)_auto] lg:items-center"
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
                <Badge variant="outline" className={term.required ? "border-amber-200 bg-amber-50 text-amber-700" : "text-muted-foreground"}>
                  {term.required ? copy.required : copy.optional}
                </Badge>
                <Badge variant="outline" className={statusTone(term.status)}>{statusLabel(term.status, locale)}</Badge>
                {overdue ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">{copy.overdue}</Badge> : null}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 text-sm">
            {term.response?.createdBy || term.responsibleUser ? (
              (() => {
                const user = term.response?.createdBy ?? term.responsibleUser!
                const roleText = user.role || "Admin"
                return (
                  <>
                    <Avatar>
                      {user.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(user.avatarUrl)} alt="" /> : null}
                      <AvatarFallback>{initials(user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{roleText}</p>
                    </div>
                  </>
                )
              })()
            ) : term.responsibleOrganization ? (
              <>
                <Building2 className="size-4 text-muted-foreground" />
                <span className="truncate">{term.responsibleOrganization.name}</span>
              </>
            ) : (
              <>
                <UserRound className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">{copy.unassigned}</span>
              </>
            )}
          </div>

          {term.status === "approved" ? (
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-xs text-muted-foreground">{copy.approval}</p>
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">{statusLabel("approved", locale)}</p>
              </div>
            </div>
          ) : term.status === "rejected" ? (
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-xs text-muted-foreground">{copy.approval}</p>
                <p className="font-semibold text-red-700 dark:text-red-300">{statusLabel("rejected", locale)}</p>
              </div>
            </div>
          ) : term.status === "submitted" || term.status === "under_review" ? (
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-xs text-muted-foreground">{copy.approval}</p>
                <p className="font-semibold text-amber-700 dark:text-amber-300">{copy.pendingApproval}</p>
              </div>
            </div>
          ) : !term.approvalRequired ? (
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-muted-foreground/60" />
              <div>
                <p className="text-xs text-muted-foreground">{copy.approval}</p>
                <p className="font-medium text-muted-foreground">{copy.noApproval}</p>
              </div>
            </div>
          ) : (
            <div className="hidden min-w-[120px] lg:block" />
          )}

          <div className="flex items-center justify-between gap-3 lg:justify-end">
            {term.dueDate ? (
              <span className={cn("inline-flex items-center gap-1 text-xs", overdue ? "font-semibold text-red-600" : "text-muted-foreground")}>
                <Clock3 className="size-3.5" />
                {new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${term.dueDate}T00:00:00`))}
              </span>
            ) : null}
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </div>
        </Link>
      </div>
    </div>
  )
}
