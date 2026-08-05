import { CalendarPageClient } from "@/components/calendar/calendar-page-client"
import { requireOnboarded } from "@/lib/auth/session"
import { currentCalendarMonthKey } from "@/lib/calendar/date"
import { createEmptyCalendarData, getCalendarData } from "@/lib/calendar/server"

export const dynamic = "force-dynamic"

export default async function CalendarPage() {
  const session = await requireOnboarded()
  const monthKey = currentCalendarMonthKey()

  try {
    const initialData = await getCalendarData({ userId: session.userId, monthKey })
    return <CalendarPageClient initialData={initialData} />
  } catch {
    return (
      <CalendarPageClient
        initialData={createEmptyCalendarData(monthKey)}
        initialError="Unable to load calendar data. Please try again."
      />
    )
  }
}
