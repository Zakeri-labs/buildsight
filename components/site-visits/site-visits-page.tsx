"use client"

import Link from "next/link"
import { useMemo, useState, useTransition, useEffect, type ChangeEvent } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarClock, ChevronRight, MapPinned, Search, Loader2, AlertCircle } from "lucide-react"
import { useCurrentUser } from "@/components/current-user-provider"
import type { SiteVisitPageData, SiteVisitStatus } from "@/lib/site-visits/types"
import { preferredTimeLabel, preferredVisitLabel, siteVisitRequestCode } from "@/lib/site-visits/format"
import { SiteVisitRequestDialog } from "@/components/site-visits/site-visit-request-dialog"
import { SiteVisitStatusBadge } from "@/components/site-visits/site-visit-status-badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

import { DateRangePill } from "@/components/dashboard/date-range-pill"
import { SITE_VISIT_PRESET_OPTIONS, type SiteVisitDateRange } from "@/lib/site-visits/date-range"

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

export function SiteVisitsPage({
  data,
  dateRange,
}: {
  data: SiteVisitPageData
  dateRange?: SiteVisitDateRange
}) {
  const currentUser = useCurrentUser()
  const isMember = currentUser.role === "org_member"
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [isPending, startTransition] = useTransition()
  const [pendingRange, setPendingRange] = useState<{ preset: string; label: string } | null>(null)
  const [navError, setNavError] = useState<string | null>(null)
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null)

  useEffect(() => {
    setNavError(null)
    setPendingRange(null)
  }, [data])

  useEffect(() => {
    if (!isPending) return
    const timer = setTimeout(() => {
      setNavError("Updating site visits took longer than expected. Please check your connection and retry.")
      setPendingRange(null)
    }, 20000)
    return () => clearTimeout(timer)
  }, [isPending])

  const handleNavigatePreset = (nextPreset: string, optionLabel: string) => {
    setNavError(null)
    setPendingRange({ preset: nextPreset, label: optionLabel })
    const run = () => {
      startTransition(() => {
        try {
          const params = new URLSearchParams(searchParams.toString())
          params.set("range", nextPreset)
          params.delete("from")
          params.delete("to")
          params.delete("page")
          const query = params.toString()
          router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
        } catch {
          setNavError("Failed to update date range. Please try again.")
          setPendingRange(null)
        }
      })
    }
    setRetryAction(() => run)
    run()
  }

  const handleNavigateCustom = (from: string, to: string, customLabel: string) => {
    setNavError(null)
    setPendingRange({ preset: "custom", label: customLabel })
    const run = () => {
      startTransition(() => {
        try {
          const params = new URLSearchParams(searchParams.toString())
          params.set("range", "custom")
          params.set("from", from)
          params.set("to", to)
          params.delete("page")
          const query = params.toString()
          router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
        } catch {
          setNavError("Failed to update date range. Please try again.")
          setPendingRange(null)
        }
      })
    }
    setRetryAction(() => run)
    run()
  }

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"all" | SiteVisitStatus>("all")
  const requestProjects = data.projects.filter((project) => project.canRequest)
  const fixedRequestProjectId = data.selectedProjectId && requestProjects.some((project) => project.id === data.selectedProjectId) ? data.selectedProjectId : undefined

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.requests.filter((request) => {
      if (status !== "all" && request.status !== status) return false
      if (!query) return true
      return [
        request.projectName,
        request.projectCode ?? "",
        request.requestedBy,
        request.purpose,
        siteVisitRequestCode(request.id),
      ].some((value) => value.toLowerCase().includes(query))
    })
  }, [data.requests, search, status])

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
          <h2 className="text-xl font-semibold">Site Visit Request</h2>
          {data.selectedProjectName ? <p className="mt-1 text-sm font-medium">{data.selectedProjectName}</p> : null}
        </div>
        {data.canRequestAny ? <SiteVisitRequestDialog projects={data.projects} fixedProjectId={fixedRequestProjectId} triggerLabel="Request New Visit" /> : null}
      </div>

      {data.unauthorizedProject ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">You do not have access to site visits for the selected project.</div> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-md"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Search site visits..." className="h-10 ps-9" /></div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onValueChange={(value: unknown) => setStatus(String(value) as "all" | SiteVisitStatus)}><SelectTrigger className="h-10 w-full sm:w-44"><SelectValue>{(value: unknown) => String(value) === "all" ? "All Statuses" : String(value).charAt(0).toUpperCase() + String(value).slice(1)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
          {dateRange ? (
            <DateRangePill
              preset={pendingRange?.preset ?? dateRange.preset}
              label={pendingRange?.label ?? dateRange.label}
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              showAllTime={false}
              options={SITE_VISIT_PRESET_OPTIONS}
              isLoading={isPending}
              onNavigate={handleNavigatePreset}
              onCustomNavigate={handleNavigateCustom}
              ariaLabel={`Site visits date range: ${pendingRange?.label ?? dateRange.label}`}
              dialogDescription="Choose inclusive calendar dates for site visit requests."
            />
          ) : null}
        </div>
      </div>

      {navError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{navError}</span>
          </div>
          {retryAction ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNavError(null)
                retryAction()
              }}
              className="h-7 border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="relative min-h-[300px]">
        {/* Results Area with subtle opacity and disabled interaction while updating */}
        <div
          className={cn(
            "transition-opacity duration-200",
            isPending && "opacity-40 pointer-events-none select-none",
          )}
        >
          {isMember ? <p className="-mt-2 mb-4 text-xs font-medium text-muted-foreground md:hidden">{filtered.length} {filtered.length === 1 ? "Request" : "Requests"}</p> : null}

          {filtered.length ? (
            <>
              <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="border-b bg-muted/35 text-xs font-semibold text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-start min-w-[160px]">Project</th>
                        <th className="px-4 py-3 text-start min-w-[180px] whitespace-nowrap">Project Code</th>
                        {data.canManageAny ? <th className="px-4 py-3 text-start">Requested By</th> : null}
                        <th className="px-4 py-3 text-start">Preferred Visit</th>
                        <th className="px-4 py-3 text-start">Status</th>
                        <th className="px-4 py-3 text-start">Created Date</th>
                        <th className="px-4 py-3 text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filtered.map((request) => (
                        <tr key={request.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3.5 font-medium">{request.projectName}</td>
                          <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {request.projectCode || "—"}
                          </td>
                          {data.canManageAny ? <td className="px-4 py-3.5 text-muted-foreground">{request.requestedBy}</td> : null}
                          <td className="px-4 py-3.5 text-muted-foreground">{preferredVisitLabel(request)}</td>
                          <td className="px-4 py-3.5"><SiteVisitStatusBadge status={request.status} /></td>
                          <td className="px-4 py-3.5 text-muted-foreground">{dateTime(request.createdAt)}</td>
                          <td className="px-4 py-3.5 text-end">
                            <Link href={`/site-visits/${request.id}?project=${encodeURIComponent(request.projectId)}`} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted">
                              View Request<ChevronRight className="size-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

        {/* Loading Overlay */}
        {isPending && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-background/50 backdrop-blur-[1.5px] p-6 transition-all animate-in fade-in-0 duration-200"
          >
            <div className="flex flex-col items-center gap-3.5 rounded-2xl border border-border/80 bg-card/95 px-7 py-6 shadow-xl backdrop-blur-md max-w-sm text-center">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-2xs">
                <Loader2 className="size-5 animate-spin" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Updating Site Visits
                </h3>
                <p className="text-xs text-muted-foreground text-pretty">
                  Fetching visits for the selected date range...
                </p>
              </div>
              {/* Subtle animated progress indicator */}
              <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-full animate-pulse rounded-full bg-primary/80" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
