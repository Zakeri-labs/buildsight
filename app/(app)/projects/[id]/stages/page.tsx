import { notFound } from "next/navigation"
import { ProjectStageExecutionView } from "@/components/stages/project-stage-execution"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStageExecution } from "@/lib/db/project-stages"

export default async function ProjectStagesPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStageExecution(id, session.userId)
  if (!data) notFound()
  return <ProjectStageExecutionView data={data} />
}
