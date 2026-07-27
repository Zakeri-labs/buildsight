import { Card, CardContent } from "@/components/ui/card"
import { ProjectCreateForm } from "@/components/projects/project-create-form"
import { isOrgAdmin, requireOnboarded } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"

export default async function NewProjectPage() {
  const session = await requireOnboarded()
  const supervisingOrg = session.supervisingOrg

  if (!supervisingOrg || !isOrgAdmin(session, supervisingOrg.id)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="py-10 text-center">
            <h1 className="text-lg font-semibold">Add Project</h1>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              Only administrators of the supervising organization can create projects.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const admin = createAdminClient()
  const [{ data: projectRows }, { data: memberRows }] = await Promise.all([
    admin.from("projects").select("id").eq("supervising_organization_id", supervisingOrg.id),
    admin.from("organization_memberships").select("user_id").eq("organization_id", supervisingOrg.id).eq("status", "active"),
  ])

  const projectIds = (projectRows ?? []).map((project) => project.id)
  const memberIds = Array.from(new Set([session.userId, ...(memberRows ?? []).map((membership) => membership.user_id)]))
  const { data: participantRows } = projectIds.length
    ? await admin.from("project_organization_memberships").select("organization_id").in("project_id", projectIds)
    : { data: [] as Array<{ organization_id: string }> }

  const organizationIds = Array.from(new Set((participantRows ?? []).map((membership) => membership.organization_id)))
  const [createdOrganizations, participantOrganizations] = await Promise.all([
    memberIds.length
      ? admin.from("organizations").select("id, name, status").eq("type", "external").neq("status", "suspended").in("created_by", memberIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; status: string }> }),
    organizationIds.length
      ? admin.from("organizations").select("id, name, status").eq("type", "external").neq("status", "suspended").in("id", organizationIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; status: string }> }),
  ])

  const contractorOrganizations = Array.from(
    new Map(
      [...(createdOrganizations.data ?? []), ...(participantOrganizations.data ?? [])]
        .map((organization) => [organization.id, { id: organization.id, name: organization.name }] as const),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <ProjectCreateForm
      supervisingOrg={{ id: supervisingOrg.id, name: supervisingOrg.name }}
      contractorOrganizations={contractorOrganizations}
    />
  )
}
