import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { CalendarEventViewModel } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const MAX_VISIBLE_EVENTS = 2

const LEGEND_ITEMS = [
  { label: "Client Request", dotClassName: "bg-slate-400 dark:bg-slate-500" },
  { label: "Scheduled Visit", dotClassName: "bg-blue-500" },
  { label: "Completed", dotClassName: "bg-green-500" },
  { label: "Approved Request", dotClassName: "bg-emerald-500" },
  { label: "Cancelled", dotClassName: "bg-red-300 dark:bg-red-400" },
] as const

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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

function isSameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function dateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function getVisibleDays(month: Date) {
  const firstDay = startOfMonth(month)
  const gridStart = addDays(firstDay, -firstDay.getDay())
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const trailingDayCount = 6 - lastDay.getDay()
  const visibleDayCount = Math.max(35, firstDay.getDay() + lastDay.getDate() + trailingDayCount)

  return Array.from({ length: visibleDayCount }, (_, index) => addDays(gridStart, index))
}

function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Calendar event color legend">
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-2 rounded-full", item.dotClassName)} aria-hidden="true" />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

function CalendarEventChip({
  event,
  onClientRequestClick,
}: {
  event: CalendarEventViewModel
  onClientRequestClick?: (requestId: string) => void
}) {
  const details = [event.secondaryLabel, event.timeLabel].filter(Boolean).join(" · ")
  const canOpenRequest = event.kind === "client_request" && Boolean(onClientRequestClick)

  return (
    <div
      className={cn(
        "min-w-0 rounded-md border px-1.5 py-1 text-[10px] leading-tight",
        EVENT_STYLES[event.kind],
        canOpenRequest && "cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      role={canOpenRequest ? "button" : undefined}
      tabIndex={canOpenRequest ? 0 : undefined}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        if (canOpenRequest) onClientRequestClick?.(event.id)
      }}
      onKeyDown={(keyboardEvent) => {
        if (!canOpenRequest || !["Enter", " "].includes(keyboardEvent.key)) return
        keyboardEvent.preventDefault()
        keyboardEvent.stopPropagation()
        onClientRequestClick?.(event.id)
      }}
      title={`${event.projectName}${details ? ` — ${details}` : ""}`}
      aria-label={`${event.projectName}${details ? `, ${details}` : ""}`}
    >
      <span className="block truncate font-semibold">{event.projectName}</span>
      <span className="mt-0.5 block truncate opacity-80">{details}</span>
    </div>
  )
}

export function MonthlyCalendar({
  currentMonth,
  today,
  events,
  isLoading,
  onPreviousMonth,
  onNextMonth,
  onToday,
  onEmptyDayClick,
  onClientRequestClick,
  onDayDetailsClick,
}: {
  currentMonth: Date
  today: Date
  events: CalendarEventViewModel[]
  isLoading: boolean
  onPreviousMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onEmptyDayClick?: (date: string) => void
  onClientRequestClick?: (requestId: string) => void
  onDayDetailsClick?: (date: string) => void
}) {
  const visibleDays = getVisibleDays(currentMonth)
  const monthTitle = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(currentMonth)
  const eventsByDate = new Map<string, CalendarEventViewModel[]>()
  for (const event of events) {
    const dayEvents = eventsByDate.get(event.date) ?? []
    dayEvents.push(event)
    eventsByDate.set(event.date, dayEvents)
  }

  return (
    <Card className="min-w-0 gap-0 py-0">
      <CardHeader className="gap-4 border-b px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground" aria-live="polite">
              {monthTitle}
            </h2>
            {isLoading ? (
              <span className="animate-pulse text-xs text-muted-foreground" role="status">
                Loading...
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border bg-background p-0.5 shadow-xs">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onPreviousMonth}
                aria-label="Show previous month"
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onNextMonth}
                aria-label="Show next month"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onToday}>
              Today
            </Button>
          </div>
        </div>
        <CalendarLegend />
      </CardHeader>

      <CardContent className="px-0">
        <div className="max-w-full overflow-x-auto overscroll-x-contain">
          <div className="min-w-[700px]">
            <div
              className="grid grid-cols-7 border-b bg-muted/35"
              role="row"
              aria-label="Days of the week"
            >
              {WEEKDAYS.map((weekday) => (
                <div
                  key={weekday}
                  role="columnheader"
                  className="border-r px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7" role="grid" aria-label={`${monthTitle} calendar`}>
              {visibleDays.map((day, index) => {
                const belongsToCurrentMonth = day.getMonth() === currentMonth.getMonth()
                const isToday = isSameDay(day, today)
                const isLastColumn = index % 7 === 6
                const isLastRow = index >= visibleDays.length - 7
                const key = dateKey(day)
                const dayEvents = eventsByDate.get(key) ?? []
                const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS)
                const hiddenEventCount = Math.max(0, dayEvents.length - visibleEvents.length)
                const canScheduleDay = Boolean(onEmptyDayClick) && dayEvents.length === 0
                const fullDateLabel = new Intl.DateTimeFormat("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }).format(day)

                return (
                  <div
                    key={key}
                    role="gridcell"
                    aria-label={fullDateLabel}
                    aria-current={isToday ? "date" : undefined}
                    tabIndex={canScheduleDay ? 0 : undefined}
                    onClick={() => { if (canScheduleDay) onEmptyDayClick?.(key) }}
                    onKeyDown={(keyboardEvent) => {
                      if (!canScheduleDay || !["Enter", " "].includes(keyboardEvent.key)) return
                      keyboardEvent.preventDefault()
                      onEmptyDayClick?.(key)
                    }}
                    className={cn(
                      "group min-h-[104px] border-r border-b bg-card p-2.5 transition-colors hover:bg-muted/35",
                      isLastColumn && "border-r-0",
                      isLastRow && "border-b-0",
                      !belongsToCurrentMonth && "bg-muted/20 text-muted-foreground/70",
                      canScheduleDay && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-lg text-xs font-medium tabular-nums",
                          belongsToCurrentMonth ? "text-foreground" : "text-muted-foreground/70",
                          isToday &&
                            "border border-primary/50 bg-primary/10 font-semibold text-primary ring-2 ring-primary/10",
                        )}
                      >
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="mt-1.5 min-h-14 space-y-1" data-calendar-events>
                      {visibleEvents.map((event) => (
                        <CalendarEventChip key={event.id} event={event} onClientRequestClick={onClientRequestClick} />
                      ))}
                      {hiddenEventCount > 0 ? (
                        <button
                          type="button"
                          className="cursor-pointer rounded px-1 text-left text-[10px] font-semibold text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation()
                            onDayDetailsClick?.(key)
                          }}
                          aria-label={`Show all ${dayEvents.length} events for ${fullDateLabel}`}
                        >
                          +{hiddenEventCount} more
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
