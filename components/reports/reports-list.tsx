"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { FileText, ChevronLeft, ChevronRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PageHeader } from "@/components/dashboard/page-header"
import { DateRangePill } from "@/components/dashboard/date-range-pill"
import { ToneBadge } from "@/components/status-badge"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { DashboardDateRange } from "@/lib/dashboard/date-range"
import type { ListReportItem } from "@/lib/db/reports-list"

function formatSubmissionDate(iso: string | null) {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function statusTone(status: string): "info" | "primary" | "success" | "warning" | "destructive" {
  switch (status.toLowerCase()) {
    case "approved":
    case "completed":
      return "success"
    case "submitted":
      return "info"
    case "under_review":
      return "primary"
    case "rejected":
      return "destructive"
    default:
      return "info"
  }
}

export type ReportsListProps = {
  reports: ListReportItem[]
  totalReports: number
  currentPage: number
  totalPages: number
  dateRange?: DashboardDateRange
}

export function ReportsList({
  reports,
  totalReports,
  currentPage,
  totalPages,
  dateRange,
}: ReportsListProps) {
  const { t } = useI18n()
  const searchParams = useSearchParams()

  function pageUrl(page: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", String(page))
    return `/reports?${params.toString()}`
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          title={t.reports.title}
          subtitle={t.reports.subtitle}
        />
        {dateRange ? (
          <DateRangePill
            preset={dateRange.preset}
            label={dateRange.label}
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            showAllTime={false}
            ariaLabel={`Reports date range: ${dateRange.label}`}
            dialogDescription="Choose inclusive calendar dates for reports."
          />
        ) : null}
      </div>

      {reports.length ? (
        <Card className="min-w-0 overflow-hidden py-0 gap-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3.5 min-w-[220px]">Report</th>
                  <th scope="col" className="px-4 py-3.5 min-w-[160px]">Project</th>
                  <th scope="col" className="px-4 py-3.5 min-w-[140px]">Stage</th>
                  <th scope="col" className="px-4 py-3.5 min-w-[110px]">Date</th>
                  <th scope="col" className="px-4 py-3.5 min-w-[160px]">Submitted By</th>
                  <th scope="col" className="px-4 py-3.5 min-w-[110px]">Status</th>
                  <th scope="col" className="px-4 py-3.5 text-right min-w-[160px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reports.map((report) => {
                  const tone = statusTone(report.status)
                  const dateStr = formatSubmissionDate(report.submittedAt)

                  return (
                    <tr key={report.id} className="transition-colors hover:bg-muted/30">
                      {/* 1. Report */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col min-w-0">
                          <Link
                            href={report.href}
                            className="font-semibold text-foreground hover:underline truncate max-w-[280px]"
                            title={report.reportTitle}
                          >
                            {report.reportTitle}
                          </Link>
                          {report.reportNumber ? (
                            <span className="font-mono text-xs text-muted-foreground truncate">
                              #{report.reportNumber}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* 2. Project */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-foreground truncate max-w-[200px]" title={report.projectName}>
                            {report.projectName}
                          </span>
                          {report.projectCode ? (
                            <span className="font-mono text-xs text-muted-foreground truncate">
                              {report.projectCode}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* 3. Stage */}
                      <td className="px-4 py-3 align-middle">
                        <span className="text-muted-foreground truncate max-w-[180px] block text-xs" title={report.stageName}>
                          {report.stageName}
                        </span>
                      </td>

                      {/* 4. Date */}
                      <td className="px-4 py-3 align-middle whitespace-nowrap text-xs text-muted-foreground">
                        {dateStr}
                      </td>

                      {/* 5. Submitted By */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="size-6 shrink-0">
                            <AvatarFallback className="text-[10px]">{report.authorInitials}</AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-foreground truncate max-w-[140px]" title={report.authorName}>
                            {report.authorName}
                          </span>
                        </div>
                      </td>

                      {/* 6. Status */}
                      <td className="px-4 py-3 align-middle whitespace-nowrap">
                        <ToneBadge tone={tone}>
                          {report.status.replace("_", " ")}
                        </ToneBadge>
                      </td>

                      {/* 7. Actions */}
                      <td className="px-4 py-3 align-middle text-right whitespace-nowrap">
                        <Link
                          href={report.href}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs")}
                        >
                          {t.reports.viewReport}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <FileText className="mx-auto size-12 text-muted-foreground/60" />
          <h3 className="mt-4 text-base font-semibold text-foreground">No reports found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No supervisor reports have been submitted yet.
          </p>
        </Card>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
          <div className="text-muted-foreground">
            Showing <span className="font-medium text-foreground">{reports.length}</span> of{" "}
            <span className="font-medium text-foreground">{totalReports}</span> reports
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={pageUrl(currentPage - 1)}
              aria-disabled={currentPage <= 1}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                currentPage <= 1 && "pointer-events-none opacity-50",
              )}
            >
              <ChevronLeft className="size-4 me-1 flip-rtl" />
              Previous
            </Link>

            <span className="px-2 text-xs font-medium text-foreground">
              Page {currentPage} of {totalPages}
            </span>

            <Link
              href={pageUrl(currentPage + 1)}
              aria-disabled={currentPage >= totalPages}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                currentPage >= totalPages && "pointer-events-none opacity-50",
              )}
            >
              Next
              <ChevronRight className="size-4 ms-1 flip-rtl" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
