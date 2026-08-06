import { Card, CardContent } from "@/components/ui/card"
import { ProjectCreateForm } from "@/components/projects/project-create-form"
import { requireOnboarded } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { canAdministerOrganization } from "@/lib/auth/guards"
import { isProjectSupervisorOrganizationRole } from "@/lib/projects/supervisor-candidates"

export async function ProjectCreateContent() {
  const session = await requireOnboarded()
  const supervisingOrg = session.supervisingOrg
  const canCreateProjects = supervisingOrg
    ? await canAdministerOrganization(supervisingOrg.id)
    : false

  if (!supervisingOrg || !canCreateProjects) {
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
    admin.from("projects").select("id, code").eq("supervising_organization_id", supervisingOrg.id),
    admin
      .from("organization_memberships")
      .select("user_id, role")
      .eq("organization_id", supervisingOrg.id)
      .eq("status", "active"),
  ])

  const existingProjectCodes = (projectRows ?? []).map((project) => project.code).filter(Boolean) as string[]
  const projectIds = (projectRows ?? []).map((project) => project.id)
  const memberIds = Array.from(new Set([session.userId, ...(memberRows ?? []).map((membership) => membership.user_id)]))
  const [{ data: profileRows }, participantMemberships] = await Promise.all([
    memberIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", memberIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string | null }> }),
    projectIds.length
      ? admin.from("project_organization_memberships").select("organization_id").in("project_id", projectIds)
      : Promise.resolve({ data: [] as Array<{ organization_id: string }> }),
  ])

  const membershipRoleByUser = new Map(
    (memberRows ?? []).map((membership) => [membership.user_id, membership.role] as const),
  )
  const userOptions = (profileRows ?? [])
    .map((profile) => ({
      id: profile.id,
      name: profile.full_name?.trim() || profile.email || "Organization member",
      email: profile.email || "",
      organizationRole: membershipRoleByUser.get(profile.id) || (profile.id === session.userId ? "org_admin" : "org_member"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const supervisorOptions = userOptions.filter((user) =>
    isProjectSupervisorOrganizationRole(user.organizationRole),
  )

  const organizationIds = Array.from(
    new Set((participantMemberships.data ?? []).map((membership) => membership.organization_id)),
  )
  const [createdOrganizations, participantOrganizations] = await Promise.all([
    memberIds.length
      ? admin
          .from("organizations")
          .select("id, name, status, organization_category, registration_number, address, postal_code, phone")
          .eq("type", "external")
          .neq("status", "suspended")
          .in("created_by", memberIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; status: string; organization_category: string | null; registration_number: string | null; address: string | null; postal_code: string | null; phone: string | null }> }),
    organizationIds.length
      ? admin
          .from("organizations")
          .select("id, name, status, organization_category, registration_number, address, postal_code, phone")
          .eq("type", "external")
          .neq("status", "suspended")
          .in("id", organizationIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; status: string; organization_category: string | null; registration_number: string | null; address: string | null; postal_code: string | null; phone: string | null }> }),
  ])

  const contractorOrganizations = Array.from(
    new Map(
      [...(createdOrganizations.data ?? []), ...(participantOrganizations.data ?? [])]
        .filter((organization) =>
          ["active", "pending", "invited"].includes(organization.status)
          && (organization.organization_category === "contractor" || organization.organization_category == null),
        )
        .map((organization) => [organization.id, {
          id: organization.id,
          name: organization.name,
          status: organization.status === "active" ? "active" : organization.status === "invited" ? "invited" : "pending",
          registrationNumber: organization.registration_number?.trim() || "",
          address: organization.address?.trim() || "",
          postalCode: organization.postal_code?.trim() || "",
          phone: organization.phone?.trim() || "",
        }] as const),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <ProjectCreateForm
      supervisingOrg={{ id: supervisingOrg.id, name: supervisingOrg.name }}
      contractorOrganizations={contractorOrganizations}
      users={userOptions}
      supervisors={supervisorOptions}
      existingProjectCodes={existingProjectCodes}
    />
  )
}
