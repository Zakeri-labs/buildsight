import { requireOnboarded } from "@/lib/auth/session"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"
import type { OrganizationRole } from "@/lib/db/types"
import { AppShell } from "@/components/app-shell"
import { CurrentUserProvider, type CurrentUser } from "@/components/current-user-provider"
import { getOrgProjects } from "@/lib/db/domain"
import { getSelectedProjectId } from "@/lib/project-scope"
import { resolveStageManagementOrganization } from "@/lib/db/stages"
import { getAppNotificationFeed } from "@/lib/notifications/server"
import { getSiteVisitProjectAccess } from "@/lib/site-visits/access"

function initials(name: string, email: string) {
  const source = name.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")
}

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireOnboarded()

  const fullName = session.profile?.full_name?.trim() || session.email

  const primary = session.memberships[0]
  const orgId = session.supervisingOrg?.id ?? primary?.organization?.id ?? null

  const [projects, selectedProjectId, stageManagementOrganization, siteVisitAccess] = await Promise.all([
    orgId ? getOrgProjects(orgId, session.userId) : Promise.resolve([]),
    getSelectedProjectId(),
    resolveStageManagementOrganization(session.userId, session.supervisingOrg?.id),
    getSiteVisitProjectAccess(session.userId),
  ])
  const notificationFeed = await getAppNotificationFeed({
    userId: session.userId,
    organizationId: orgId,
    projectId: selectedProjectId,
  })

  const effectiveRes = await resolveUserEffectiveRole(session.userId, session.email)
  const resolvedRole: OrganizationRole | null =
    effectiveRes.role === "admin"
      ? (primary?.role === "org_manager" ? "org_manager" : "org_admin")
      : effectiveRes.role === "member"
        ? "org_member"
        : effectiveRes.role === "viewer"
          ? "viewer"
          : primary?.role ?? null

  const user: CurrentUser = {
    id: session.userId,
    name: fullName,
    email: session.email,
    initials: initials(fullName, session.email).toUpperCase(),
    role: resolvedRole,
    organizationName: session.supervisingOrg?.name ?? primary?.organization?.name ?? null,
    avatarUrl: session.profile?.avatar_url ?? null,
  }

  const isOrgTeam = session.memberships.some(
    (m) => m.role === "org_member" || m.role === "org_admin" || m.role === "org_manager",
  )
  const canShowSiteVisitsInSidebar = !isOrgTeam && siteVisitAccess.size > 0
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }))

  return (
    <CurrentUserProvider user={user}>
      <AppShell
        projects={projectOptions}
        selectedProjectId={selectedProjectId ?? "all"}
        canManageStages={Boolean(stageManagementOrganization)}
        canAccessSiteVisits={canShowSiteVisitsInSidebar}
        notificationFeed={notificationFeed}
      >
        {children}
      </AppShell>
    </CurrentUserProvider>
  )
}
