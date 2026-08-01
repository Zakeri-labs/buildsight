"use client"

import Link from "next/link"
import { CalendarClock, ChevronRight, MapPinned } from "lucide-react"
import type { ProjectSiteVisitSummary, SiteVisitProjectAccess } from "@/lib/site-visits/types"
import { preferredVisitLabel, siteVisitRequestCode } from "@/lib/site-visits/format"
import { SiteVisitRequestDialog } from "@/components/site-visits/site-visit-request-dialog"
import { SiteVisitStatusBadge } from "@/components/site-visits/site-visit-status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function ProjectSiteVisitsSection({
  project,
  summary,
}: {
  project: SiteVisitProjectAccess
  summary: ProjectSiteVisitSummary
}) {
  if (!summary.canRequest && !summary.canManage) return null
  const scopedHref = `/site-visits?project=${encodeURIComponent(project.id)}`
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
        <div>
          <CardTitle className="flex items-center gap-2 text-base font-semibold sm:text-lg"><MapPinned className="size-5 text-primary" />Site Visits</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Recent site visit requests for this project.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary.canRequest ? <SiteVisitRequestDialog projects={[project]} fixedProjectId={project.id} triggerLabel="Request Site Visit" /> : null}
          <Button variant="outline" size="lg" render={<Link href={scopedHref} />}><span>View All</span><ChevronRight className="size-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border bg-card px-3 py-1.5"><strong>{summary.counts.pending}</strong> Pending</span>
          <span className="rounded-full border bg-card px-3 py-1.5"><strong>{summary.counts.scheduled}</strong> Scheduled</span>
          <span className="rounded-full border bg-card px-3 py-1.5"><strong>{summary.counts.completed}</strong> Completed</span>
        </div>
        {summary.recent.length ? (
          <div className="divide-y rounded-xl border">
            {summary.recent.map((request) => (
              <Link key={request.id} href={`/site-visits/${request.id}?project=${encodeURIComponent(project.id)}`} className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/30 sm:px-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary"><CalendarClock className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{request.purpose}</span><span className="block truncate text-xs text-muted-foreground">{siteVisitRequestCode(request.id)} · {preferredVisitLabel(request)} · {request.requestedBy}</span></span>
                <SiteVisitStatusBadge status={request.status} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No site visit requests yet.</div>
        )}
      </CardContent>
    </Card>
  )
}
