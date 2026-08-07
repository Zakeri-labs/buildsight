import { AlertTriangle, CalendarPlus, Clock3, FileText, MapPinned, MessageSquare } from "lucide-react"

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

function formatTime(value: string | null): string {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return "Time TBD"
  const [hourValue, minute] = value.split(":")
  const hour = Number(hourValue)
  if (!Number.isFinite(hour)) return value
  const period = hour >= 12 ? "PM" : "AM"
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minute} ${period}`
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
  return (
    <Card size="sm" className="py-0">
      <div className="grid min-h-[5rem] grid-cols-[4.75rem_minmax(0,1fr)_2.75rem] items-stretch">
        <div className="flex flex-col items-center justify-center border-r bg-muted/30 px-2 text-center">
          <Clock3 className="mb-1 size-4 text-primary" aria-hidden="true" />
          <span className="text-xs font-semibold leading-4 tabular-nums">{formatTime(visit.scheduledTime)}</span>
        </div>
        <div className="min-w-0 self-center px-3 py-2.5">
          <p className="truncate text-sm font-semibold">{visit.projectName}</p>
          <div className="mt-1 grid min-w-0 grid-cols-1 gap-x-3 sm:grid-cols-2">
            {visit.projectCode ? <MetaLine>Code: {visit.projectCode}</MetaLine> : null}
            {visit.stageName ? <MetaLine>Stage: {visit.stageName}</MetaLine> : null}
            {visit.visitNumber ? <MetaLine>Visit {visit.visitNumber}</MetaLine> : null}
          </div>
        </div>
        <div className="flex items-center justify-center pr-2">
          <button
            type="button"
            aria-label="Visit quick action"
            className="inline-flex size-10 items-center justify-center rounded-xl border bg-background text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MapPinned className="size-5" aria-hidden="true" />
          </button>
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
        <SummaryCard label="Today's Visits" value={data.summary.todaysVisits} icon={Clock3} />
        <SummaryCard label="Visit Requests" value={data.summary.pendingVisitRequests} icon={MessageSquare} prominent />
      </div>

      {data.hasError ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>Some Member dashboard information could not be loaded. Please refresh and try again.</p>
        </div>
      ) : null}

      <section className="space-y-3" aria-labelledby="member-visit-requests-title">
        <div className="flex items-center justify-between gap-3">
          <h1 id="member-visit-requests-title" className="text-lg font-semibold tracking-tight">Visit Requests</h1>
          <span className="text-xs tabular-nums text-muted-foreground">{data.requests.length}</span>
        </div>
        {data.requests.length ? (
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
          <div className="space-y-2.5">
            {data.visits.map((visit) => <VisitRow key={visit.id} visit={visit} />)}
          </div>
        ) : (
          <EmptyState icon={MapPinned} title="No visits scheduled today" description="Today's scheduled Site Visits for your supervised projects will appear here." />
        )}
      </section>
    </div>
  )
}
