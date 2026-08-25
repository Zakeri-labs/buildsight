"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarPlus } from "lucide-react"

import { CalendarSummaryCards } from "@/components/calendar/calendar-summary-cards"
import { ClientVisitRequestWorkflow } from "@/components/calendar/client-visit-request-workflow"
import { ClientVisitRequestsPanel } from "@/components/calendar/client-visit-requests-panel"
import { DayDetailsDialog } from "@/components/calendar/day-details-dialog"
import { MobileWeeklyCalendar } from "@/components/calendar/mobile-weekly-calendar"
import { MonthlyCalendar } from "@/components/calendar/monthly-calendar"
import { ScheduleSiteVisitDialog } from "@/components/calendar/schedule-site-visit-dialog"
import { SiteVisitRequestDialog } from "@/components/site-visits/site-visit-request-dialog"
import { useCurrentUser } from "@/components/current-user-provider"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { calendarDateFromKey, calendarMonthKey, currentCalendarDateKey } from "@/lib/calendar/date"
import type { CalendarClientRequestViewModel, CalendarDataViewModel } from "@/lib/calendar/types"

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

async function requestCalendarData(monthKey: string, signal?: AbortSignal): Promise<CalendarDataViewModel> {
  const response = await fetch(`/api/calendar?month=${encodeURIComponent(monthKey)}`, {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  })
  const payload = (await response.json().catch(() => null)) as CalendarDataViewModel | { error?: string } | null
  if (!response.ok || !payload || !("monthKey" in payload)) {
    throw new Error(payload && "error" in payload && payload.error ? payload.error : "Unable to load calendar data.")
  }
  return payload
}

