import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getMyTasksPageData } from "@/lib/my-tasks/server"
import { MyTasksPageView } from "@/components/my-tasks/my-tasks-page-view"

export const dynamic = "force-dynamic"

export default async function MyTasksPage() {
  const [session, projectId] = await Promise.all([
    requireOnboarded(),
    getSelectedProjectId(),
  ])

  const orgId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
  const userRole = session.memberships.find((m) => m.organization?.id === orgId)?.role ?? session.memberships[0]?.role ?? null

  const data = await getMyTasksPageData({
    userId: session.userId,
    organizationId: orgId,
    projectId,
    userRole,
  })

  return <MyTasksPageView tasks={data.tasks} />
}
