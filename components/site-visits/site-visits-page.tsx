"use client"

import Link from "next/link"
import { useMemo, useState, type ChangeEvent } from "react"
import { CalendarClock, ChevronRight, MapPinned, Search } from "lucide-react"
import { useCurrentUser } from "@/components/current-user-provider"
import type { SiteVisitPageData, SiteVisitStatus } from "@/lib/site-visits/types"
import { preferredTimeLabel, preferredVisitLabel, siteVisitRequestCode } from "@/lib/site-visits/format"
import { SiteVisitRequestDialog } from "@/components/site-visits/site-visit-request-dialog"
import { SiteVisitStatusBadge } from "@/components/site-visits/site-visit-status-badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function dateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function compactPreferredVisit(input: {
  isAsap: boolean
  preferredDate: string | null
  preferredTime: Parameters<typeof preferredTimeLabel>[0]
}) {
  if (input.isAsap) return `ASAP · ${preferredTimeLabel(input.preferredTime)}`
  if (!input.preferredDate) return `Date not set · ${preferredTimeLabel(input.preferredTime)}`
  const date = new Date(`${input.preferredDate}T00:00:00`)
  const label = Number.isNaN(date.getTime())
    ? input.preferredDate
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)
  return `${label} · ${preferredTimeLabel(input.preferredTime)}`
}

