import { NextResponse } from "next/server"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getReviewSubmissionFeed } from "@/lib/review-submissions/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [session, projectId] = await Promise.all([requireOnboarded(), getSelectedProjectId()])
    const organizationId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
    if (!organizationId) return NextResponse.json({ canReview: false, items: [] }, { headers: { "Cache-Control": "no-store" } })
    const feed = await getReviewSubmissionFeed({ userId: session.userId, organizationId, projectId })
    return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ canReview: false, items: [] }, { status: 403, headers: { "Cache-Control": "no-store" } })
  }
}
