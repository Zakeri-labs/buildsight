"use client"

import { useMemo } from "react"
import { Pencil } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { calendarDateFromKey } from "@/lib/calendar/date"
import type { CalendarEventViewModel } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

import { getSupervisorInitials, getSupervisorTheme } from "@/components/calendar/supervisor-theme"

const EVENT_STATUS_LABELS: Record<CalendarEventViewModel["kind"], string> = {
  client_request: "Client Request",
  scheduled_visit: "Scheduled",
  completed_visit: "Completed",
  approved_request: "Approved Request",
  cancelled: "Cancelled",
}

const EVENT_BADGE_STYLES: Record<CalendarEventViewModel["kind"], string> = {
  client_request:
    "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  scheduled_visit:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200",
  completed_visit:
    "border-green-200 bg-green-50/80 text-green-700 dark:border-green-900 dark:bg-green-950/45 dark:text-green-200",
  approved_request:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  cancelled:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200",
}

function eventTimeLabel(event: CalendarEventViewModel) {
  const value = event.timeLabel?.trim() ?? ""
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return value || "—"

  const hour = Number(match[1])
  const minute = match[2]
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return value

  const suffix = hour >= 12 ? "PM" : "AM"
  const displayHour = hour % 12 || 12
  return `${String(displayHour).padStart(2, "0")}:${minute} ${suffix}`
}

function DayEventRow({
  event,
  onClientRequestClick,
  onBeforeOpenEvent,
  onEditVisit,
}: {
  event: CalendarEventViewModel
  onClientRequestClick?: (requestId: string) => void
  onBeforeOpenEvent: () => void
  onEditVisit?: (event: CalendarEventViewModel) => void
}) {
  const canOpenRequest = event.kind === "client_request" && Boolean(onClientRequestClick)
  const canEdit = Boolean(event.canEdit && onEditVisit)
  const statusLabel = EVENT_STATUS_LABELS[event.kind]
  const showSecondaryLabel = Boolean(event.secondaryLabel && event.secondaryLabel !== statusLabel)
  const supervisor = event.supervisor
  const theme = getSupervisorTheme(supervisor?.id)
  const initials = supervisor?.name ? getSupervisorInitials(supervisor.name) : null

  const content = (
    <>
      <div className="w-[5rem] shrink-0 text-xs font-semibold tabular-nums text-foreground sm:w-[6.4rem]">
        {eventTimeLabel(event)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {supervisor ? (
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold tracking-tight shadow-2xs",
                theme.bg,
                theme.text,
              )}
              title={`Supervisor: ${supervisor.name}`}
            >
              {initials}
            </span>
          ) : null}
          <p className="truncate text-sm font-semibold text-foreground">{event.projectName}</p>
        </div>
        {supervisor ? (
          <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
            Supervisor: {supervisor.name} {showSecondaryLabel ? `· ${event.secondaryLabel}` : ""}
          </p>
        ) : showSecondaryLabel ? (
          <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">{event.secondaryLabel}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "max-w-[6.5rem] shrink-0 whitespace-normal rounded-md border px-2 py-0.5 text-center text-[10px] font-semibold leading-4 sm:max-w-none sm:whitespace-nowrap",
            EVENT_BADGE_STYLES[event.kind],
          )}
        >
          {statusLabel}
        </span>
        {canEdit ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onBeforeOpenEvent()
              onEditVisit?.(event)
            }}
            className="flex size-7 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="Edit Site Visit"
            aria-label="Edit Site Visit"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </>
  )

  if (canOpenRequest) {
    return (
      <button
        type="button"
        onClick={() => {
          onBeforeOpenEvent()
          onClientRequestClick?.(event.id)
        }}
        className="flex w-full min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3"
      >
        {content}
      </button>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2.5 sm:gap-3">
      {content}
    </div>
  )
}

export function DayDetailsDialog({
  open,
  onOpenChange,
  date,
  events,
  onClientRequestClick,
  onEditVisit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string | null
  events: CalendarEventViewModel[]
  onClientRequestClick?: (requestId: string) => void
  onEditVisit?: (event: CalendarEventViewModel) => void
}) {
  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (left, right) => left.sortMinutes - right.sortMinutes || left.id.localeCompare(right.id),
      ),
    [events],
  )

  const dateLabel = date
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(calendarDateFromKey(date))
    : "Selected day"

  const allAreVisits = sortedEvents.length > 0 && sortedEvents.every((event) => event.kind !== "client_request")
  const singularLabel = allAreVisits ? "Visit" : "Event"
  const pluralLabel = allAreVisits ? "Visits" : "Events"
  const totalLabel = `${sortedEvents.length} ${sortedEvents.length === 1 ? singularLabel : pluralLabel}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(82vh,640px)] gap-3 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="gap-1 border-b px-4 pb-3 pt-4 pr-12 sm:px-5 sm:pb-4 sm:pt-5 sm:pr-12">
          <DialogTitle className="text-base font-semibold sm:text-lg">{dateLabel}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">{totalLabel}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="space-y-2">
            {sortedEvents.map((event) => (
              <DayEventRow
                key={`${event.kind}:${event.id}`}
                event={event}
                onClientRequestClick={onClientRequestClick}
                onBeforeOpenEvent={() => onOpenChange(false)}
                onEditVisit={onEditVisit}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
