import { notFound } from "next/navigation"
import { ProjectStageExecutionView } from "@/components/stages/project-stage-execution"
import { ProjectStagesAccessDenied } from "@/components/stages/project-stages-access-denied"
import { MemberProjectStagesMobile } from "@/components/stages/member-project-stages-mobile"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStageExecution, projectExistsForStageRoute } from "@/lib/db/project-stages"

export default async function ProjectStagesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await requireOnboarded()
  const { projectId } = await params
  const isMember = session.memberships[0]?.role === "org_member"
  const data = await loadProjectStageExecution(projectId, session.userId)

  if (!data) {
    if (isMember && await projectExistsForStageRoute(projectId)) {
      return <ProjectStagesAccessDenied />
    }
    notFound()
  }

  if (!isMember) return <ProjectStageExecutionView data={data} />

  return (
    <>
      <div className="md:hidden"><MemberProjectStagesMobile data={data} /></div>
      <div className="hidden md:block"><ProjectStageExecutionView data={data} /></div>
    </>
  )
}
