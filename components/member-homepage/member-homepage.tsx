"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { AlertTriangle, CalendarPlus, CheckCircle2, Clock3, FilePlus2, FileText, MapPinned, MessageSquare } from "lucide-react"

import { ClientVisitRequestWorkflow } from "@/components/calendar/client-visit-request-workflow"
import { Card, CardContent } from "@/components/ui/card"
import { calendarMonthKey } from "@/lib/calendar/date"
import type { CalendarClientRequestViewModel, CalendarDataViewModel } from "@/lib/calendar/types"
import type { MemberHomepageData, MemberHomepageRequest, MemberHomepageVisit } from "@/lib/member-homepage/types"
import { cn } from "@/lib/utils"

function formatDateBlock(value: string | null): { day: string; month: string } {
  if (!value) return { day: "ASAP", month: "" }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return { day: "—", month: "" }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return {
    day: String(Number(match[3])),
    month: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date),
  }
}

function formatTime(value: string | null): { time: string; period: string } | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null
  const [hourValue, minute] = value.split(":")
  const hour = Number(hourValue)
  if (!Number.isFinite(hour)) return null
  const period = hour >= 12 ? "PM" : "AM"
  const displayHour = hour % 12 || 12
  return { time: `${displayHour}:${minute}`, period }
}

function MetaLine({ children }: { children: React.ReactNode }) {
  return <p className="truncate text-[11px] leading-4 text-muted-foreground sm:text-xs">{children}</p>
}

