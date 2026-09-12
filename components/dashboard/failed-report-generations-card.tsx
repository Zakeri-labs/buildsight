"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { FailedReportGenerationItem } from "@/lib/dashboard/failed-report-generations-server"
import { getFailedReportGenerationsAction } from "@/lib/actions/failed-report-generations"
import {
  enqueueStageTranslationJob,
  processStageTranslationJob,
} from "@/lib/stage-translations/client-auto-generation"

function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "—"
  const date = new Date(isoString)
  const time = date.getTime()
  if (Number.isNaN(time)) return "—"

  const now = Date.now()
  const diffInMs = Math.max(0, now - time)
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60))
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

  if (diffInMinutes < 1) return "just now"
  if (diffInMinutes === 1) return "1 minute ago"
  if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`
  if (diffInHours === 1) return "1 hour ago"
  if (diffInHours < 24) return `${diffInHours} hours ago`
  if (diffInDays === 1) return "Yesterday"
  if (diffInDays < 30) return `${diffInDays} days ago`

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function renderStatusBadge(item: FailedReportGenerationItem) {
  if (item.translationStatus === "failed") {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1.5 border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
      >
        <span className="size-1.5 rounded-full bg-red-600" />
        Generation Failed
      </Badge>
    )
  }

  if (item.translationStatus === "pending") {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1.5 border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
      >
        <span className="size-1.5 rounded-full bg-amber-500" />
        Translation Pending
      </Badge>
    )
  }

  if (!item.bilingualPdfUrl) {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1.5 border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
      >
        <span className="size-1.5 rounded-full bg-red-600" />
        Missing Bilingual PDF
      </Badge>
    )
  }

  if (!item.originalPdfUrl) {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1.5 border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300"
      >
        <span className="size-1.5 rounded-full bg-orange-500" />
        Missing English PDF
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className="inline-flex items-center gap-1.5 border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
    >
      <span className="size-1.5 rounded-full bg-red-600" />
      Missing PDF
    </Badge>
  )
}

export function FailedReportGenerationsCard({
  initialData,
  orgId,
  projectId,
}: {
  initialData: FailedReportGenerationItem[]
  orgId: string | null
  projectId?: string | null
}) {
  const [items, setItems] = useState<FailedReportGenerationItem[]>(initialData)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set())
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      const res = await getFailedReportGenerationsAction({ orgId, projectId })
      if (res.data) {
        setItems(res.data)
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  function handleDownload(item: FailedReportGenerationItem, kind: "original" | "bilingual") {
    const params = new URLSearchParams({
      projectId: item.projectId,
      translationId: item.translationId,
      kind,
    })
    window.open(`/api/stage-translations/pdf?${params.toString()}`, "_blank")
  }

  async function handleRetry(item: FailedReportGenerationItem) {
    setRetryingIds((prev) => new Set(prev).add(item.responseId))
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[item.responseId]
      return next
    })

    try {
      const job = {
        projectId: item.projectId,
        stageId: item.projectStageId,
        responseId: item.responseId,
        retry: true,
      }

      enqueueStageTranslationJob(job)
      await processStageTranslationJob(job)

      // Refresh list to remove resolved items
      const res = await getFailedReportGenerationsAction({ orgId, projectId })
      if (res.data) {
        setItems(res.data)
      } else {
        setItems((prev) => prev.filter((r) => r.responseId !== item.responseId))
      }
    } catch (err) {
      console.error("[FailedReportGenerationsCard] Retry error:", err)
      setRowErrors((prev) => ({
        ...prev,
        [item.responseId]: err instanceof Error ? err.message : "Retry failed",
      }))
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.responseId)
        return next
      })
    }
  }

  const count = items.length

  return (
    <div className="flex w-full flex-col rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Failed Report Generations</h2>
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
              >
                {count}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reports requiring attention because PDF files are missing or generation failed.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8 gap-1.5 px-3 text-xs font-medium"
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      <div className="mt-4 min-w-0">
        {count > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
                  <th className="py-2.5 pe-4 ps-1">Report</th>
                  <th className="px-4 py-2.5">Project</th>
                  <th className="px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5">Visit No</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Updated</th>
                  <th className="py-2.5 pe-1 ps-4 text-end">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.map((item) => {
                  const isRetrying = retryingIds.has(item.responseId)
                  const errorMsg = rowErrors[item.responseId]
                  const reportUrl = `/projects/${item.projectId}/stages/${item.projectStageId}/reports/${item.responseId}`
                  const hasOriginalPdf = Boolean(item.originalPdfUrl)
                  const hasBilingualPdf = Boolean(item.bilingualPdfUrl)

                  return (
                    <tr key={item.translationId} className="transition-colors hover:bg-muted/30">
                      <td className="py-3 pe-4 ps-1 align-middle">
                        <Link
                          href={reportUrl}
                          title={item.reportTitle}
                          className="group inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary hover:underline"
                        >
                          <span className="truncate max-w-[220px]">{item.reportTitle}</span>
                          <span className="text-xs text-muted-foreground transition-transform group-hover:translate-x-0.5">
                            →
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <p className="font-medium text-foreground">{item.projectName}</p>
                        <p className="text-xs text-muted-foreground">{item.projectCode || "—"}</p>
                      </td>
                      <td className="px-4 py-3 align-middle text-sm text-foreground">
                        {item.stageName}
                      </td>
                      <td className="px-4 py-3 align-middle text-sm text-muted-foreground">
                        {item.visitNumber ? `#${item.visitNumber}` : "—"}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {renderStatusBadge(item)}
                      </td>
                      <td className="px-4 py-3 align-middle text-xs tabular-nums text-muted-foreground">
                        {formatRelativeTime(item.updatedAt)}
                      </td>
                      <td className="py-3 pe-1 ps-4 text-end align-middle">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!hasOriginalPdf}
                              onClick={() => handleDownload(item, "original")}
                              title={hasOriginalPdf ? "Download English PDF" : "English PDF unavailable"}
                              className="h-8 gap-1 px-2.5 text-xs font-semibold disabled:opacity-40"
                            >
                              <Download className="size-3.5 shrink-0" />
                              <span>EN</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!hasBilingualPdf}
                              onClick={() => handleDownload(item, "bilingual")}
                              title={hasBilingualPdf ? "Download Bilingual PDF" : "Bilingual PDF unavailable"}
                              className="h-8 gap-1 px-2.5 text-xs font-semibold disabled:opacity-40"
                            >
                              <Download className="size-3.5 shrink-0" />
                              <span>EN / AR</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRetry(item)}
                              disabled={isRetrying}
                              title="Retry PDF generation"
                              className="h-8 gap-1 px-2.5 text-xs font-semibold"
                            >
                              {isRetrying ? (
                                <>
                                  <Loader2 className="size-3.5 animate-spin shrink-0" />
                                  <span>Generating...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="size-3.5 shrink-0" />
                                  <span>Retry</span>
                                </>
                              )}
                            </Button>
                          </div>
                          {errorMsg ? (
                            <span className="text-[11px] text-red-600 dark:text-red-400 max-w-[240px] truncate" title={errorMsg}>
                              {errorMsg}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <CheckCircle2 className="size-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">
              All reports are generated successfully.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              No reports requiring PDF generation attention.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
