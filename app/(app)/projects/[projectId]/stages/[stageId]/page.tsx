import { notFound } from "next/navigation"
import { StageReportList } from "@/components/stages/stage-report-list"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStage } from "@/lib/db/project-stages"

export default async function ProjectStagePage({ params }: { params: Promise<{ projectId: string; stageId: string }> }) {
  const [{ projectId, stageId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStage(projectId, stageId, session.userId)
  if (!data) notFound()
  return <StageReportList project={data.project} stage={data.stage} workflowActive={data.stage.status !== "disabled"} />
}
