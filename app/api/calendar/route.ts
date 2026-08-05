import { NextResponse } from "next/server"

import { isCalendarMonthKey } from "@/lib/calendar/date"
import { getCalendarData } from "@/lib/calendar/server"
import { getSession } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 })

  const monthKey = new URL(request.url).searchParams.get("month")?.trim() ?? ""
  if (!isCalendarMonthKey(monthKey)) {
    return NextResponse.json({ error: "Invalid calendar month." }, { status: 400 })
  }

  try {
    const data = await getCalendarData({ userId: session.userId, monthKey })
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json(
      { error: "Unable to load calendar data. Please try again." },
      { status: 500 },
    )
  }
}
