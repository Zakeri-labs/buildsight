import Link from "next/link"

import { AlertTriangle, CalendarPlus, Clock3, FilePlus2, FileText, MapPinned, MessageSquare } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
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

function SummaryCard({ label, value, icon: Icon, prominent = false }: {
  label: string
  value: number
  icon: React.ElementType
  prominent?: boolean
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
        <div className="flex items-start justify-between gap-1.5">
          <p className="min-w-0 text-[11px] font-medium leading-4 text-muted-foreground sm:text-xs">{label}</p>
          <Icon className={cn("size-4 shrink-0", prominent ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
      </CardContent>
    </Card>
  )
}

function RequestRow({ request }: { request: MemberHomepageRequest }) {
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
            className="inline-flex size-10 items-center justify-center rounded-xl border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  const actionClass =
    "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  const disabledActionClass = `${actionClass} cursor-not-allowed opacity-40 hover:bg-background hover:text-muted-foreground`

  return (
    <Card size="sm" className="overflow-hidden py-0">
      <div className="grid min-h-[4.5rem] grid-cols-[3.1rem_minmax(0,1.15fr)_minmax(4.7rem,0.9fr)_5rem] items-stretch sm:min-h-[4.25rem] sm:grid-cols-[4rem_minmax(0,1.3fr)_minmax(6rem,1fr)_5.5rem]">
        <div className="flex min-w-0 flex-col items-center justify-center bg-sidebar px-1 text-center text-white">
          {scheduledTime ? (
            <>
              <span className="text-sm font-bold leading-4 tabular-nums sm:text-base">{scheduledTime.time}</span>
              <span className="mt-0.5 text-[10px] font-bold uppercase leading-3 tracking-wide text-white/85 sm:text-[11px]">{scheduledTime.period}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-white/75">—</span>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-center px-2 py-1.5 sm:px-2.5">
          <p className="min-w-0 break-words text-xs font-semibold leading-4 sm:text-sm">{visit.projectName}</p>
          {visit.projectCode ? (
            <p className="mt-0.5 min-w-0 whitespace-normal break-words text-[10px] leading-3 text-muted-foreground sm:text-[11px] sm:leading-4">
              {visit.projectCode}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col justify-center border-l px-2 py-1.5 sm:px-2.5">
          {visit.stageName ? (
            <p className="min-w-0 truncate text-[11px] font-semibold leading-4 sm:text-xs">{visit.stageName}</p>
          ) : null}
          {visit.visitNumber ? (
            <p className="mt-0.5 whitespace-nowrap text-[10px] leading-3 text-muted-foreground sm:text-[11px] sm:leading-4">Visit No. {visit.visitNumber}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-center gap-1 border-l px-0.5">
          {visit.stageResponseHref ? (
            <Link href={visit.stageResponseHref} aria-label="Open stage response" className={actionClass}>
              <FilePlus2 className="size-[18px]" aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" aria-label="Open stage response" className={disabledActionClass} disabled>
              <FilePlus2 className="size-[18px]" aria-hidden="true" />
            </button>
          )}
          {visit.googleMapsUrl ? (
            <a
              href={visit.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open project location in Google Maps"
              className={actionClass}
            >
              <MapPinned className="size-[18px]" aria-hidden="true" />
            </a>
          ) : (
            <button type="button" aria-label="Open project location in Google Maps" className={disabledActionClass} disabled>
              <MapPinned className="size-[18px]" aria-hidden="true" />
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
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 overflow-x-hidden">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <SummaryCard label="Today's Reports" value={data.summary.todaysReports} icon={FileText} />
        <SummaryCard label="Tomorrow's Visits" value={data.summary.tomorrowsVisits} icon={Clock3} />
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
            {data.requests.map((request) => <RequestRow key={request.id} request={request} />)}
          </div>
        ) : (
          <EmptyState icon={CalendarPlus} title="No pending visit requests" description="New client visit requests for your supervised projects will appear here." />
        )}
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
    </div>
  )
}
