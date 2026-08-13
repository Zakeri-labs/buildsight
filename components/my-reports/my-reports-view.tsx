"use client"

import Link from "next/link"
import { useState, useMemo } from "react"
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FolderKanban,
  Plus,
  Search,
  X,
  XCircle,
} from "lucide-react"

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

function ReportStatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  if (normalized === "approved" || normalized === "completed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        Approved
      </span>
    )
  }
  if (normalized === "submitted" || normalized === "pending_review" || normalized === "under_review") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
        <Clock3 className="size-3" aria-hidden="true" />
        Pending Review
      </span>
    )
  }
  if (normalized === "rejected") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
        <XCircle className="size-3" aria-hidden="true" />
        Rejected
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      <FileText className="size-3" aria-hidden="true" />
      Draft
    </span>
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
    <div className="mx-auto w-full max-w-3xl space-y-3 pb-20 md:pb-6">
      {/* Minimal Header */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Reports</h1>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            {filteredReports.length}
          </span>
        </div>

        <Link
          href="/report-entry"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 active:scale-95"
        >
          <Plus className="size-4" />
          <span>New Report</span>
        </Link>
      </div>

      {/* Search & Status Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search project or report title..."
            className="h-9 w-full rounded-xl border border-input/80 bg-background pl-8.5 pr-8 text-xs font-medium outline-none transition-all focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
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
                "h-7 rounded-lg px-2.5 text-[11px] font-medium transition-all shrink-0",
                statusFilter === tab.id
                  ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reports List */}
      {filteredReports.length > 0 ? (
        <div className="space-y-2">
          {filteredReports.map((report) => {
            const dt = formatDateTime(report.createdAt)
            return (
              <Card
                key={report.id}
                className="group relative overflow-hidden py-0 border border-border/70 bg-card shadow-2xs transition-all hover:border-primary/40 active:scale-[0.985]"
              >
                <Link
                  href={report.href}
                  className="block p-3 sm:p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex flex-col gap-1.5">
                    {/* Top Row: Project Name & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-xs font-bold text-foreground sm:text-sm group-hover:text-primary transition-colors">
                          {report.projectName}
                        </h2>
                        {report.projectCode ? (
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            {report.projectCode}
                          </p>
                        ) : null}
                      </div>

                      <ReportStatusPill status={report.status} />
                    </div>

                    {/* Middle Row: Stage & Report Title */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                        {report.stageName}
                      </span>
                      <span className="font-semibold text-foreground truncate max-w-xs text-[11px] sm:text-xs">
                        {report.reportTitle}
                      </span>
                      {report.visitNumber ? (
                        <span className="text-[10px] text-muted-foreground">
                          (Visit #{report.visitNumber})
                        </span>
                      ) : null}
                    </div>

                    {/* Bottom Row: Date/Time & Chevron */}
                    <div className="flex items-center justify-between border-t border-border/40 pt-1.5 mt-0.5 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="size-3 text-muted-foreground/70" />
                        <span>{dt.date}</span>
                        {dt.time ? <span className="tabular-nums">· {dt.time}</span> : null}
                      </div>

                      <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                  </div>
                </Link>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card size="sm">
          <CardContent className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <FolderKanban className="size-5" aria-hidden="true" />
            </div>
            <h2 className="text-xs font-semibold text-foreground sm:text-sm">No reports found</h2>
            <p className="mt-0.5 max-w-xs text-[11px] text-muted-foreground">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your search query or filter."
                : "Submitted and drafted inspection reports will appear here."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
