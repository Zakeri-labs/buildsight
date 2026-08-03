import { notFound } from "next/navigation"
import { InspectionReportForm } from "@/components/stages/inspection-report-form"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStageReport } from "@/lib/db/project-stages"
import { loadProjectParticipantsOnly, loadReportCcRecipients } from "@/lib/report-cc/server"

export default async function TermReportPage({ params }: { params: Promise<{ projectId: string; stageId: string; termId: string; reportId: string }> }) {
  const [{ projectId, stageId, termId, reportId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStageReport(projectId, termId, reportId, session.userId)
  if (!data || data.stage.id !== stageId) notFound()
  const [ccCandidates, ccRecipients] = await Promise.all([
    loadProjectParticipantsOnly(projectId),
    loadReportCcRecipients(projectId, reportId, "report"),
  ])
  const workflowActive = data.stage.status !== "disabled" && data.term.isActive && (!data.parentTerm || data.parentTerm.isActive)
  return <InspectionReportForm project={data.project} stage={{ id: data.stage.id, name: data.stage.name }} term={{ id: data.term.id, reportName: data.term.reportName, required: data.term.required, responsibleUser: data.term.responsibleUser, templateReference: data.term.templateReference, responseType: data.term.responseType, instructions: data.term.instructions, approvalRequired: data.term.approvalRequired, status: data.term.status }} parentTerm={data.parentTerm ? { id: data.parentTerm.id, name: data.parentTerm.reportName } : null} response={data.response} translation={data.response.translation} canReview={data.canReview} workflowActive={workflowActive} canEdit={data.canManage || data.response.createdBy.id === data.currentUserId || data.term.responsibleUser?.id === data.currentUserId} suggestedVisitNumber={data.response.visitNumber} initialResponseId={data.response.id} ccCandidates={ccCandidates} initialCcRecipients={ccRecipients} />
}
