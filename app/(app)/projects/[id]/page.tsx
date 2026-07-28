import { notFound } from "next/navigation"
import { ProjectDetail } from "@/components/projects/project-detail"
import { requireOnboarded } from "@/lib/auth/session"
import { getOrgProjects } from "@/lib/db/domain"
import { getProjectParticipants } from "@/lib/db/project-participants"
import { toProjectRecord } from "@/lib/projects/project-record"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, session] = await Promise.all([params, requireOnboarded()])
  const organizationId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id
  if (!organizationId) notFound()

  const projects = await getOrgProjects(organizationId)
  const project = projects.find((item) => item.id === id)
  if (!project) notFound()

  const participants = await getProjectParticipants(project.id)
  return <ProjectDetail project={toProjectRecord(project)} participants={participants} />
}
