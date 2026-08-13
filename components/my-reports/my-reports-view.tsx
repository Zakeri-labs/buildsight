"use client"

import Link from "next/link"
import { useState, useMemo } from "react"
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Clock3,
  FilePlus,
  FileText,
  Filter,
  FolderKanban,
  Search,
  X,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { MyReportItem } from "@/lib/my-reports/server"
import { cn } from "@/lib/utils"

function formatDateTime(isoString: string) {
  try {
    const date = new Date(isoString)
    const formattedDate = date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    const formattedTime = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    return { date: formattedDate, time: formattedTime }
  } catch {
    return { date: "—", time: "" }
  }
}

function ReportStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  if (normalized === "approved" || normalized === "completed") {
    return (
      <Badge variant="outline" className="gap-1 border-green-300/80 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/50 dark:text-green-300">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        <span>Approved</span>
      </Badge>
    )
  }
  if (normalized === "submitted" || normalized === "pending_review" || normalized === "under_review") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-300/80 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
        <Clock3 className="size-3" aria-hidden="true" />
        <span>Pending Review</span>
      </Badge>
    )
  }
  if (normalized === "rejected") {
    return (
      <Badge variant="outline" className="gap-1 border-red-300/80 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
        <XCircle className="size-3" aria-hidden="true" />
        <span>Rejected</span>
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      <FileText className="size-3" aria-hidden="true" />
      <span>Draft</span>
    </Badge>
  )
}

export function MyReportsView({ reports }: { reports: MyReportItem[] }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const matchSearch =
        !searchQuery.trim() ||
        r.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.projectCode && r.projectCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
        r.reportTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.stageName.toLowerCase().includes(searchQuery.toLowerCase())

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "approved" && (r.status === "approved" || r.status === "completed")) ||
        (statusFilter === "pending" && (r.status === "submitted" || r.status === "pending_review" || r.status === "under_review")) ||
        (statusFilter === "draft" && r.status === "draft") ||
        (statusFilter === "rejected" && r.status === "rejected")

      return matchSearch && matchStatus
    })
  }, [reports, searchQuery, statusFilter])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Recent Reports</h1>
            <Badge variant="secondary" className="font-semibold">
              {filteredReports.length} {filteredReports.length === 1 ? "Report" : "Reports"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Chronological log of submitted &amp; drafted reports across your supervised projects.
          </p>
        </div>

        <Link
          href="/report-entry"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
        >
          <FilePlus className="size-4" />
          <span>New Report</span>
        </Link>
      </div>

      {/* Search & Status Filter Controls */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by project, code, or report title..."
            className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-8 text-xs font-medium outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "all", label: "All" },
            { id: "approved", label: "Approved" },
            { id: "pending", label: "Pending" },
            { id: "draft", label: "Draft" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                "h-8 rounded-lg px-3 text-xs font-medium transition-colors shrink-0",
                statusFilter === tab.id
                  ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                  : "border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Report List */}
      {filteredReports.length > 0 ? (
        <div className="space-y-2.5">
          {filteredReports.map((report) => {
            const dt = formatDateTime(report.createdAt)
            return (
              <Card
                key={report.id}
                className="group relative overflow-hidden py-0 border border-border shadow-2xs transition-all hover:border-primary/40 hover:shadow-xs active:scale-[0.99]"
              >
                <Link
                  href={report.href}
                  className="block min-w-0 p-3.5 sm:p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                    {/* Left Details */}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {/* Date / Time & Status Row */}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <div className="inline-flex items-center gap-1 font-medium text-foreground">
                          <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                          <span>{dt.date}</span>
                        </div>
                        {dt.time ? (
                          <div className="inline-flex items-center gap-1">
                            <Clock className="size-3 text-muted-foreground" aria-hidden="true" />
                            <span className="tabular-nums">{dt.time}</span>
                          </div>
                        ) : null}
                        <ReportStatusBadge status={report.status} />
                      </div>

                      {/* Project Name & Code */}
                      <div className="flex min-w-0 items-baseline gap-2">
                        <h2 className="truncate text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                          {report.projectName}
                        </h2>
                        {report.projectCode ? (
                          <span className="truncate font-mono text-[11px] text-muted-foreground">
                            · {report.projectCode}
                          </span>
                        ) : null}
                      </div>

                      {/* Stage & Title / Visit */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="secondary" className="font-semibold text-[11px]">
                          {report.stageName}
                        </Badge>
                        <span className="font-semibold text-foreground truncate max-w-xs sm:max-w-md">
                          {report.reportTitle}
                        </span>
                        {report.visitNumber ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Visit #{report.visitNumber}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Right Chevron Action Icon */}
                    <div className="flex items-center justify-end sm:self-center">
                      <div className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-all group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                        <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </div>
                </Link>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card size="sm">
          <CardContent className="flex min-h-52 flex-col items-center justify-center px-5 py-8 text-center">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <FolderKanban className="size-6" aria-hidden="true" />
            </div>
            <h2 className="font-semibold text-foreground">No reports found</h2>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your search query or status filter."
                : "Submitted and drafted inspection reports for your supervised projects will appear here."}
            </p>
            {searchQuery || statusFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  setStatusFilter("all")
                }}
                className="mt-3 text-xs font-semibold text-primary underline underline-offset-4"
              >
                Reset filters
              </button>
            ) : (
              <Link
                href="/report-entry"
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
              >
                <FilePlus className="size-4" />
                <span>Create First Report</span>
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
