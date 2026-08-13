"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { AlertTriangle, CalendarPlus, CheckCircle2, Clock3, FilePlus2, FileText, MapPinned, MessageSquare } from "lucide-react"

import { ClientVisitRequestWorkflow } from "@/components/calendar/client-visit-request-workflow"
import { MemberVisitCompliance } from "@/components/member-homepage/member-visit-compliance"
import { Card, CardContent } from "@/components/ui/card"
import { currentCalendarMonthKey } from "@/lib/calendar/date"
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
  return <p className="truncate text-[9px] leading-[11px] text-muted-foreground lg:text-xs lg:leading-4">{children}</p>
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
        "relative min-w-0 gap-0 overflow-hidden rounded-xl border border-border bg-card py-3 ring-0 lg:border-0 lg:ring-1 lg:ring-foreground/10",
        prominent && "border-primary/30 bg-primary/[0.06] dark:border-primary/35 dark:bg-primary/10 lg:border-0 lg:ring-primary/25",
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
      <div className="grid min-h-[3rem] grid-cols-[3.125rem_minmax(0,1fr)_2.625rem] items-stretch sm:grid-cols-[3.125rem_minmax(0,1fr)_2.625rem] lg:min-h-[5rem] lg:grid-cols-[3.5rem_minmax(0,1fr)_2.75rem]">
        <div className="flex flex-col items-center justify-center border-r bg-muted/30 px-1.5 text-center lg:px-2">
          <span className={cn("font-semibold leading-none tabular-nums", date.day === "ASAP" ? "text-[10px]" : "text-base", "lg:leading-normal", date.day !== "ASAP" && "lg:text-xl")}>{date.day}</span>
          {date.month ? <span className="mt-px text-[9px] leading-none text-muted-foreground lg:mt-0.5 lg:text-[11px] lg:leading-normal">{date.month}</span> : null}
        </div>
        <div className="min-w-0 self-center px-2 py-0.5 lg:px-3 lg:py-2.5">
          <p className="truncate text-[12px] font-semibold leading-3.5 lg:text-sm lg:leading-normal">{request.projectName}</p>
          <div className="mt-px grid min-w-0 grid-cols-1 gap-x-3 gap-y-0 lg:mt-1 lg:grid-cols-2">
            {request.projectCode ? <MetaLine><span className="lg:hidden">{request.projectCode}</span><span className="hidden lg:inline">Code: {request.projectCode}</span></MetaLine> : null}
            {request.stageName ? <MetaLine>Stage: {request.stageName}</MetaLine> : null}
            {request.visitNumber ? <MetaLine>Visit {request.visitNumber}</MetaLine> : null}
            {request.preferredTimeLabel ? <MetaLine>{request.preferredTimeLabel}</MetaLine> : null}
          </div>
        </div>
        <div className="flex items-center justify-center pr-1.5 lg:pr-2">
          <button
            type="button"
            aria-label="Schedule visit request"
            aria-busy={loading || undefined}
            disabled={loading}
            onClick={() => onAction(request.id)}
            className="inline-flex size-8 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 lg:size-10 lg:rounded-xl"
          >
            <CalendarPlus className="size-4 lg:size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Card>
  )
}

function VisitRow({ visit }: { visit: MemberHomepageVisit }) {
  const scheduledTime = formatTime(visit.scheduledTime)
  const isCompleted = visit.status === "completed"

  return (
    <Card
      size="sm"
      className={cn(
        "overflow-hidden py-0 border border-border shadow-2xs transition-all",
        isCompleted && "bg-muted/30 border-green-200/80 dark:border-green-900/50",
      )}
    >
      <div className="flex min-h-[4.25rem] items-stretch">
        {/* TIME BADGE (Dark navy #16294a) */}
        <div
          className={cn(
            "flex w-14 shrink-0 flex-col items-center justify-center bg-[#16294a] px-1 text-center text-white sm:w-16",
            isCompleted && "bg-[#16294a]/80",
          )}
        >
          {scheduledTime ? (
            <>
              <span className="text-xs font-bold leading-none tabular-nums sm:text-sm">{scheduledTime.time}</span>
              <span className="mt-1 text-[9px] font-bold uppercase leading-none text-white/80 sm:text-[10px]">{scheduledTime.period}</span>
            </>
          ) : (
            <span className="text-xs font-semibold text-white/75">—</span>
          )}
        </div>

        {/* MIDDLE CONTENT AREA: Project Name, Code, Stage Name, Visit Number */}
        <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
          <div className="flex min-w-0 items-baseline justify-between gap-1.5">
            <h3 className="truncate text-xs font-bold text-foreground sm:text-sm">
              {visit.projectName}
            </h3>
            {isCompleted ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800 dark:bg-green-950/60 dark:text-green-300">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Completed
              </span>
            ) : null}
          </div>

          {visit.projectCode ? (
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {visit.projectCode}
            </p>
          ) : null}

          {(visit.stageName || visit.visitNumber) ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
              {visit.stageName ? (
                <span className="font-medium text-foreground">{visit.stageName}</span>
              ) : null}
              {visit.visitNumber ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Visit #{visit.visitNumber}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* RIGHT ACTION BUTTONS: Large, standard touch targets (size-9 / 36px) */}
        <div className="flex shrink-0 items-center gap-1.5 border-s border-border bg-muted/10 px-2.5 py-2">
          {/* Button 1: Add Report */}
          {isCompleted ? (
            <button
              type="button"
              disabled
              aria-label="Report completed"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900"
            >
              <FilePlus2 className="size-4" />
            </button>
          ) : visit.stageResponseHref ? (
            <Link
              href={visit.stageResponseHref}
              aria-label="Add report for this visit"
              title="Add report"
              className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 active:scale-95"
            >
              <FilePlus2 className="size-4" />
            </Link>
          ) : (
            <button
              type="button"
              disabled
              aria-label="Report unavailable"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900"
            >
              <FilePlus2 className="size-4" />
            </button>
          )}

          {/* Button 2: Location / Map */}
          {isCompleted ? (
            <button
              type="button"
              disabled
              aria-label="Location (completed)"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900"
            >
              <MapPinned className="size-4" />
            </button>
          ) : visit.googleMapsUrl ? (
            <a
              href={visit.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open location in Google Maps"
              title="Google Maps Location"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 hover:text-primary dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 active:scale-95"
            >
              <MapPinned className="size-4" />
            </a>
          ) : (
            <button
              type="button"
              disabled
              aria-label="Location unavailable"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 opacity-50 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900"
            >
              <MapPinned className="size-4" />
            </button>
          )}
        </div>
      </div>
    </Card>
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
      const monthKey = currentCalendarMonthKey()
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

      <MemberVisitCompliance
        compliance={data.visitCompliance}
        hasError={data.visitComplianceHasError}
      />

      {data.requests.length > 0 ? (
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
          ) : (
            <div className="space-y-1 lg:space-y-2.5">
              {data.requests.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  onAction={openRequestWorkflow}
                  loading={loadingRequestId === request.id}
                />
              ))}
            </div>
          )}
          {requestActionError ? (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
              {requestActionError}
            </p>
          ) : null}
        </section>
      ) : null}

      {data.visits.length > 0 ? (
        <section className="space-y-3" aria-labelledby="member-today-visits-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="member-today-visits-title" className="text-lg font-semibold tracking-tight">Today's Visits</h2>
            <span className="text-xs tabular-nums text-muted-foreground">{data.visits.length}</span>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            {data.visits.map((visit) => <VisitRow key={visit.id} visit={visit} />)}
          </div>
        </section>
      ) : null}

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
