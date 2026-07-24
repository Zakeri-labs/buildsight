import { requireOnboarded } from "@/lib/auth/session"
import { loadAdminConsole } from "@/lib/db/admin-console"
import { UsersRolesView } from "@/components/users/users-roles-view"
import { Card, CardContent } from "@/components/ui/card"

export default async function UsersRolesPage() {
  const session = await requireOnboarded()
  const supervisingOrg = session.supervisingOrg
  const isAdmin =
    supervisingOrg != null &&
    session.memberships.some((m) => m.organization?.id === supervisingOrg.id && m.role === "org_admin")

  if (!supervisingOrg || !isAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="py-10 text-center">
            <h1 className="text-lg font-semibold">Users &amp; Roles</h1>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              Only administrators of the supervising organization can manage users, organizations, and project access.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const data = await loadAdminConsole(supervisingOrg.id)

  return (
    <UsersRolesView
      supervisingOrg={{ id: supervisingOrg.id, name: supervisingOrg.name }}
      data={data}
    />
  )
}
