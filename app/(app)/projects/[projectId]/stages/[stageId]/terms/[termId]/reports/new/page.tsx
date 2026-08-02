import { notFound } from "next/navigation"
import { InspectionReportForm } from "@/components/stages/inspection-report-form"
import { requireOnboarded } from "@/lib/auth/session"
import { loadNextProjectVisitNumber, loadProjectStageTerm } from "@/lib/db/project-stages"
import { loadProjectCcCandidates } from "@/lib/report-cc/server"

export default async function NewTermReportPage({ params }: { params: Promise<{ projectId: string; stageId: string; termId: string }> }) {
  const [{ projectId, stageId, termId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStageTerm(projectId, termId, session.userId)
  if (!data || data.stage.id !== stageId) notFound()
  const workflowActive = data.stage.status !== "disabled"
  if (!workflowActive) notFound()
  const [ccCandidates, nextVisitNumber] = await Promise.all([loadProjectCcCandidates(projectId), loadNextProjectVisitNumber(projectId)])
  const stageSubterms = data.stage.terms.flatMap((t) => [t, ...t.subterms])
  const currentUserPerson = {
    id: session.userId,
    name: session.profile?.full_name || session.email.split("@")[0] || "User",
    email: session.email,
    avatarUrl: session.profile?.avatar_url || null,
  }
  return (
    <InspectionReportForm
      project={data.project}
      stage={{ id: data.stage.id, name: data.stage.name }}
      term={{
        id: data.term.id,
        reportName: data.term.reportName,
        required: data.term.required,
        responsibleUser: data.term.responsibleUser,
        templateReference: data.term.templateReference,
        responseType: data.term.responseType,
        instructions: data.term.instructions,
        approvalRequired: data.term.approvalRequired,
        status: data.term.status,
      }}
      parentTerm={data.parentTerm ? { id: data.parentTerm.id, name: data.parentTerm.reportName } : null}
      response={null}
      translation={null}
      canReview={data.canReview}
      canManage={data.canManage}
      currentUserId={data.currentUserId}
      currentUserPerson={currentUserPerson}
      workflowActive={workflowActive}
      canEdit={true}
      suggestedVisitNumber={nextVisitNumber}
      initialResponseId={crypto.randomUUID()}
      ccCandidates={ccCandidates}
      initialCcRecipients={[]}
      stageSubterms={stageSubterms}
    />
  )
}
