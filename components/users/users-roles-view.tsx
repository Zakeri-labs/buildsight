"use client"

import { PageHeader } from "@/components/dashboard/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OrganizationsTab } from "@/components/users/organizations-tab"
import { MembersTab } from "@/components/users/members-tab"
import { ProjectsAccessTab } from "@/components/users/projects-access-tab"
import { InvitationsTab } from "@/components/users/invitations-tab"
import type { AdminConsoleData } from "@/lib/db/admin-console"

export function UsersRolesView({
  supervisingOrg,
  data,
  initialTab = "members",
}: {
  supervisingOrg: { id: string; name: string }
  data: AdminConsoleData
  initialTab?: "members" | "organizations" | "projects" | "invitations"
}) {
  const supervisingMembers = data.members.filter((m) => m.organizationId === supervisingOrg.id)
  const pendingCount = data.invitations.filter((i) => i.status === "pending").length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Roles"
        subtitle={`Manage organizations, members, and project access for ${supervisingOrg.name}.`}
      />

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="organizations">Organizations</TabsTrigger>
          <TabsTrigger value="projects">Projects &amp; Access</TabsTrigger>
          <TabsTrigger value="invitations">
            Invitations{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-5">
          <MembersTab supervisingOrg={supervisingOrg} members={supervisingMembers} />
        </TabsContent>
        <TabsContent value="organizations" className="mt-5">
          <OrganizationsTab supervisingOrg={supervisingOrg} organizations={data.organizations} />
        </TabsContent>
        <TabsContent value="projects" className="mt-5">
          <ProjectsAccessTab
            supervisingOrg={supervisingOrg}
            projects={data.projects}
            organizations={data.organizations}
            projectOrgs={data.projectOrgs}
            projectUsers={data.projectUsers}
            members={data.members}
          />
        </TabsContent>
        <TabsContent value="invitations" className="mt-5">
          <InvitationsTab invitations={data.invitations} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
