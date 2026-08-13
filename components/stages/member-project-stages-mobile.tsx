"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Building2, FileText, Plus } from "lucide-react"

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

export function MemberProjectStagesMobile({ data }: { data: ProjectStageExecutionData }) {
  const [filter, setFilter] = useState<StageFilter>("all")

  const stages = useMemo(
    () =>
      data.stages
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

  const projectImageUrl = (data.project as any).imageUrl || (data.project as any).image || null

  return (
    <div className="space-y-3 pb-1">
      {/* 1. Stages title and count badge outside top card */}
      <div className="flex items-center justify-between gap-3 px-0.5 pt-0.5">
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Stages</h1>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {stages.length} {stages.length === 1 ? "Stage" : "Stages"}
        </span>
      </div>

      {/* 2. Project Card with cover image / building icon on left */}
      <section className="overflow-hidden rounded-xl border border-border bg-card p-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40 text-primary">
            {projectImageUrl ? (
              <img src={projectImageUrl} alt={data.project.name} className="size-full object-cover" />
            ) : (
              <Building2 className="size-6 text-primary" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold leading-tight text-foreground">{data.project.name}</h2>
            {data.project.code ? (
              <p className="truncate font-mono text-[11px] text-muted-foreground">{data.project.code}</p>
            ) : null}
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              {reportedCount} Reported <span aria-hidden="true">·</span> {stages.length - reportedCount} No Reports
            </p>
          </div>
        </div>
      </section>

      {/* 3. Filter tabs and stage list */}
      {stages.length ? (
        <>
          <div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-muted/20 p-0.5" aria-label="Filter stages by report history">
            {(
              [
                ["all", "All"],
                ["reported", "Reported"],
                ["no-reports", "No Reports"],
              ] as const
            ).map(([value, label]) => (
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

          <div className="overflow-hidden rounded-xl border bg-card shadow-2xs">
            {visibleStages.length ? (
              <div className="divide-y divide-border/70">
                {visibleStages.map(({ stage, index, hasReports }) => {
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
                      className="flex items-center justify-between gap-2.5 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold tabular-nums text-primary">
                          {stageNumber(stage.name, stage.sortOrder, index)}
                        </div>

                        <div className="min-w-0 self-center">
                          <p className="line-clamp-2 text-[13px] font-semibold leading-[1.15rem] text-foreground">
                            {cleanStageName(stage.name)}
                          </p>

                          {hasReports ? (
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
                          ) : (
                            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">No reports yet</p>
                          )}
                        </div>
                      </div>

                      {/* Right Action buttons */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        {hasReports ? (
                          <Link
                            href={`/projects/${data.project.id}/stages/${stage.id}`}
                            aria-label={`View stage reports for ${cleanStageName(stage.name)}`}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "h-7 gap-1 px-2 text-[10px] font-medium",
                            )}
                          >
                            <FileText className="size-3" aria-hidden="true" />
                            Reports
                          </Link>
                        ) : null}

                        <Link
                          href={`/projects/${data.project.id}/stages/${stage.id}/reports/new`}
                          aria-label={`Start Report for ${cleanStageName(stage.name)}`}
                          className={cn(
                            buttonVariants({ size: "sm" }),
                            "h-7 gap-0.5 px-2.5 text-[10px] font-semibold",
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
