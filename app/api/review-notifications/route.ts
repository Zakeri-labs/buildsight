import { NextResponse } from "next/server"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getAppNotificationFeed } from "@/lib/notifications/server"

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
