"use client"

import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  Calendar,
  ChevronDown,
  Check,
  Users,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/dashboard/page-header"
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
  dateRange?: DashboardDateRange
}

export function ReportsList({
  reports,
  totalReports,
  dateRange,
}: ReportsListProps) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()

  // Custom date range dialog state
  const [customOpen, setCustomOpen] = useState(false)
  const [from, setFrom] = useState(dateRange?.startDate ?? "")
  const [to, setTo] = useState(dateRange?.endDate ?? "")
  const [customError, setCustomError] = useState<string | null>(null)

  // Supervisor filter options derived dynamically from loaded report dataset
  const supervisorOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const r of reports) {
      const id = r.authorId || r.authorName
      if (id && !map.has(id)) {
        map.set(id, { id, name: r.authorName })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [reports])

  // Purely client-side supervisor selection (no DB query triggered)
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | null>(null)
  const [clientPage, setClientPage] = useState(1)

  // Auto-reset supervisor selection if not in new dataset
  useEffect(() => {
    if (selectedSupervisorId && !supervisorOptions.some((s) => s.id === selectedSupervisorId)) {
      setSelectedSupervisorId(null)
    }
  }, [supervisorOptions, selectedSupervisorId])

  // Reset page when supervisor filter or reports change
  useEffect(() => {
    setClientPage(1)
  }, [selectedSupervisorId, reports])

  useEffect(() => {
    if (dateRange?.preset === "custom") {
      setFrom(dateRange.startDate ?? "")
      setTo(dateRange.endDate ?? "")
    }
  }, [dateRange])

  const selectedSupervisor = supervisorOptions.find((s) => s.id === selectedSupervisorId)
  const supervisorLabel = selectedSupervisor ? selectedSupervisor.name : "All Supervisors"

  // Date range label
  let dateLabel = "Today"
  if (dateRange?.preset === "yesterday") {
    dateLabel = "Yesterday"
  } else if (dateRange?.preset === "thisMonth") {
    dateLabel = "Current Month"
  } else if (dateRange?.preset === "custom") {
    dateLabel = dateRange.label || "Custom Range"
  }

  function handlePresetSelect(preset: "today" | "yesterday" | "thisMonth") {
    const params = new URLSearchParams()
    params.set("range", preset)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function openCustomRange() {
    setCustomError(null)
    setFrom(dateRange?.startDate ?? "")
    setTo(dateRange?.endDate ?? "")
    setCustomOpen(true)
  }

  function applyCustomRange() {
    if (!from || !to) {
      setCustomError("Choose both From and To dates.")
      return
    }
    if (from > to) {
      setCustomError("From date must be on or before To date.")
      return
    }
    const params = new URLSearchParams()
    params.set("range", "custom")
    params.set("from", from)
    params.set("to", to)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    setCustomOpen(false)
  }

  // Locally filtered reports based on selected supervisor
  const filteredReports = useMemo(() => {
    if (!selectedSupervisorId) return reports
    return reports.filter((r) => (r.authorId || r.authorName) === selectedSupervisorId)
  }, [reports, selectedSupervisorId])

  // Client-side pagination
  const PAGE_SIZE = 30
  const totalFilteredReports = filteredReports.length
  const totalPages = Math.max(1, Math.ceil(totalFilteredReports / PAGE_SIZE))
  const currentPage = Math.min(clientPage, totalPages)

  const displayedReports = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredReports.slice(start, start + PAGE_SIZE)
  }, [filteredReports, currentPage])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader
          title={t.reports.title}
          subtitle={t.reports.subtitle}
        />
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Date Range Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`Date filter: ${dateLabel}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Calendar className="size-4 text-muted-foreground" />
                  <span>{dateLabel}</span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => handlePresetSelect("today")}
                className="justify-between"
              >
                <span>Today</span>
                {dateRange?.preset === "today" || !dateRange?.preset ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => handlePresetSelect("yesterday")}
                className="justify-between"
              >
                <span>Yesterday</span>
                {dateRange?.preset === "yesterday" ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => handlePresetSelect("thisMonth")}
                className="justify-between"
              >
                <span>Current Month</span>
                {dateRange?.preset === "thisMonth" ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={openCustomRange}
                className="justify-between"
              >
                <span>Custom Date Range</span>
                {dateRange?.preset === "custom" ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Supervisor Filter Dropdown (Derived dynamically from loaded reports, filtered in-memory) */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`Supervisor filter: ${supervisorLabel}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Users className="size-4 text-muted-foreground" />
                  <span className="max-w-[170px] truncate">{supervisorLabel}</span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
              <DropdownMenuItem
                onClick={() => setSelectedSupervisorId(null)}
                className="justify-between font-medium"
              >
                <span>All Supervisors</span>
                {!selectedSupervisorId ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </DropdownMenuItem>
              {supervisorOptions.length > 0 && <DropdownMenuSeparator />}
              {supervisorOptions.map((sup) => (
                <DropdownMenuItem
                  key={sup.id}
                  onClick={() => setSelectedSupervisorId(sup.id)}
                  className="justify-between"
                >
                  <span className="truncate">{sup.name}</span>
                  {selectedSupervisorId === sup.id ? (
                    <Check className="size-4 text-primary" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Custom Date Range Modal Dialog */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom Date Range</DialogTitle>
            <DialogDescription>
              Choose inclusive start and end dates to filter reports.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2 py-2">
            <div className="grid gap-2">
              <Label htmlFor="reports-range-from">From Date</Label>
              <Input
                id="reports-range-from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value)
                  setCustomError(null)
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reports-range-to">To Date</Label>
              <Input
                id="reports-range-to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value)
                  setCustomError(null)
                }}
              />
            </div>
          </div>

          {customError ? <p className="text-xs text-destructive">{customError}</p> : null}

          <DialogFooter className="sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyCustomRange}>
              Apply Range
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {displayedReports.length ? (
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
                {displayedReports.map((report) => {
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
            {selectedSupervisorId
              ? "No supervisor reports match the selected supervisor."
              : "No supervisor reports match the selected date range."}
          </p>
        </Card>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
          <div className="text-muted-foreground">
            Showing <span className="font-medium text-foreground">{displayedReports.length}</span> of{" "}
            <span className="font-medium text-foreground">{totalFilteredReports}</span> reports
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setClientPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-4 me-1 flip-rtl" />
              Previous
            </Button>

            <span className="px-2 text-xs font-medium text-foreground">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setClientPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="size-4 ms-1 flip-rtl" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
