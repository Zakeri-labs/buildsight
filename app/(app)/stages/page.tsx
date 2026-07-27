import { Card, CardContent } from "@/components/ui/card"
import { StageManagement } from "@/components/stages/stage-management"
import { requireOnboarded } from "@/lib/auth/session"
import { loadStageManagement, resolveStageManagementOrganization } from "@/lib/db/stages"

export default async function StageManagementPage() {
  const session = await requireOnboarded()
  const organization = await resolveStageManagementOrganization(session.userId, session.supervisingOrg?.id)

  if (!organization) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="text-lg font-semibold">Stage Management</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Only organization administrators, organization managers, project administrators, and project managers can manage stage templates.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }


  const data = await loadStageManagement(organization.id)

  return <StageManagement organization={{ id: organization.id, name: organization.name }} data={data} />
}
