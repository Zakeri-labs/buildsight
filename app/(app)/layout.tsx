import { requireOnboarded } from "@/lib/auth/session"
import { AppShell } from "@/components/app-shell"
import { CurrentUserProvider, type CurrentUser } from "@/components/current-user-provider"

function initials(name: string, email: string) {
  const source = name.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")
}

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await requireOnboarded()

  const fullName = session.profile?.full_name?.trim() || session.email

  const primary = session.memberships[0]

  const user: CurrentUser = {
    id: session.userId,
    name: fullName,
    email: session.email,
    initials: initials(fullName, session.email).toUpperCase(),
    role: primary?.role ?? null,
    organizationName: session.supervisingOrg?.name ?? primary?.organization?.name ?? null,
  }

  return (
    <CurrentUserProvider user={user}>
      <AppShell>{children}</AppShell>
    </CurrentUserProvider>
  )
}
