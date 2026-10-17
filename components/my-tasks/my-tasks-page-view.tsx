"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowLeft, CheckCircle2, ClipboardList, Search, X } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { TaskRow } from "@/lib/db/domain"
import { ReviewTask, SiteVisitTask, CcTask, StandardTask } from "@/components/dashboard/my-tasks"

type FilterType = "all" | "Review" | "Site Visit" | "CC"

export function MyTasksPageView({ tasks }: { tasks: TaskRow[] }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<FilterType>("all")

  const counts = useMemo(() => {
    return {
      all: tasks.length,
      Review: tasks.filter((t) => t.type === "Review").length,
      "Site Visit": tasks.filter((t) => t.type === "Site Visit").length,
      CC: tasks.filter((t) => t.type === "CC").length,
    }
  }, [tasks])

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return tasks.filter((task) => {
      if (activeFilter !== "all" && task.type !== activeFilter) {
        return false
      }
      if (!q) return true

      const matchProject = task.projectName?.toLowerCase().includes(q)
      const matchTitle = task.reportTitle?.toLowerCase().includes(q)
      const matchRef = task.reference?.toLowerCase().includes(q)
      const matchAction = task.action?.toLowerCase().includes(q)
      const matchStage = task.stageName?.toLowerCase().includes(q)
      const matchTerm = task.parentTermName?.toLowerCase().includes(q) || task.subtermName?.toLowerCase().includes(q)
      const matchUser = task.submittedBy?.toLowerCase().includes(q) || task.requestedBy?.toLowerCase().includes(q) || task.ccAddedBy?.toLowerCase().includes(q)

      return matchProject || matchTitle || matchRef || matchAction || matchStage || matchTerm || matchUser
    })
  }, [tasks, activeFilter, searchQuery])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-20 md:pb-8">
      {/* Back button and page header */}
      <div className="flex flex-col gap-2 pt-1">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground w-fit"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">My Tasks</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {filteredTasks.length}
            </span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by project, report, reference, or person..."
            className="h-10 w-full rounded-xl border border-input/80 bg-background pl-9 pr-9 text-xs font-medium outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 sm:text-sm"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: "all" as const, label: "All Tasks", count: counts.all },
            { id: "Review" as const, label: "Review Submissions", count: counts.Review },
            { id: "Site Visit" as const, label: "Site Visits", count: counts["Site Visit"] },
            { id: "CC" as const, label: "Report CC", count: counts.CC },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                activeFilter === tab.id
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px]",
                  activeFilter === tab.id
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      {filteredTasks.length > 0 ? (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-xl border border-border bg-card p-4 shadow-2xs transition-all hover:border-primary/40 hover:shadow-xs"
            >
              {task.type === "Review" ? (
                <ReviewTask task={task} />
              ) : task.type === "Site Visit" ? (
                <SiteVisitTask task={task} />
              ) : task.type === "CC" ? (
                <CcTask task={task} />
              ) : (
                <StandardTask task={task} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <Card size="sm">
          <CardContent className="flex min-h-52 flex-col items-center justify-center px-4 py-10 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              {searchQuery || activeFilter !== "all" ? (
                <ClipboardList className="size-6" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              )}
            </div>
            <h2 className="text-sm font-semibold text-foreground sm:text-base">
              {searchQuery || activeFilter !== "all" ? "No matching tasks found" : "All caught up!"}
            </h2>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {searchQuery || activeFilter !== "all"
                ? "Try adjusting your search query or switching filters to find what you're looking for."
                : "You have no pending tasks requiring action at this moment."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