function SummaryCard({ label, value, icon: Icon, prominent = false, hasError = false, reserveIconSpace = false }: {
  label: React.ReactNode
  value: React.ReactNode
  icon: React.ElementType
  prominent?: boolean
  hasError?: boolean
  reserveIconSpace?: boolean
}) {
  return (
    <Card
      size="sm"
      className={cn(
        "min-w-0 gap-0 py-3",
        prominent && "bg-primary/[0.06] ring-primary/25 dark:bg-primary/10",
      )}
    >
      <CardContent className="flex min-h-[5.5rem] flex-col justify-between gap-2 px-3">
        <div className={cn(
          "grid min-w-0 items-start gap-1",
          reserveIconSpace ? "grid-cols-[minmax(0,1fr)_0.875rem]" : "grid-cols-[minmax(0,1fr)_auto]",
        )}>
          <p className="min-w-0 overflow-hidden text-[10px] font-medium leading-[1.2] text-muted-foreground sm:text-xs sm:leading-4">{label}</p>
          <Icon
            className={cn(
              "mt-0.5 size-3.5 shrink-0 justify-self-end sm:size-4",
              prominent ? "text-primary" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{hasError ? "—" : value}</p>
      </CardContent>
    </Card>
  )
}

function RequestRow({
  request,
  onAction,
  loading = false,
}: {
  request: MemberHomepageRequest
  onAction: (requestId: string) => void
  loading?: boolean
}) {
  const date = formatDateBlock(request.requestedDate)
  return (
    <Card size="sm" className="py-0">
      <div className="grid min-h-[5rem] grid-cols-[3.5rem_minmax(0,1fr)_2.75rem] items-stretch">
        <div className="flex flex-col items-center justify-center border-r bg-muted/30 px-2 text-center">
          <span className={cn("font-semibold tabular-nums", date.day === "ASAP" ? "text-xs" : "text-xl")}>{date.day}</span>
          {date.month ? <span className="text-[11px] text-muted-foreground">{date.month}</span> : null}
        </div>
        <div className="min-w-0 self-center px-3 py-2.5">
          <p className="truncate text-sm font-semibold">{request.projectName}</p>
          <div className="mt-1 grid min-w-0 grid-cols-1 gap-x-3 sm:grid-cols-2">
            {request.projectCode ? <MetaLine>Code: {request.projectCode}</MetaLine> : null}
            {request.stageName ? <MetaLine>Stage: {request.stageName}</MetaLine> : null}
            {request.visitNumber ? <MetaLine>Visit {request.visitNumber}</MetaLine> : null}
            {request.preferredTimeLabel ? <MetaLine>{request.preferredTimeLabel}</MetaLine> : null}
          </div>
        </div>
        <div className="flex items-center justify-center pr-2">
          <button
            type="button"
            aria-label="Schedule visit request"
            aria-busy={loading || undefined}
            disabled={loading}
            onClick={() => onAction(request.id)}
            className="inline-flex size-10 items-center justify-center rounded-xl border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
          >
            <CalendarPlus className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Card>
  )
}

function VisitRow({ visit }: { visit: MemberHomepageVisit }) {
  const scheduledTime = formatTime(visit.scheduledTime)
  const isCompleted = visit.status === "completed"
  const actionClass =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-9 sm:rounded-lg"
  const disabledActionClass = `${actionClass} cursor-not-allowed opacity-40 hover:bg-background hover:text-muted-foreground`

  return (
    <Card
      size="sm"
      className={cn(
        "overflow-hidden py-0",
        isCompleted && "bg-muted/20 opacity-80 ring-1 ring-inset ring-green-200/60 dark:ring-green-900/50",
      )}
    >
      <div className="grid min-h-[4.15rem] grid-cols-[2.65rem_minmax(0,1.35fr)_minmax(5.3rem,1fr)_2.55rem] items-stretch sm:min-h-[4.25rem] sm:grid-cols-[3.5rem_minmax(0,1.35fr)_minmax(6.5rem,1fr)_3rem]">
        <div className={cn(
          "flex min-w-0 flex-col items-center justify-center bg-sidebar px-1 text-center text-white",
          isCompleted && "bg-sidebar/80",
        )}>
          {scheduledTime ? (
            <>
              <span className="text-[12px] font-bold leading-3.5 tabular-nums sm:text-sm sm:leading-4">{scheduledTime.time}</span>
              <span className="mt-0.5 text-[9px] font-bold uppercase leading-3 tracking-wide text-white/85 sm:text-[10px]">{scheduledTime.period}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-white/75">—</span>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-center px-1.5 py-1 sm:px-2.5 sm:py-1.5">
          <p className="min-w-0 truncate text-[11px] font-semibold leading-3.5 sm:text-sm sm:leading-4">{visit.projectName}</p>
          {visit.projectCode ? (
            <p className="mt-0.5 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] text-[9px] leading-[10px] text-muted-foreground sm:text-[11px] sm:leading-4">
              {visit.projectCode}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col justify-center border-l px-1.5 py-1 sm:px-2.5 sm:py-1.5">
          {visit.stageName ? (
            <p className="line-clamp-2 min-w-0 break-words text-[10px] font-semibold leading-3 sm:text-xs sm:leading-4">{visit.stageName}</p>
          ) : null}
          {visit.visitNumber ? (
            <p className="mt-0.5 whitespace-nowrap text-[9px] leading-3 text-muted-foreground sm:text-[11px] sm:leading-4">Visit No. {visit.visitNumber}</p>
          ) : null}
          {isCompleted ? (
            <span className="mt-0.5 inline-flex items-center gap-0.5 text-[8px] font-medium leading-3 text-green-700 dark:text-green-300 sm:text-[10px]">
              <CheckCircle2 className="size-2.5" aria-hidden="true" />
              Completed
            </span>
          ) : null}
        </div>

        <div className="flex flex-col items-center justify-center gap-1 border-l px-0.5 py-1">
          {isCompleted ? (
            <button type="button" aria-label="Open stage response (completed visit)" aria-disabled="true" className={disabledActionClass} disabled>
              <FilePlus2 className="size-4 sm:size-[18px]" aria-hidden="true" />
            </button>
          ) : visit.stageResponseHref ? (
            <Link href={visit.stageResponseHref} aria-label="Open stage response" className={actionClass}>
              <FilePlus2 className="size-4 sm:size-[18px]" aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" aria-label="Open stage response" className={disabledActionClass} disabled>
              <FilePlus2 className="size-4 sm:size-[18px]" aria-hidden="true" />
            </button>
          )}
          {isCompleted ? (
            <button type="button" aria-label="Open project location in Google Maps (completed visit)" aria-disabled="true" className={disabledActionClass} disabled>
              <MapPinned className="size-4 sm:size-[18px]" aria-hidden="true" />
            </button>
          ) : visit.googleMapsUrl ? (
            <a
              href={visit.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open project location in Google Maps"
              className={actionClass}
            >
              <MapPinned className="size-4 sm:size-[18px]" aria-hidden="true" />
            </a>
          ) : (
            <button type="button" aria-label="Open project location in Google Maps" className={disabledActionClass} disabled>
              <MapPinned className="size-4 sm:size-[18px]" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex min-h-24 items-center gap-3 rounded-xl border border-dashed bg-muted/15 px-4 py-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export function MemberHomepage({ data }: { data: MemberHomepageData }) {
  const router = useRouter()
  const [selectedRequest, setSelectedRequest] = useState<CalendarClientRequestViewModel | null>(null)
  const [calendarData, setCalendarData] = useState<CalendarDataViewModel | null>(null)
  const [requestDialogOpen, setRequestDialogOpen] = useState(false)
  const [loadingRequestId, setLoadingRequestId] = useState<string | null>(null)
  const [requestActionError, setRequestActionError] = useState<string | null>(null)

  async function openRequestWorkflow(requestId: string) {
    if (loadingRequestId) return
    setLoadingRequestId(requestId)
    setRequestActionError(null)
    try {
      const monthKey = calendarMonthKey(new Date())
      const response = await fetch(`/api/calendar?month=${encodeURIComponent(monthKey)}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      })
      const payload = (await response.json().catch(() => null)) as CalendarDataViewModel | { error?: string } | null
      if (!response.ok || !payload || !("monthKey" in payload)) {
        throw new Error("Unable to load this Client Visit Request. Please try again.")
      }

      const request = payload.pendingRequests.find((item) => item.id === requestId) ?? null
      if (!request) {
        setRequestActionError("This Client Visit Request is no longer pending. Refreshing the page will show the latest status.")
        router.refresh()
        return
      }
      if (!request.canManage) {
        setRequestActionError("You do not have permission to manage this Client Visit Request.")
        return
      }

      setCalendarData(payload)
      setSelectedRequest(request)
      setRequestDialogOpen(true)
    } catch {
      setRequestActionError("Unable to load this Client Visit Request. Please try again.")
    } finally {
      setLoadingRequestId(null)
    }
  }

  async function refreshAfterRequestScheduling() {
    setSelectedRequest(null)
    setCalendarData(null)
    setRequestDialogOpen(false)
    setRequestActionError(null)
    router.refresh()
  }

  async function refreshAfterStaleRequest() {
    setSelectedRequest(null)
    setCalendarData(null)
    setRequestDialogOpen(false)
    router.refresh()
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 overflow-x-hidden">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <SummaryCard
          label="Today's Reports"
          value={(
            <span className="inline-flex items-baseline gap-1">
              <span>{data.summary.completedReportsToday}</span>
              <span className="text-base font-medium text-muted-foreground sm:text-lg">/ {data.summary.requiredReportsToday}</span>
            </span>
          )}
          icon={FileText}
          hasError={data.todaysReportsHasError}
        />
        <SummaryCard
          label={<><span className="block">Tomorrow&apos;s</span><span className="block">Visits</span></>}
          value={data.summary.tomorrowsVisits}
          icon={Clock3}
          hasError={data.tomorrowsVisitsHasError}
          reserveIconSpace
        />
        <SummaryCard label="Visit Requests" value={data.summary.pendingVisitRequests} icon={MessageSquare} prominent />
      </div>

      <section className="space-y-3" aria-labelledby="member-visit-requests-title">
        <div className="flex items-center justify-between gap-3">
          <h1 id="member-visit-requests-title" className="text-lg font-semibold tracking-tight">Visit Requests</h1>
          <span className="text-xs tabular-nums text-muted-foreground">{data.requests.length}</span>
        </div>
        {data.visitRequestsHasError ? (
          <div className="flex min-h-20 items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-destructive">
            <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Unable to load visit requests</p>
              <p className="mt-0.5 text-xs leading-5 text-destructive/80">Please refresh and try again.</p>
            </div>
          </div>
        ) : data.requests.length ? (
          <div className="space-y-2.5">
            {data.requests.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                onAction={openRequestWorkflow}
                loading={loadingRequestId === request.id}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarPlus} title="No pending visit requests" description="New client visit requests for your supervised projects will appear here." />
        )}
        {requestActionError ? (
          <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
            {requestActionError}
          </p>
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="member-today-visits-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="member-today-visits-title" className="text-lg font-semibold tracking-tight">Today's Visits</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{data.visits.length}</span>
        </div>
        {data.visits.length ? (
          <div className="space-y-2">
            {data.visits.map((visit) => <VisitRow key={visit.id} visit={visit} />)}
          </div>
        ) : (
          <EmptyState icon={MapPinned} title="No visits scheduled today" description="Today's scheduled Site Visits for your supervised projects will appear here." />
        )}
      </section>

      <ClientVisitRequestWorkflow
        request={selectedRequest}
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
        schedulingProjects={calendarData?.scheduling.projects ?? []}
        onScheduled={refreshAfterRequestScheduling}
        onRefreshRequired={refreshAfterStaleRequest}
      />
    </div>
  )
}
