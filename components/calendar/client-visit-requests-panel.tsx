"use client"

import { useState } from "react"
import { CalendarSearch, ChevronDown } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CalendarClientRequestViewModel } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

function displayDate(request: CalendarClientRequestViewModel) {
  if (request.isAsap || !request.requestedDate) return "ASAP"
  const date = new Date(`${request.requestedDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return request.requestedDate
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function RequestItems({
  requests,
  onRequestClick,
  compact = false,
}: {
  requests: CalendarClientRequestViewModel[]
  onRequestClick?: (request: CalendarClientRequestViewModel) => void
  compact?: boolean
}) {
  return (
    <div className="divide-y">
      {requests.map((request) => (
        <button
          key={request.id}
          type="button"
          onClick={() => onRequestClick?.(request)}
          className={cn(
            "block w-full text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            compact ? "px-3 py-2.5" : "px-4 py-3.5",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className={cn("truncate font-semibold text-foreground", compact ? "text-xs" : "text-sm")}>
                {request.projectName}
              </h2>
              <p className={cn("mt-0.5 text-muted-foreground", compact ? "text-[10px] leading-4" : "text-xs")}>
                {displayDate(request)} · {request.preferredTimeLabel}
              </p>
            </div>
            <Badge variant="outline" className={cn("shrink-0 text-muted-foreground", compact && "px-1.5 py-0 text-[9px]")}>
              Pending
            </Badge>
          </div>
          {request.requestedBy ? (
            <p className={cn("truncate text-muted-foreground", compact ? "mt-1 text-[10px]" : "mt-2 text-xs")}>
              Requested by {request.requestedBy}
            </p>
          ) : null}
          {request.notesPreview ? (
            <p className={cn("line-clamp-2 text-foreground/75", compact ? "mt-1 text-[10px] leading-4" : "mt-1.5 text-xs leading-5")}>
              {request.notesPreview}
            </p>
          ) : null}
        </button>
      ))}
    </div>
  )
}

function MobileCollapsibleRequests({
  requests,
  onRequestClick,
}: {
  requests: CalendarClientRequestViewModel[]
  onRequestClick?: (request: CalendarClientRequestViewModel) => void
}) {
  const [open, setOpen] = useState(false)
  const canExpand = requests.length > 0

  return (
    <Card className={cn("min-w-0 gap-0 overflow-hidden py-0", !canExpand && "bg-muted/15")}>
      <button
        type="button"
        disabled={!canExpand}
        aria-expanded={canExpand ? open : false}
        onClick={() => { if (canExpand) setOpen((value) => !value) }}
        className={cn(
          "flex min-h-11 w-full min-w-0 items-center gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          canExpand ? "hover:bg-muted/35" : "cursor-default text-muted-foreground",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">Client Visit Requests</span>
        <Badge
          variant="secondary"
          className="h-5 min-w-5 shrink-0 justify-center px-1.5 text-[10px] tabular-nums"
          aria-label={`${requests.length} client visit ${requests.length === 1 ? "request" : "requests"}`}
        >
          {requests.length}
        </Badge>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180", !canExpand && "opacity-40")}
          aria-hidden="true"
        />
      </button>

      {canExpand && open ? (
        <div className="border-t bg-card">
          <RequestItems requests={requests} onRequestClick={onRequestClick} compact />
        </div>
      ) : null}
    </Card>
  )
}

export function ClientVisitRequestsPanel({
  requests,
  className,
  onRequestClick,
  mobileCollapsible = false,
}: {
  requests: CalendarClientRequestViewModel[]
  className?: string
  onRequestClick?: (request: CalendarClientRequestViewModel) => void
  mobileCollapsible?: boolean
}) {
  if (mobileCollapsible) {
    return <MobileCollapsibleRequests requests={requests} onRequestClick={onRequestClick} />
  }

  return (
    <Card className={cn("h-full min-h-[360px]", className)}>
      <CardHeader className="border-b">
        <CardTitle>Client Visit Requests</CardTitle>
        <CardAction>
          <Badge
            variant="secondary"
            aria-label={`${requests.length} client visit ${requests.length === 1 ? "request" : "requests"}`}
          >
            {requests.length}
          </Badge>
        </CardAction>
      </CardHeader>

      {requests.length ? (
        <CardContent className="min-h-0 flex-1 overflow-y-auto px-0">
          <RequestItems requests={requests} onRequestClick={onRequestClick} />
        </CardContent>
      ) : (
        <CardContent className="flex flex-1 items-center justify-center py-10">
          <div className="mx-auto flex max-w-xs flex-col items-center text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <CalendarSearch className="size-6" aria-hidden="true" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">No client visit requests</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              New requests will appear here in preferred visit date order.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
