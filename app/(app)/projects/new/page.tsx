import { Card, CardContent } from "@/components/ui/card"
import { ProjectCreateForm } from "@/components/projects/project-create-form"
import { isOrgAdmin, requireOnboarded } from "@/lib/auth/session"

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

  return <ProjectCreateForm supervisingOrg={{ id: supervisingOrg.id, name: supervisingOrg.name }} />
}
