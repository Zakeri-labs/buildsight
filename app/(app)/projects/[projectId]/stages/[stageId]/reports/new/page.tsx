import { notFound } from "next/navigation"
import { InspectionReportForm } from "@/components/stages/inspection-report-form"
import { requireOnboarded } from "@/lib/auth/session"
import { loadNextProjectVisitNumber, loadProjectStage } from "@/lib/db/project-stages"
import { loadProjectParticipantsOnly } from "@/lib/report-cc/server"

export default async function NewStageReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; stageId: string }>
  searchParams: Promise<{ siteVisitRequestId?: string | string[] }>
}) {
  const [{ projectId, stageId }, query, session] = await Promise.all([params, searchParams, requireOnboarded()])
  const rawSiteVisitRequestId = Array.isArray(query.siteVisitRequestId) ? query.siteVisitRequestId[0] : query.siteVisitRequestId
  const siteVisitRequestId = typeof rawSiteVisitRequestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawSiteVisitRequestId)
    ? rawSiteVisitRequestId
    : null
  const data = await loadProjectStage(projectId, stageId, session.userId)
  if (!data || data.stage.status === "disabled") notFound()
  const [ccCandidates, nextVisitNumber] = await Promise.all([loadProjectParticipantsOnly(projectId), loadNextProjectVisitNumber(projectId)])
  const currentUserPerson = {
    id: session.userId,
    name: session.profile?.full_name || session.email.split("@")[0] || "User",
    email: session.email,
    avatarUrl: session.profile?.avatar_url || null,
  }
  const stageSubterms = data.stage.terms.flatMap((t) => [t, ...t.subterms])
  return <InspectionReportForm project={data.project} stage={{ id: data.stage.id, name: data.stage.name }} reportConfig={{ id: data.stage.id, reportName: `${data.stage.name} Report`, required: false, responsibleUser: null, templateReference: null, responseType: "combined", instructions: null, approvalRequired: true, status: data.stage.status }} response={null} translation={null} canReview={data.canReview} canManage={data.canManage} currentUserId={data.currentUserId} currentUserPerson={currentUserPerson} workflowActive={true} canEdit={true} suggestedVisitNumber={nextVisitNumber} initialResponseId={crypto.randomUUID()} ccCandidates={ccCandidates} initialCcRecipients={[]} stageSubterms={stageSubterms} siteVisitRequestId={siteVisitRequestId} />
}
