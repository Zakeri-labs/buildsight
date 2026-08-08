import { notFound } from "next/navigation"
import { ProjectStageExecutionView } from "@/components/stages/project-stage-execution"
import { MemberProjectStagesMobile } from "@/components/stages/member-project-stages-mobile"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStageExecution } from "@/lib/db/project-stages"

export default async function ProjectStagesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await requireOnboarded()
  const { projectId } = await params
  const data = await loadProjectStageExecution(projectId, session.userId)
  if (!data) notFound()

  const isMember = session.memberships[0]?.role === "org_member"
  if (!isMember) return <ProjectStageExecutionView data={data} />

  return (
    <>
      <div className="md:hidden"><MemberProjectStagesMobile data={data} /></div>
      <div className="hidden md:block"><ProjectStageExecutionView data={data} /></div>
    </>
  )
}
