import { NextResponse } from "next/server"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getAppNotificationFeed, markNotificationAsRead } from "@/lib/notifications/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [session, projectId] = await Promise.all([requireOnboarded(), getSelectedProjectId()])
    const organizationId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
    const feed = await getAppNotificationFeed({ userId: session.userId, organizationId, projectId })
    return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ canNotify: false, items: [] }, { status: 403, headers: { "Cache-Control": "no-store" } })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireOnboarded()
    const body = (await request.json().catch(() => ({}))) as { notificationKey?: string }
    const key = body.notificationKey?.trim()
    if (!key) {
      return NextResponse.json({ error: "Notification key required" }, { status: 400 })
    }
    await markNotificationAsRead({ userId: session.userId, notificationKey: key })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to mark notification read" }, { status: 500 })
  }
}