export function SiteVisitsPage({ data }: { data: SiteVisitPageData }) {
  const currentUser = useCurrentUser()
  const isMember = currentUser.role === "org_member"
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"all" | SiteVisitStatus>("all")
  const requestProjects = data.projects.filter((project) => project.canRequest)
  const fixedRequestProjectId = data.selectedProjectId && requestProjects.some((project) => project.id === data.selectedProjectId) ? data.selectedProjectId : undefined

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.requests.filter((request) => {
      if (status !== "all" && request.status !== status) return false
      if (!query) return true
      return [request.projectName, request.requestedBy, request.purpose, siteVisitRequestCode(request.id)].some((value) => value.toLowerCase().includes(query))
    })
  }, [data.requests, search, status])

  const title = data.canManageAny ? "Site Visit Requests" : "My Site Visit Requests"
  const hasActiveFilters = Boolean(search.trim()) || status !== "all"
  const emptyTitle = hasActiveFilters
    ? "No site visit requests match these filters."
    : data.canManageAny
      ? "No pending site visit requests."
      : "No site visit requests yet."

  return (
    <div className={isMember ? "flex flex-col gap-4 md:gap-5" : "flex flex-col gap-5"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {isMember ? <><span className="md:hidden">Site Visits</span><span className="hidden md:inline">{title}</span></> : title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isMember ? <><span className="md:hidden">Review and track site visit requests.</span><span className="hidden md:inline">Request, review, schedule, and track project site visits.</span></> : "Request, review, schedule, and track project site visits."}
          </p>
          {data.selectedProjectName ? <p className="mt-1 text-sm font-medium">{data.selectedProjectName}</p> : null}
        </div>
        {data.canRequestAny ? <SiteVisitRequestDialog projects={data.projects} fixedProjectId={fixedRequestProjectId} triggerLabel="Request New Visit" /> : null}
      </div>

      {data.unauthorizedProject ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">You do not have access to site visits for the selected project.</div> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-md"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Search site visits..." className="h-10 ps-9" /></div>
        <Select value={status} onValueChange={(value: unknown) => setStatus(String(value) as "all" | SiteVisitStatus)}><SelectTrigger className="h-10 w-full sm:w-44"><SelectValue>{(value: unknown) => String(value) === "all" ? "All Statuses" : String(value).charAt(0).toUpperCase() + String(value).slice(1)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
      </div>

      {isMember ? <p className="-mt-2 text-xs font-medium text-muted-foreground md:hidden">{filtered.length} {filtered.length === 1 ? "Request" : "Requests"}</p> : null}

      {filtered.length ? (
        <>
          <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
            <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="border-b bg-muted/35 text-xs font-semibold text-muted-foreground"><tr><th className="px-4 py-3 text-start">Request ID</th><th className="px-4 py-3 text-start">Project</th>{data.canManageAny ? <th className="px-4 py-3 text-start">Requested By</th> : null}<th className="px-4 py-3 text-start">Preferred Visit</th><th className="px-4 py-3 text-start">Status</th><th className="px-4 py-3 text-start">Created Date</th><th className="px-4 py-3 text-end">Actions</th></tr></thead><tbody className="divide-y">{filtered.map((request) => <tr key={request.id} className="hover:bg-muted/20"><td className="px-4 py-3.5 font-mono text-xs">{siteVisitRequestCode(request.id)}</td><td className="px-4 py-3.5 font-medium">{request.projectName}</td>{data.canManageAny ? <td className="px-4 py-3.5 text-muted-foreground">{request.requestedBy}</td> : null}<td className="px-4 py-3.5 text-muted-foreground">{preferredVisitLabel(request)}</td><td className="px-4 py-3.5"><SiteVisitStatusBadge status={request.status} /></td><td className="px-4 py-3.5 text-muted-foreground">{dateTime(request.createdAt)}</td><td className="px-4 py-3.5 text-end"><Link href={`/site-visits/${request.id}?project=${encodeURIComponent(request.projectId)}`} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted">View Request<ChevronRight className="size-3.5" /></Link></td></tr>)}</tbody></table></div>
          </div>
          {isMember ? (
            <div className="grid gap-2 md:hidden">
              {filtered.map((request) => (
                <Link
                  key={request.id}
                  href={`/site-visits/${request.id}?project=${encodeURIComponent(request.projectId)}`}
                  aria-label={`View request ${siteVisitRequestCode(request.id)} for ${request.projectName}`}
                  className="group grid min-h-[4.75rem] grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-xl border bg-card px-3 py-2 transition-colors active:bg-muted/40"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold leading-5">{request.projectName}</h3>
                    <p className="mt-0.5 truncate text-xs font-medium text-foreground/80">{compactPreferredVisit(request)}</p>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] leading-4 text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">Requested by {request.requestedBy}</span>
                      <span className="shrink-0 font-mono">{siteVisitRequestCode(request.id)}</span>
                    </div>
                  </div>
                  <div className="flex min-w-[5.5rem] flex-col items-end justify-between gap-2">
                    <SiteVisitStatusBadge status={request.status} />
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-active:translate-x-0.5" aria-hidden="true" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 md:hidden">{filtered.map((request) => <Link key={request.id} href={`/site-visits/${request.id}?project=${encodeURIComponent(request.projectId)}`} className="rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/20"><div className="flex items-start justify-between gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><MapPinned className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-mono text-[11px] text-muted-foreground">{siteVisitRequestCode(request.id)}</p><h3 className="truncate text-sm font-semibold">{request.projectName}</h3>{data.canManageAny ? <p className="truncate text-xs text-muted-foreground">{request.requestedBy}</p> : null}</div><SiteVisitStatusBadge status={request.status} /></div><div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{preferredVisitLabel(request)}</span><span>{dateTime(request.createdAt)}</span></div></Link>)}</div>
          )}
        </>
      ) : (
        <>
          {isMember ? (
            <div className="rounded-xl border bg-card px-4 py-10 text-center md:hidden">
              <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground"><MapPinned className="size-5" /></span>
              <h3 className="mt-3 text-sm font-semibold">{emptyTitle}</h3>
              <p className="mt-1 text-xs text-muted-foreground">Site visit requests for supervised projects will appear here.</p>
            </div>
          ) : null}
          <Card className={isMember ? "hidden md:block" : undefined}><CardContent className="flex flex-col items-center px-6 py-16 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><MapPinned className="size-6" /></span><h3 className="mt-4 font-semibold">{emptyTitle}</h3><p className="mt-1 text-sm text-muted-foreground">Site visit requests for accessible projects will appear here.</p>{data.canRequestAny && !hasActiveFilters && data.requests.length === 0 ? <div className="mt-5"><SiteVisitRequestDialog projects={data.projects} fixedProjectId={fixedRequestProjectId} triggerLabel="Request Your First Site Visit" /></div> : null}</CardContent></Card>
        </>
      )}
    </div>
  )
}
