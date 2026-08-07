"use client"

import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { CalendarEventViewModel } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

const WEEKDAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const

const EVENT_STYLES: Record<CalendarEventViewModel["kind"], string> = {
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

const EVENT_DOT_STYLES: Record<CalendarEventViewModel["kind"], string> = {
  client_request: "bg-slate-400 dark:bg-slate-500",
  scheduled_visit: "bg-blue-500",
  completed_visit: "bg-green-500",
  approved_request: "bg-emerald-500",
  cancelled: "bg-red-300 dark:bg-red-400",
}

const EVENT_STATUS_LABELS: Record<CalendarEventViewModel["kind"], string> = {
  client_request: "Client Request",
  scheduled_visit: "Scheduled",
  completed_visit: "Completed",
  approved_request: "Approved Request",
  cancelled: "Cancelled",
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getDay())
}

function dateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function weekRangeLabel(weekDays: Date[]) {
  const first = weekDays[0]
  const last = weekDays[weekDays.length - 1]
  const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
  const sameYear = first.getFullYear() === last.getFullYear()

  if (sameMonth) {
    const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(first)
    return `${month} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`
  }

  const firstLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  }).format(first)
  const lastLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(last)
  return `${firstLabel} – ${lastLabel}`
}

function selectedDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date)
}

function eventSortValue(event: CalendarEventViewModel) {
  const value = event.timeLabel?.trim() ?? ""
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (match) return Number(match[1]) * 60 + Number(match[2])
  if (value === "Morning") return 8 * 60
  if (value === "Afternoon") return 13 * 60
  return Number.MAX_SAFE_INTEGER
}

function MobileEventRow({
  event,
  onClientRequestClick,
}: {
  event: CalendarEventViewModel
  onClientRequestClick?: (requestId: string) => void
}) {
  const canOpenRequest = event.kind === "client_request" && Boolean(onClientRequestClick)
  const content = (
    <>
      <div className="w-[4.4rem] shrink-0 text-[11px] font-semibold tabular-nums text-foreground">
        {event.timeLabel ?? "—"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">{event.projectName}</p>
        {event.secondaryLabel && event.secondaryLabel !== EVENT_STATUS_LABELS[event.kind] ? (
          <p className="mt-0.5 truncate text-[10px] leading-3.5 opacity-75">{event.secondaryLabel}</p>
        ) : null}
      </div>
      <span className="shrink-0 rounded-md border border-current/15 bg-background/55 px-1.5 py-0.5 text-[9px] font-semibold leading-4">
        {EVENT_STATUS_LABELS[event.kind]}
      </span>
    </>
  )

  if (canOpenRequest) {
    return (
      <button
        type="button"
        onClick={() => onClientRequestClick?.(event.id)}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-[filter,box-shadow] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          EVENT_STYLES[event.kind],
        )}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2", EVENT_STYLES[event.kind])}>
      {content}
    </div>
  )
}

export function MobileWeeklyCalendar({
  selectedDate,
  today,
  events,
  isLoading,
  canSchedule,
  onSelectDate,
  onPreviousWeek,
  onNextWeek,
  onToday,
  onScheduleVisit,
  onClientRequestClick,
}: {
  selectedDate: Date
  today: Date
  events: CalendarEventViewModel[]
  isLoading: boolean
  canSchedule: boolean
  onSelectDate: (date: Date) => void
  onPreviousWeek: () => void
  onNextWeek: () => void
  onToday: () => void
  onScheduleVisit: () => void
  onClientRequestClick?: (requestId: string) => void
}) {
  const weekStart = startOfWeek(selectedDate)
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const eventsByDate = new Map<string, CalendarEventViewModel[]>()
  for (const event of events) {
    const dayEvents = eventsByDate.get(event.date) ?? []
    dayEvents.push(event)
    eventsByDate.set(event.date, dayEvents)
  }

  const selectedKey = dateKey(selectedDate)
  const selectedEvents = [...(eventsByDate.get(selectedKey) ?? [])].sort((left, right) => {
    const timeDifference = eventSortValue(left) - eventSortValue(right)
    if (timeDifference !== 0) return timeDifference
    return left.projectName.localeCompare(right.projectName) || left.kind.localeCompare(right.kind)
  })

  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      <CardHeader className="gap-3 border-b px-3 py-3">
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_2rem_auto] items-center gap-1.5">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onPreviousWeek} aria-label="Show previous week">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p className="min-w-0 text-center text-xs font-semibold tracking-tight text-foreground" aria-live="polite">
            {weekRangeLabel(weekDays)}
          </p>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onNextWeek} aria-label="Show next week">
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onToday}>
            Today
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1" role="list" aria-label="Days in selected week">
          {weekDays.map((day, index) => {
            const key = dateKey(day)
            const dayEvents = eventsByDate.get(key) ?? []
            const selected = isSameDay(day, selectedDate)
            const currentDay = isSameDay(day, today)
            const indicatorKinds = Array.from(new Set(dayEvents.map((event) => event.kind))).slice(0, 3)

            return (
              <button
                key={key}
                type="button"
                role="listitem"
                aria-current={selected ? "date" : undefined}
                aria-label={new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(day)}
                onClick={() => onSelectDate(day)}
                className={cn(
                  "flex min-w-0 flex-col items-center rounded-lg px-0.5 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted",
                  currentDay && !selected && "bg-primary/8 text-primary",
                )}
              >
                <span className={cn("text-[8px] font-semibold leading-3 tracking-wide", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {WEEKDAY_SHORT[index]}
                </span>
                <span className="mt-0.5 text-sm font-semibold leading-5 tabular-nums">{day.getDate()}</span>
                <span className="mt-0.5 flex h-1.5 items-center justify-center gap-0.5" aria-hidden="true">
                  {indicatorKinds.map((kind) => (
                    <span
                      key={kind}
                      className={cn("size-1 rounded-full", selected ? "bg-primary-foreground/85" : EVENT_DOT_STYLES[kind])}
                    />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </CardHeader>

      <CardContent className="px-3 py-3">
        <div className="mb-2.5 flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">{selectedDayLabel(selectedDate)}</h2>
            {isLoading ? <p className="mt-0.5 text-[10px] text-muted-foreground">Loading calendar…</p> : null}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 px-2.5 text-xs"
            disabled={!canSchedule}
            aria-disabled={!canSchedule}
            onClick={onScheduleVisit}
          >
            <CalendarPlus className="size-3.5" data-icon="inline-start" aria-hidden="true" />
            Schedule Visit
          </Button>
        </div>

        {selectedEvents.length ? (
          <div className="space-y-2">
            {selectedEvents.map((event) => (
              <MobileEventRow key={`${event.kind}:${event.id}`} event={event} onClientRequestClick={onClientRequestClick} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/15 px-3 py-5 text-center text-xs text-muted-foreground">
            No calendar events for this day.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
