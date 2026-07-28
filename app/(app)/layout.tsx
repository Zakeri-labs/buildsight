import { requireOnboarded } from "@/lib/auth/session"
import { AppShell } from "@/components/app-shell"
import { CurrentUserProvider, type CurrentUser } from "@/components/current-user-provider"
import { getOrgProjects } from "@/lib/db/domain"
import { getSelectedProjectId } from "@/lib/project-scope"
import { resolveStageManagementOrganization } from "@/lib/db/stages"

function initials(name: string, email: string) {
  const source = name.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")
}

export default async function AppGroupLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  const session = await requireOnboarded()

  const fullName = session.profile?.full_name?.trim() || session.email

  const primary = session.memberships[0]
  const orgId = session.supervisingOrg?.id ?? primary?.organization?.id ?? null

  const [projects, selectedProjectId, stageManagementOrganization] = await Promise.all([
    orgId ? getOrgProjects(orgId) : Promise.resolve([]),
    getSelectedProjectId(),
    resolveStageManagementOrganization(session.userId, session.supervisingOrg?.id),
  ])

  const user: CurrentUser = {
    id: session.userId,
    name: fullName,
    email: session.email,
    initials: initials(fullName, session.email).toUpperCase(),
    role: primary?.role ?? null,
    organizationName: session.supervisingOrg?.name ?? primary?.organization?.name ?? null,
  }

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }))

  return (
    <CurrentUserProvider user={user}>
      <AppShell
        projects={projectOptions}
        selectedProjectId={selectedProjectId ?? "all"}
        canManageStages={Boolean(stageManagementOrganization)}
      >
        {children}
        {modal}
      </AppShell>
    </CurrentUserProvider>
  )
}
