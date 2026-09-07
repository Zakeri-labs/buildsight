export const dynamic = "force-dynamic"
export const revalidate = 0

import { notFound } from "next/navigation"
import { ProjectLocationEditView } from "@/components/projects/project-location-edit-view"
import { canAdministerProject } from "@/lib/auth/guards"
import { isUserProjectSupervisor } from "@/lib/auth/project-access"
import { requireOnboarded } from "@/lib/auth/session"
import { getOrgProjects } from "@/lib/db/domain"

export default async function ProjectLocationPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await requireOnboarded()
  const { projectId } = await params
  const organizationId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id
  if (!organizationId) notFound()

  const projects = await getOrgProjects(organizationId, session.userId)
  const project = projects.find((item) => item.id === projectId)
  if (!project) return notFound()

  const [isAdmin, isSupervisor] = await Promise.all([
    canAdministerProject(project.id),
    isUserProjectSupervisor(session.userId, project.id),
  ])

  if (!isAdmin && !isSupervisor) {
    notFound()
  }

  return (
    <ProjectLocationEditView
      project={{
        id: project.id,
        name: project.name,
        code: project.code,
        location: project.location,
        region: project.region,
        phase: project.phase,
        latitude: project.latitude,
        longitude: project.longitude,
      }}
    />
  )
}
