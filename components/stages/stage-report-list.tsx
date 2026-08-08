"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ClipboardList, FilePlus2, Search } from "lucide-react"
import { useCurrentUser } from "@/components/current-user-provider"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { statusLabel, statusTone, type ResponseStatus } from "@/lib/stages/execution"
import type { ProjectStageExecution } from "@/lib/db/project-stages"

const PAGE_SIZE = 20
const STATUS_OPTIONS: Array<{ value: "all" | ResponseStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
]

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value))
}

function reviewLabel(status: ResponseStatus, approvalRequired: boolean) {
  if (!approvalRequired) return "Not required"
  if (status === "approved" || status === "completed") return "Approved"
  if (status === "rejected") return "Rejected"
  if (status === "submitted" || status === "under_review") return "Pending review"
  return "Not submitted"
}

function cleanStageName(name: string) {
  return name.replace(/^\s*\d+[\.\s\-]+/, "").trim() || name
}

export function StageReportList({ project, stage, workflowActive }: { project: { id: string; name: string }; stage: ProjectStageExecution; workflowActive: boolean }) {
  const currentUser = useCurrentUser()
  const isMember = currentUser.role === "org_member"
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | ResponseStatus>("all")
  const [page, setPage] = useState(1)
  const baseHref = `/projects/${project.id}/stages/${stage.id}`
  const stageName = cleanStageName(stage.name)
  const filteredReports = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return stage.reports.filter((report) => {
      if (status !== "all" && report.status !== status) return false
      if (!normalized) return true
      return [report.reportNumber, report.reportTitle, report.subject ?? "", report.createdBy.name, report.responsibleUser?.name ?? ""]
        .some((value) => value.toLowerCase().includes(normalized))
    })
  }, [query, status, stage.reports])
  const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const reports = filteredReports.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const mobileMemberView = (
    <div className="space-y-3 pb-1 md:hidden">
      <Link
        href={`/projects/${project.id}/stages`}
        className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Stages
      </Link>

      <section className="rounded-xl border bg-card px-3 py-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="line-clamp-2 text-lg font-semibold leading-tight tracking-tight text-foreground">{stageName}</h1>
            <p className="mt-0.5 truncate text-sm font-medium text-muted-foreground">{project.name}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {stage.reportSummary.total} {stage.reportSummary.total === 1 ? "Report" : "Reports"}
              <span className="px-1" aria-hidden="true">•</span>
              {stage.reportSummary.pendingReview} Pending Review
            </p>
          </div>
          {workflowActive ? (
            <Link
              href={`${baseHref}/reports/new`}
              className={cn(buttonVariants({ size: "sm" }), "h-8 shrink-0 gap-1 px-2.5 text-xs font-semibold")}
            >
              <FilePlus2 className="size-3.5" aria-hidden="true" />
              Report
            </Link>
          ) : null}
        </div>
      </section>

      {!workflowActive ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          This stage is disabled for new work. Existing reports remain available.
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1) }}
            placeholder="Search reports..."
            className="h-9 bg-background pl-9 text-sm"
          />
        </div>
        <Select value={status} onValueChange={(value) => { setStatus(value as "all" | ResponseStatus); setPage(1) }}>
          <SelectTrigger className="h-9 w-full bg-background text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {reports.length ? (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="divide-y">
            {reports.map((report) => (
              <Link
                key={report.id}
                href={`${baseHref}/reports/${report.id}`}
                aria-label={`Open ${report.reportTitle}`}
                className="group block px-3 py-2.5 transition-colors hover:bg-muted/30 active:bg-muted/50"
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 line-clamp-2 text-[13px] font-semibold leading-[1.1rem] text-foreground">
                    {report.reportTitle}
                  </p>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5" aria-hidden="true" />
                </div>
                <p className="mt-0.5 max-w-full break-words font-mono text-[10px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                  {report.reportNumber}
                </p>
                <div className="mt-1.5 flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className={cn(statusTone(report.status), "h-5 shrink-0 px-1.5 text-[10px] font-medium")}>
                    {statusLabel(report.status)}
                  </Badge>
                  <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
                    {reviewLabel(report.status, report.approvalRequired)}
                  </span>
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] leading-4 text-muted-foreground">
                  <span className="shrink-0">{formatDate(report.createdAt)}</span>
                  <span aria-hidden="true">•</span>
                  <span className="truncate">{report.responsibleUser?.name ?? report.createdBy.name}</span>
                </div>
              </Link>
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t px-3 py-2">
              <p className="text-[10px] text-muted-foreground">Page {currentPage} of {totalPages} · {filteredReports.length} reports</p>
              <div className="flex gap-1.5">
                <Button type="button" size="icon-sm" variant="outline" aria-label="Previous reports page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button type="button" size="icon-sm" variant="outline" aria-label="Next reports page" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border bg-card px-4 py-8 text-center shadow-sm">
          <ClipboardList className="mx-auto size-8 text-muted-foreground/50" />
          <h2 className="mt-3 text-sm font-semibold text-foreground">
            {stage.reports.length ? "No reports match the current filters." : "No reports yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
            {stage.reports.length ? "Try a different search or report status." : "No reports have been created for this stage."}
          </p>
          {workflowActive && !stage.reports.length ? (
            <Link href={`${baseHref}/reports/new`} className={cn(buttonVariants({ size: "sm" }), "mt-4 h-8 gap-1 px-3 text-xs")}>
              <FilePlus2 className="size-3.5" />
              Start Report
            </Link>
          ) : null}
        </div>
      )}
    </div>
  )

  const existingView = (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{project.name} / {stageName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{stageName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{stage.reportSummary.total} {stage.reportSummary.total === 1 ? "Report" : "Reports"}</span>
            {stage.reportSummary.pendingReview ? <span>· {stage.reportSummary.pendingReview} Pending Review</span> : null}
            {stage.reportSummary.approved ? <span>· {stage.reportSummary.approved} Approved</span> : null}
          </div>
        </div>
        {workflowActive ? <Link href={`${baseHref}/reports/new`} className={cn(buttonVariants(), "shrink-0")}><FilePlus2 className="size-4" />Add Report</Link> : null}
      </div>

      {!workflowActive ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">This stage is disabled for new work. Existing reports remain available.</div> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="size-5 text-primary" />Reports</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search reports..." className="pl-9" /></div>
              <Select value={status} onValueChange={(value) => { setStatus(value as "all" | ResponseStatus); setPage(1) }}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {reports.length ? (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader><TableRow><TableHead>Report Title</TableHead><TableHead>Status</TableHead><TableHead>Created Date</TableHead><TableHead>Responsible User</TableHead><TableHead>Review Status</TableHead><TableHead className="w-16"><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
                  <TableBody>{reports.map((report) => <TableRow key={report.id}><TableCell className="max-w-80"><Link href={`${baseHref}/reports/${report.id}`} className="block truncate font-medium hover:text-primary" title={report.reportTitle}>{report.reportTitle}</Link><p className="truncate font-mono text-xs text-muted-foreground">{report.reportNumber}</p></TableCell><TableCell><Badge variant="outline" className={statusTone(report.status)}>{statusLabel(report.status)}</Badge></TableCell><TableCell>{formatDate(report.createdAt)}</TableCell><TableCell>{report.responsibleUser?.name ?? report.createdBy.name}</TableCell><TableCell>{reviewLabel(report.status, report.approvalRequired)}</TableCell><TableCell><Link href={`${baseHref}/reports/${report.id}`} aria-label={`Open ${report.reportTitle}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}><ArrowRight className="size-4" /></Link></TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
              <div className="divide-y md:hidden">{reports.map((report) => <Link key={report.id} href={`${baseHref}/reports/${report.id}`} className="block space-y-2 p-4 hover:bg-muted/30"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{report.reportTitle}</p><p className="mt-0.5 font-mono text-xs text-muted-foreground">{report.reportNumber}</p></div><Badge variant="outline" className={statusTone(report.status)}>{statusLabel(report.status)}</Badge></div><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{formatDate(report.createdAt)}</span><span>{report.responsibleUser?.name ?? report.createdBy.name}</span><span>{reviewLabel(report.status, report.approvalRequired)}</span></div></Link>)}</div>
              {totalPages > 1 ? <div className="flex items-center justify-between border-t px-4 py-3"><p className="text-xs text-muted-foreground">Page {currentPage} of {totalPages} · {filteredReports.length} reports</p><div className="flex gap-2"><Button type="button" size="icon-sm" variant="outline" aria-label="Previous reports page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="size-4" /></Button><Button type="button" size="icon-sm" variant="outline" aria-label="Next reports page" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight className="size-4" /></Button></div></div> : null}
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center"><ClipboardList className="size-10 text-muted-foreground/50" /><h2 className="mt-4 font-semibold">{stage.reports.length ? "No reports match the current filters." : "No reports have been created for this stage yet."}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Create reports directly under this stage and keep their files, checklist, review status, and approval history together.</p>{workflowActive && !stage.reports.length ? <Link href={`${baseHref}/reports/new`} className={cn(buttonVariants(), "mt-5")}><FilePlus2 className="size-4" />Create First Report</Link> : null}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  if (!isMember) return existingView

  return (
    <>
      {mobileMemberView}
      <div className="hidden md:block">{existingView}</div>
    </>
  )
}
