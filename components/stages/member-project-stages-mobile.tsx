"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { FileText, Plus } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import type { ProjectStageExecutionData } from "@/lib/db/project-stages"
import { cn } from "@/lib/utils"

type StageFilter = "all" | "reported" | "no-reports"

function cleanStageName(name: string) {
  return name.replace(/^\s*\d+[\.\s\-]+/, "").trim() || name
}

function stageNumber(name: string, sortOrder: number, index: number) {
  const prefixed = name.match(/^\s*(\d+)/)?.[1]
  const value = prefixed ?? (Number.isFinite(sortOrder) ? String(sortOrder) : String(index + 1))
  return value.padStart(2, "0")
}

function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date)
}

export function MemberProjectStagesMobile({ data }: { data: ProjectStageExecutionData }) {
  const [filter, setFilter] = useState<StageFilter>("all")

  const stages = useMemo(
    () => data.stages
      // Members may report only on Project Stages that already exist. Library-only
      // template fallbacks deliberately stay out of this launcher so reporting
      // cannot become an indirect Add Stage path.
      .filter((stage) => stage.templateStageId === null || stage.id !== stage.templateStageId)
      .map((stage, index) => ({
        stage,
        index,
        latestReport: stage.reports[0] ?? null,
        hasReports: stage.reports.length > 0,
      })),
    [data.stages],
  )

  const reportedCount = useMemo(() => stages.filter((item) => item.hasReports).length, [stages])
  const visibleStages = useMemo(() => {
    if (filter === "reported") return stages.filter((item) => item.hasReports)
    if (filter === "no-reports") return stages.filter((item) => !item.hasReports)
    return stages
  }, [filter, stages])

  return (
    <div className="space-y-3 pb-1">
      <section className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight tracking-tight">Stages</h1>
              <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{data.project.name}</p>
            </div>
            <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
              {stages.length} {stages.length === 1 ? "Stage" : "Stages"}
            </span>
          </div>
          {data.project.code ? (
            <p className="mt-1 max-w-full break-words text-[11px] leading-[1.25] text-muted-foreground [overflow-wrap:anywhere]">
              {data.project.code}
            </p>
          ) : null}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {reportedCount} Reported <span aria-hidden="true">·</span> {stages.length - reportedCount} No Reports
          </p>
        </div>
      </section>

      {stages.length ? (
        <>
          <div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-muted/20 p-0.5" aria-label="Filter stages by report history">
            {([
              ["all", "All"],
              ["reported", "Reported"],
              ["no-reports", "No Reports"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={cn(
                  "min-w-0 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
                  filter === value ? "bg-background text-primary shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {visibleStages.length ? (
              <div className="divide-y">
                {visibleStages.map(({ stage, index }) => {
                  const reportsCount = stage.reports.length
                  const totalItems = (stage.terms ?? []).reduce((acc, t) => acc + 1 + (t.subterms?.length || 0), 0) || 10
                  const completedItems = (stage.terms ?? []).reduce((acc, t) => {
                    let count = t.response || t.status === "completed" ? 1 : 0
                    if (t.subterms) {
                      for (const st of t.subterms) {
                        if (st.response || st.status === "completed") count++
                      }
                    }
                    return acc + count
                  }, 0)
                  const percentage = Math.min(100, Math.max(0, Math.round((completedItems / Math.max(1, totalItems)) * 100)))

                  return (
                    <div
                      key={stage.id}
                      className="grid min-h-[3.8rem] grid-cols-[2.25rem_minmax(0,1fr)_4.65rem] items-center gap-2 px-2.5 py-2"
                    >
                      <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold tabular-nums text-primary">
                        {stageNumber(stage.name, stage.sortOrder, index)}
                      </div>

                      <div className="min-w-0 self-center">
                        <p className="line-clamp-2 text-[13px] font-semibold leading-[1.15rem] text-foreground">
                          {cleanStageName(stage.name)}
                        </p>
                        <div className="mt-1 space-y-1">
                          <p className="text-[11px] font-medium leading-none text-muted-foreground">
                            {reportsCount} {reportsCount === 1 ? "Report" : "Reports"} · {completedItems}/{totalItems} · {percentage}%
                          </p>
                          <div className="h-1 w-full max-w-[130px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-stretch gap-1">
                        <Link
                          href={`/projects/${data.project.id}/stages/${stage.id}`}
                          aria-label={`View stage reports for ${cleanStageName(stage.name)}`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-7 w-full gap-1 px-1.5 text-[10px] font-medium",
                          )}
                        >
                          <FileText className="size-3" aria-hidden="true" />
                          Reports
                        </Link>
                        <Link
                          href={`/projects/${data.project.id}/stages/${stage.id}/reports/new`}
                          aria-label={`Start Report for ${cleanStageName(stage.name)}`}
                          className={cn(
                            buttonVariants({ size: "sm" }),
                            "h-7 w-full gap-0.5 px-1.5 text-[10px] font-semibold",
                          )}
                        >
                          <Plus className="size-3" aria-hidden="true" />
                          Report
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No stages match this filter.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          <p className="font-medium text-foreground">No active project stages are available.</p>
          <p className="mt-1 text-sm text-muted-foreground">An administrator can activate the construction stages used by this project.</p>
        </div>
      )}
    </div>
  )
}
