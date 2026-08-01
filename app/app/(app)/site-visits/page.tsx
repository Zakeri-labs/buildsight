import { SiteVisitsPage } from "@/components/site-visits/site-visits-page"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getSiteVisitPageData } from "@/lib/site-visits/server"

export const dynamic = "force-dynamic"

export default async function SiteVisitsRoute({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const [session, params, storedProjectId] = await Promise.all([requireOnboarded(), searchParams, getSelectedProjectId()])
  const requestedProjectId = params.project?.trim() || storedProjectId
  const data = await getSiteVisitPageData({ userId: session.userId, projectId: requestedProjectId })
  return <SiteVisitsPage data={data} />
}
