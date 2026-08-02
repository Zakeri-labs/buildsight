import { notFound } from "next/navigation"
import { InspectionReportForm } from "@/components/stages/inspection-report-form"
import { requireOnboarded } from "@/lib/auth/session"
import { loadNextProjectVisitNumber, loadProjectStage } from "@/lib/db/project-stages"
import { loadProjectCcCandidates } from "@/lib/report-cc/server"

export default async function NewStageReportPage({ params }: { params: Promise<{ projectId: string; stageId: string }> }) {
  const [{ projectId, stageId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStage(projectId, stageId, session.userId)
  if (!data || data.stage.status === "disabled") notFound()
  const [ccCandidates, nextVisitNumber] = await Promise.all([loadProjectCcCandidates(projectId), loadNextProjectVisitNumber(projectId)])
  return <InspectionReportForm project={data.project} stage={{ id: data.stage.id, name: data.stage.name }} reportConfig={{ id: data.stage.id, reportName: `${data.stage.name} Report`, required: false, responsibleUser: null, templateReference: null, responseType: "combined", instructions: data.stage.description, approvalRequired: true, status: data.stage.status }} response={null} translation={null} canReview={data.canReview} canManage={data.canManage} currentUserId={data.currentUserId} workflowActive={true} canEdit={true} suggestedVisitNumber={nextVisitNumber} initialResponseId={crypto.randomUUID()} ccCandidates={ccCandidates} initialCcRecipients={[]} />
}
