import { notFound } from "next/navigation"
import { ProjectGalleryView } from "@/components/projects/project-gallery-view"
import { canAdministerProject } from "@/lib/auth/guards"
import { requireOnboarded } from "@/lib/auth/session"
import { getOrgProjects } from "@/lib/db/domain"
import { getProjectGallery } from "@/lib/db/project-gallery"

export default async function ProjectGalleryPage({
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
  if (!project) notFound()

  const [images, canManage] = await Promise.all([
    getProjectGallery(project.id, project.image),
    canAdministerProject(project.id),
  ])

  return (
    <ProjectGalleryView
      projectId={project.id}
      projectName={project.name}
      initialImages={images}
      canManage={canManage}
    />
  )
}
