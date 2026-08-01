import { notFound } from "next/navigation"
import { InspectionReportForm } from "@/components/stages/inspection-report-form"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStageTerm } from "@/lib/db/project-stages"
import { loadProjectCcCandidates } from "@/lib/report-cc/server"

export default async function NewTermReportPage({ params }: { params: Promise<{ projectId: string; stageId: string; termId: string }> }) {
  const [{ projectId, stageId, termId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStageTerm(projectId, termId, session.userId)
  if (!data || data.stage.id !== stageId) notFound()
  const workflowActive = data.stage.status !== "disabled" && data.term.isActive && (!data.parentTerm || data.parentTerm.isActive)
  if (!workflowActive || (!data.parentTerm && data.term.subterms.some((item) => item.isActive))) notFound()
  const [ccCandidates] = await Promise.all([loadProjectCcCandidates(projectId)])
  const nextVisitNumber = Math.max(0, ...data.term.responses.map((item) => item.visitNumber || 0)) + 1
  return <InspectionReportForm project={data.project} stage={{ id: data.stage.id, name: data.stage.name }} term={{ id: data.term.id, reportName: data.term.reportName, required: data.term.required, responsibleUser: data.term.responsibleUser, templateReference: data.term.templateReference, responseType: data.term.responseType, instructions: data.term.instructions, approvalRequired: data.term.approvalRequired, status: data.term.status }} parentTerm={data.parentTerm ? { id: data.parentTerm.id, name: data.parentTerm.reportName } : null} response={null} translation={null} canReview={data.canReview} workflowActive={workflowActive} canEdit={true} suggestedVisitNumber={nextVisitNumber} initialResponseId={crypto.randomUUID()} ccCandidates={ccCandidates} initialCcRecipients={[]} />
}
