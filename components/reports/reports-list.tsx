"use client"

import Link from "next/link"
import { FileText, Download, ClipboardCheck, ChevronLeft, ChevronRight, Building2, MapPin } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PageHeader } from "@/components/dashboard/page-header"
import { ToneBadge } from "@/components/status-badge"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
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
  summary: {
    totalReports: number
    openIssues: number
  }
}

export function ReportsList({
  reports,
  totalReports,
  currentPage,
  totalPages,
  summary,
}: ReportsListProps) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.reports.title}
        subtitle={t.reports.subtitle}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard icon={FileText} label={t.reports.totalReports} value={summary.totalReports} tone="text-info" />
        <SummaryCard icon={ClipboardCheck} label={t.reports.openIssues} value={summary.openIssues} tone="text-destructive" />
      </div>

      {reports.length ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {reports.map((report) => {
            const tone = statusTone(report.status)
            const dateStr = formatSubmissionDate(report.submittedAt)

            return (
              <Card key={report.id} className="gap-0 transition-shadow hover:shadow-md">
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                      <FileText className="size-5" />
                    </span>
                    <div className="flex flex-col gap-1 min-w-0">
                      <CardTitle className="text-sm truncate" title={report.reportTitle}>
                        {report.reportTitle}
                      </CardTitle>
                      <div className="flex items-center gap-2 flex-wrap">
                        {report.reportNumber && (
                          <span className="font-mono text-xs text-muted-foreground">
                            #{report.reportNumber}
                          </span>
                        )}
                        <ToneBadge tone={tone}>
                          {report.status.replace("_", " ")}
                        </ToneBadge>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs shrink-0 text-muted-foreground">{dateStr}</span>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 truncate" title={report.projectName}>
                      <Building2 className="size-3.5 shrink-0 text-foreground/70" />
                      <span className="font-medium text-foreground truncate">{report.projectName}</span>
                      {report.projectCode && (
                        <span className="shrink-0 text-muted-foreground">({report.projectCode})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 truncate" title={report.stageName}>
                      <MapPin className="size-3.5 shrink-0 text-foreground/70" />
                      <span className="truncate">{report.stageName}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="size-6 shrink-0">
                        <AvatarFallback className="text-[10px]">{report.authorInitials}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground truncate">{report.authorName}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={report.href}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        {t.reports.viewReport}
                      </Link>
                      <Link
                        href={`${report.href}?pdf=1`}
                        target="_blank"
                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                        title="Export PDF"
                      >
                        <Download className="size-4" />
                        <span className="sr-only sm:not-sr-only sm:inline-block ms-1">
                          {t.reports.export}
                        </span>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
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
              href={`/reports?page=${currentPage - 1}`}
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
              href={`/reports?page=${currentPage + 1}`}
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

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: number
  tone: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <Icon className={`size-6 ${tone}`} />
        </span>
        <div className="flex flex-col">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  )
}
