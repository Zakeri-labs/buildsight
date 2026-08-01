import { notFound } from "next/navigation"
import { TermReportList } from "@/components/stages/term-report-list"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStageTerm } from "@/lib/db/project-stages"

export default async function ProjectStageTermPage({ params }: { params: Promise<{ projectId: string; stageId: string; termId: string }> }) {
  const [{ projectId, stageId, termId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStageTerm(projectId, termId, session.userId)
  if (!data || data.stage.id !== stageId) notFound()
  const workflowActive = data.stage.status !== "disabled" && data.term.isActive && (!data.parentTerm || data.parentTerm.isActive)
  const hasActiveSubterms = !data.parentTerm && data.term.subterms.some((item) => item.isActive)
  return <TermReportList project={data.project} stage={{ id: data.stage.id, name: data.stage.name }} term={data.term} parentTerm={data.parentTerm} workflowActive={workflowActive} canCreate={workflowActive && !hasActiveSubterms} />
}
