import { notFound } from "next/navigation"
import { ProjectDetail } from "@/components/projects/project-detail"
import { requireOnboarded } from "@/lib/auth/session"
import { canAdministerProject } from "@/lib/auth/guards"
import { getOrgProjects } from "@/lib/db/domain"
import { getProjectParticipants } from "@/lib/db/project-participants"
import { toProjectRecord } from "@/lib/projects/project-record"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const [{ projectId }, session] = await Promise.all([params, requireOnboarded()])
  const organizationId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id
  if (!organizationId) notFound()

  const projects = await getOrgProjects(organizationId)
  const project = projects.find((item) => item.id === projectId)
  if (!project) notFound()

  const [participants, canManageImages] = await Promise.all([
    getProjectParticipants(project.id),
    canAdministerProject(project.id),
  ])
  return (
    <ProjectDetail
      project={toProjectRecord(project)}
      participants={participants}
      canManageImages={canManageImages}
    />
  )
}