export function CalendarPageClient({
  initialData,
  initialError = null,
}: {
  initialData: CalendarDataViewModel
  initialError?: string | null
}) {
  const currentUser = useCurrentUser()
  const isMember = currentUser.role === "org_member"
  const isViewer = currentUser.role === "viewer"
  const [today] = useState(() => calendarDateFromKey(currentCalendarDateKey()))
  const [currentMonth, setCurrentMonth] = useState(() => monthStart(calendarDateFromKey(currentCalendarDateKey())))
  const [mobileSelectedDate, setMobileSelectedDate] = useState(() => calendarDateFromKey(currentCalendarDateKey()))
  const [data, setData] = useState(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [success, setSuccess] = useState<string | null>(null)
  const [needsInitialReload, setNeedsInitialReload] = useState(Boolean(initialError))
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduleDate, setScheduleDate] = useState(() => currentCalendarDateKey())
  const [editingEvent, setEditingEvent] = useState<CalendarEventViewModel | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<CalendarClientRequestViewModel | null>(null)
  const [requestDetailsOpen, setRequestDetailsOpen] = useState(false)
  const [selectedDayDetailsDate, setSelectedDayDetailsDate] = useState<string | null>(null)
  const selectedMonthKey = calendarMonthKey(currentMonth)

  useEffect(() => {
    if (selectedMonthKey === data.monthKey && !needsInitialReload) return

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    void requestCalendarData(selectedMonthKey, controller.signal)
      .then((payload) => {
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

  const refreshSelectedMonth = useCallback(async ({
    successMessage,
    refreshErrorMessage,
  }: {
    successMessage?: string
    refreshErrorMessage: string
  }) => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await requestCalendarData(selectedMonthKey)
      setData(payload)
      setNeedsInitialReload(false)
      setSuccess(successMessage ?? null)
    } catch {
      setError(refreshErrorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [selectedMonthKey])

  const refreshAfterDirectSchedule = useCallback(() => refreshSelectedMonth({
    successMessage: "Site Visit scheduled successfully.",
    refreshErrorMessage: "The Site Visit was scheduled, but the Calendar could not be refreshed. Please try again.",
  }), [refreshSelectedMonth])

  const refreshAfterRequestApproval = useCallback(async () => {
    setSelectedRequest(null)
    setRequestDetailsOpen(false)
    await refreshSelectedMonth({
      successMessage: "Client Visit Request approved and scheduled.",
      refreshErrorMessage: "The request was processed, but the Calendar could not be refreshed. Please try again.",
    })
  }, [refreshSelectedMonth])

  const refreshAfterStaleRequest = useCallback(async () => {
    setSelectedRequest(null)
    setRequestDetailsOpen(false)
    await refreshSelectedMonth({
      refreshErrorMessage: "Unable to refresh the Calendar. Please try again.",
    })
  }, [refreshSelectedMonth])

  function showPreviousMonth() {
    setSelectedDayDetailsDate(null)
    setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))
  }

  function showNextMonth() {
    setSelectedDayDetailsDate(null)
    setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))
  }

  function showCurrentMonth() {
    setSelectedDayDetailsDate(null)
    setCurrentMonth(monthStart(calendarDateFromKey(currentCalendarDateKey())))
  }

  function selectMobileDate(date: Date) {
    const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    setMobileSelectedDate(normalizedDate)
    setCurrentMonth(monthStart(normalizedDate))
  }

  function showPreviousWeek() {
    selectMobileDate(addDays(mobileSelectedDate, -7))
  }

  function showNextWeek() {
    selectMobileDate(addDays(mobileSelectedDate, 7))
  }

  function showTodayOnMobile() {
    selectMobileDate(calendarDateFromKey(currentCalendarDateKey()))
  }

  function openScheduleDialog(date: string) {
    if (!data.scheduling.canSchedule) return
    setScheduleDate(date)
    setSuccess(null)
    setScheduleDialogOpen(true)
  }

  function openClientRequest(request: CalendarClientRequestViewModel) {
    setSelectedRequest(request)
    setSuccess(null)
    setRequestDetailsOpen(true)
  }

  function openClientRequestById(requestId: string) {
    const request = data.pendingRequests.find((item) => item.id === requestId)
    if (request) openClientRequest(request)
  }

  const visibleEvents = useMemo(
    () => (data.monthKey === selectedMonthKey ? data.events : []),
    [data.events, data.monthKey, selectedMonthKey],
  )

  const selectedDayEvents = useMemo(
    () => selectedDayDetailsDate ? visibleEvents.filter((event) => event.date === selectedDayDetailsDate) : [],
    [selectedDayDetailsDate, visibleEvents],
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
      onEmptyDayClick={data.scheduling.canSchedule ? openScheduleDialog : undefined}
      onClientRequestClick={openClientRequestById}
      onDayDetailsClick={setSelectedDayDetailsDate}
    />
  )

  const isAdmin = currentUser.role === "org_admin" || currentUser.role === "org_manager"

  const pageHeader = (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage scheduled site visits and client visit requests.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && data.requesting.canRequest ? (
          <SiteVisitRequestDialog
            projects={data.requesting.projects}
            triggerLabel="Add Request"
            triggerVariant="outline"
          />
        ) : null}
        {isViewer ? (
          data.requesting.canRequest ? (
            <SiteVisitRequestDialog
              projects={data.requesting.projects}
              triggerLabel="Request Site Visit"
            />
          ) : null
        ) : (
          <Button
            type="button"
            size="lg"
            disabled={!data.scheduling.canSchedule}
            aria-disabled={!data.scheduling.canSchedule}
            onClick={() => openScheduleDialog(currentCalendarDateKey())}
          >
            <CalendarPlus data-icon="inline-start" aria-hidden="true" />
            Schedule Visit
          </Button>
        )}
      </div>
    </header>
  )

  const desktopCalendarLayout = (
    <>
      <div className="hidden min-w-0 items-stretch gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
        {calendar}
        <ClientVisitRequestsPanel requests={data.pendingRequests} onRequestClick={openClientRequest} />
      </div>

      <Tabs defaultValue="calendar" className="min-w-0 lg:hidden">
        <TabsList className="grid h-9 w-full grid-cols-2">
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="requests">Client Requests</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="min-w-0 pt-2">{calendar}</TabsContent>
        <TabsContent value="requests" className="pt-2">
          <ClientVisitRequestsPanel requests={data.pendingRequests} onRequestClick={openClientRequest} />
        </TabsContent>
      </Tabs>
    </>
  )

  return (
    <div className={isMember ? "flex min-w-0 flex-col gap-3 md:gap-6" : "flex min-w-0 flex-col gap-5 md:gap-6"}>
      {isMember ? <div className="hidden md:block">{pageHeader}</div> : pageHeader}

      <CalendarSummaryCards summary={data.summary} memberMobile={isMember} />

      {success ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
          {success}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isMember ? (
        <>
          <div className="flex min-w-0 flex-col gap-3 md:hidden">
            <ClientVisitRequestsPanel
              requests={data.pendingRequests}
              onRequestClick={openClientRequest}
              mobileCollapsible
            />
            <MobileWeeklyCalendar
              selectedDate={mobileSelectedDate}
              today={today}
              events={visibleEvents}
              isLoading={isLoading}
              canSchedule={data.scheduling.canSchedule}
              onSelectDate={selectMobileDate}
              onPreviousWeek={showPreviousWeek}
              onNextWeek={showNextWeek}
              onToday={showTodayOnMobile}
              onScheduleVisit={() => openScheduleDialog(currentCalendarDateKey())}
              onClientRequestClick={openClientRequestById}
              onEditVisit={openEditDialog}
            />
          </div>
          <div className="hidden md:block">{desktopCalendarLayout}</div>
        </>
      ) : desktopCalendarLayout}

      {data.scheduling.canSchedule ? (
        <ScheduleSiteVisitDialog
          open={scheduleDialogOpen}
          onOpenChange={(open) => {
            setScheduleDialogOpen(open)
            if (!open) setEditingEvent(null)
          }}
          projects={data.scheduling.projects}
          initialDate={scheduleDate}
          editVisit={editingEvent}
          onScheduled={refreshAfterDirectSchedule}
        />
      ) : null}

      <DayDetailsDialog
        open={Boolean(selectedDayDetailsDate)}
        onOpenChange={(open) => { if (!open) setSelectedDayDetailsDate(null) }}
        date={selectedDayDetailsDate}
        events={selectedDayEvents}
        onClientRequestClick={openClientRequestById}
        onEditVisit={openEditDialog}
      />

      <ClientVisitRequestWorkflow
        request={selectedRequest}
        open={requestDetailsOpen}
        onOpenChange={setRequestDetailsOpen}
        schedulingProjects={data.scheduling.projects}
        onScheduled={refreshAfterRequestApproval}
        onRefreshRequired={refreshAfterStaleRequest}
      />
    </div>
  )
}
