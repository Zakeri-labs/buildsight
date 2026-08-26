import { SiteVisitsPage } from "@/components/site-visits/site-visits-page"
import { requireOnboarded } from "@/lib/auth/session"
import { resolveDashboardDateRange } from "@/lib/dashboard/date-range"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getSiteVisitPageData } from "@/lib/site-visits/server"

export const dynamic = "force-dynamic"

export default async function SiteVisitsRoute({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string
    range?: string | string[]
    from?: string | string[]
    to?: string | string[]
  }>
}) {
  const session = await requireOnboarded()
  const [params, storedProjectId] = await Promise.all([searchParams, getSelectedProjectId()])
  const requestedProjectId = params.project?.trim() || storedProjectId
  const dateRange = resolveDashboardDateRange(params)
  const memberSupervisorOnly = session.memberships[0]?.role === "org_member"
  const data = await getSiteVisitPageData({
    userId: session.userId,
    projectId: requestedProjectId,
    dateRange,
    memberSupervisorOnly,
  })
  return <SiteVisitsPage data={data} dateRange={dateRange} />
}

