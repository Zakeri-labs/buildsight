"use client"

import { useState } from "react"
import { CalendarPlus } from "lucide-react"

import { CalendarSummaryCards } from "@/components/calendar/calendar-summary-cards"
import { ClientVisitRequestsPanel } from "@/components/calendar/client-visit-requests-panel"
import { MonthlyCalendar } from "@/components/calendar/monthly-calendar"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function CalendarPageClient() {
  const [today] = useState(() => new Date())
  const [currentMonth, setCurrentMonth] = useState(() => monthStart(new Date()))

  function showPreviousMonth() {
    setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))
  }

  function showNextMonth() {
    setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))
  }

  function showCurrentMonth() {
    setCurrentMonth(monthStart(new Date()))
  }

  const calendar = (
    <MonthlyCalendar
      currentMonth={currentMonth}
      today={today}
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

      <CalendarSummaryCards />

      <div className="hidden min-w-0 items-stretch gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
        {calendar}
        <ClientVisitRequestsPanel />
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
          <ClientVisitRequestsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
