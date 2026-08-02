import { notFound } from "next/navigation"
import { InspectionReportForm } from "@/components/stages/inspection-report-form"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStageReport } from "@/lib/db/project-stages"
import { loadProjectCcCandidates, loadReportCcRecipients } from "@/lib/report-cc/server"

export default async function StageReportPage({ params }: { params: Promise<{ projectId: string; stageId: string; reportId: string }> }) {
  const [{ projectId, stageId, reportId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStageReport(projectId, stageId, reportId, session.userId)
  if (!data) notFound()
  const [ccCandidates, ccRecipients] = await Promise.all([
    loadProjectCcCandidates(projectId),
    loadReportCcRecipients(projectId, reportId, "report"),
  ])
  const response = data.response
  return <InspectionReportForm project={data.project} stage={{ id: data.stage.id, name: data.stage.name }} reportConfig={{ id: data.stage.id, reportName: response.reportTitle, required: false, responsibleUser: response.responsibleUser, templateReference: response.templateReference, responseType: response.responseType, instructions: response.instructions ?? data.stage.description, approvalRequired: response.approvalRequired, status: data.stage.status }} response={response} translation={response.translation} canReview={data.canReview} canManage={data.canManage} currentUserId={data.currentUserId} workflowActive={data.stage.status !== "disabled"} canEdit={data.canManage || response.createdBy.id === data.currentUserId || response.responsibleUser?.id === data.currentUserId} suggestedVisitNumber={response.visitNumber} initialResponseId={response.id} ccCandidates={ccCandidates} initialCcRecipients={ccRecipients} />
}
