"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarPlus } from "lucide-react"

import { CalendarSummaryCards } from "@/components/calendar/calendar-summary-cards"
import { ClientVisitRequestsPanel } from "@/components/calendar/client-visit-requests-panel"
import { MonthlyCalendar } from "@/components/calendar/monthly-calendar"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { calendarMonthKey } from "@/lib/calendar/date"
import type { CalendarDataViewModel } from "@/lib/calendar/types"

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function CalendarPageClient({
  initialData,
  initialError = null,
}: {
  initialData: CalendarDataViewModel
  initialError?: string | null
}) {
  const [today] = useState(() => new Date())
  const [currentMonth, setCurrentMonth] = useState(() => monthStart(new Date()))
  const [data, setData] = useState(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [needsInitialReload, setNeedsInitialReload] = useState(Boolean(initialError))
  const selectedMonthKey = calendarMonthKey(currentMonth)

  useEffect(() => {
    if (selectedMonthKey === data.monthKey && !needsInitialReload) return

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    void fetch(`/api/calendar?month=${encodeURIComponent(selectedMonthKey)}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | CalendarDataViewModel
          | { error?: string }
          | null
        if (!response.ok || !payload || !("monthKey" in payload)) {
          throw new Error(payload && "error" in payload && payload.error ? payload.error : "Unable to load calendar data.")
        }
        setData(payload)
        setNeedsInitialReload(false)
      })
      .catch((fetchError: unknown) => {
        if (controller.signal.aborted) return
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load calendar data. Please try again.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [selectedMonthKey, data.monthKey, needsInitialReload])

  function showPreviousMonth() {
    setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))
  }

  function showNextMonth() {
    setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))
  }

  function showCurrentMonth() {
    setCurrentMonth(monthStart(new Date()))
  }

  const visibleEvents = useMemo(
    () => (data.monthKey === selectedMonthKey ? data.events : []),
    [data.events, data.monthKey, selectedMonthKey],
  )

  const calendar = (
    <MonthlyCalendar
      currentMonth={currentMonth}
      today={today}
      events={visibleEvents}
      isLoading={isLoading}
      onPreviousMonth={showPreviousMonth}
      onNextMonth={showNextMonth}
      onToday={showCurrentMonth}
    />
  )

  return (
    <div className="flex min-w-0 flex-col gap-5 md:gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage scheduled site visits and client visit requests.
          </p>
        </div>
        <Button type="button" size="lg" disabled aria-disabled="true">
          <CalendarPlus data-icon="inline-start" aria-hidden="true" />
          Schedule Visit
        </Button>
      </header>

      <CalendarSummaryCards summary={data.summary} />

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="hidden min-w-0 items-stretch gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
        {calendar}
        <ClientVisitRequestsPanel requests={data.pendingRequests} />
      </div>

      <Tabs defaultValue="calendar" className="min-w-0 lg:hidden">
        <TabsList className="grid h-9 w-full grid-cols-2">
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="requests">Client Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="min-w-0 pt-2">
          {calendar}
        </TabsContent>
        <TabsContent value="requests" className="pt-2">
          <ClientVisitRequestsPanel requests={data.pendingRequests} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
