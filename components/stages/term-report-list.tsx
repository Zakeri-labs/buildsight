"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowRight, ChevronLeft, ChevronRight, ClipboardList, FilePlus2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { reportTypeLabel, statusLabel, statusTone, type ResponseStatus } from "@/lib/stages/execution"
import type { ProjectTermResponse } from "@/lib/db/project-stages"

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

function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value))
}

export function TermReportList({
  project,
  stage,
  term,
  parentTerm,
  workflowActive,
  canCreate,
}: {
  project: { id: string; name: string }
  stage: { id: string; name: string }
  term: {
    id: string
    reportName: string
    required: boolean
    instructions: string | null
    responses: ProjectTermResponse[]
    reportSummary: { total: number; draft: number; inProgress: number; pendingReview: number; approved: number; rejected: number }
  }
  parentTerm: { id: string; reportName: string } | null
  workflowActive: boolean
  canCreate: boolean
}) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | ResponseStatus>("all")
  const [page, setPage] = useState(1)
  const baseHref = `/projects/${project.id}/stages/${stage.id}/terms/${term.id}`
  const filteredReports = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return term.responses.filter((report) => {
      if (status !== "all" && report.status !== status) return false
      if (!normalized) return true
      return [report.reportNumber, report.reportTitle, report.subject ?? "", report.createdBy.name, reportTypeLabel(report.reportType)]
        .some((value) => value.toLowerCase().includes(normalized))
    })
  }, [query, status, term.responses])
  const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const reports = filteredReports.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{project.name} / {stage.name}{parentTerm ? ` / ${parentTerm.reportName}` : ""}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{term.reportName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{term.required ? "Required" : "Optional"}</Badge>
            <span>{term.reportSummary.total} {term.reportSummary.total === 1 ? "Report" : "Reports"}</span>
            {term.reportSummary.pendingReview ? <span>· {term.reportSummary.pendingReview} Pending Review</span> : null}
            {term.reportSummary.approved ? <span>· {term.reportSummary.approved} Approved</span> : null}
          </div>
          {term.instructions ? <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{term.instructions}</p> : null}
        </div>
        {canCreate && workflowActive ? (
          <Link href={`${baseHref}/reports/new`} className={cn(buttonVariants(), "shrink-0")}><FilePlus2 className="size-4" />New Report</Link>
        ) : null}
      </div>

      {!workflowActive ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">This workflow item is disabled for new work. Existing reports remain available to authorized users.</div>
      ) : null}

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
                  <TableHeader><TableRow><TableHead>Report No.</TableHead><TableHead>Title</TableHead><TableHead>Date</TableHead><TableHead>Visit No.</TableHead><TableHead>Created By</TableHead><TableHead>Status</TableHead><TableHead>Updated</TableHead><TableHead className="w-16"><span className="sr-only">Open</span></TableHead></TableRow></TableHeader>
                  <TableBody>{reports.map((report) => <TableRow key={report.id}><TableCell className="font-mono text-xs font-medium">{report.reportNumber}</TableCell><TableCell className="max-w-72"><Link href={`${baseHref}/reports/${report.id}`} className="block truncate font-medium hover:text-primary" title={report.reportTitle}>{report.reportTitle}</Link><p className="truncate text-xs text-muted-foreground">{report.subject || reportTypeLabel(report.reportType)}</p></TableCell><TableCell>{date(report.createdAt)}</TableCell><TableCell>{report.visitNumber || "—"}</TableCell><TableCell>{report.createdBy.name}</TableCell><TableCell><Badge variant="outline" className={statusTone(report.status)}>{statusLabel(report.status)}</Badge></TableCell><TableCell className="text-muted-foreground">{date(report.updatedAt)}</TableCell><TableCell><Link href={`${baseHref}/reports/${report.id}`} aria-label={`Open ${report.reportTitle}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}><ArrowRight className="size-4" /></Link></TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
              <div className="divide-y md:hidden">{reports.map((report) => <Link key={report.id} href={`${baseHref}/reports/${report.id}`} className="block space-y-2 p-4 hover:bg-muted/30"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{report.reportTitle}</p><p className="mt-0.5 font-mono text-xs text-muted-foreground">{report.reportNumber}</p></div><Badge variant="outline" className={statusTone(report.status)}>{statusLabel(report.status)}</Badge></div><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span>{date(report.createdAt)}</span><span>Visit {report.visitNumber || "—"}</span><span>{report.createdBy.name}</span></div></Link>)}</div>
              {totalPages > 1 ? <div className="flex items-center justify-between border-t px-4 py-3"><p className="text-xs text-muted-foreground">Page {currentPage} of {totalPages} · {filteredReports.length} reports</p><div className="flex gap-2"><Button type="button" size="icon-sm" variant="outline" aria-label="Previous reports page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="size-4" /></Button><Button type="button" size="icon-sm" variant="outline" aria-label="Next reports page" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight className="size-4" /></Button></div></div> : null}
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center"><ClipboardList className="size-10 text-muted-foreground/50" /><h2 className="mt-4 font-semibold">{term.responses.length ? "No reports match the current filters." : "No reports have been created for this term yet."}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Each report is an independent visit, inspection, or submission and will keep its own files and review history.</p>{canCreate && workflowActive && !term.responses.length ? <Link href={`${baseHref}/reports/new`} className={cn(buttonVariants(), "mt-5")}><FilePlus2 className="size-4" />Create First Report</Link> : null}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
