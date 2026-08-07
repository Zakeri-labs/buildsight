import { notFound, redirect } from "next/navigation"
import { InspectionReportForm } from "@/components/stages/inspection-report-form"
import { requireOnboarded } from "@/lib/auth/session"
import { loadNextProjectVisitNumber, loadProjectStage, loadSiteVisitReportContext } from "@/lib/db/project-stages"
import { loadProjectParticipantsOnly } from "@/lib/report-cc/server"
import { resolveCalendarProjectScope } from "@/lib/calendar/server"

export default async function NewStageReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; stageId: string }>
  searchParams: Promise<{ siteVisitRequestId?: string | string[] }>
}) {
  const [{ projectId, stageId }, query, session] = await Promise.all([params, searchParams, requireOnboarded()])
  const rawSiteVisitRequestId = Array.isArray(query.siteVisitRequestId) ? query.siteVisitRequestId[0] : query.siteVisitRequestId
  const hasSiteVisitRequestId = typeof rawSiteVisitRequestId === "string" && rawSiteVisitRequestId.trim().length > 0
  const siteVisitRequestId = hasSiteVisitRequestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawSiteVisitRequestId!)
    ? rawSiteVisitRequestId!.trim()
    : null
  if (hasSiteVisitRequestId && !siteVisitRequestId) notFound()
  const data = await loadProjectStage(projectId, stageId, session.userId)
  if (!data || data.stage.status === "disabled") notFound()

  const reportScope = siteVisitRequestId ? await resolveCalendarProjectScope(session.userId) : []
  if (siteVisitRequestId && !reportScope.some((project) => project.id === projectId)) notFound()

  const [ccCandidates, siteVisitContext] = await Promise.all([
    loadProjectParticipantsOnly(projectId),
    siteVisitRequestId ? loadSiteVisitReportContext(projectId, siteVisitRequestId) : Promise.resolve(null),
  ])
  if (siteVisitRequestId && !siteVisitContext) notFound()
  if (siteVisitContext?.linkedReport) {
    redirect(`/projects/${projectId}/stages/${siteVisitContext.linkedReport.projectStageId}/reports/${siteVisitContext.linkedReport.id}`)
  }
  const nextVisitNumber = siteVisitContext?.visitNumber ?? await loadNextProjectVisitNumber(projectId)
  const currentUserPerson = {
    id: session.userId,
    name: session.profile?.full_name || session.email.split("@")[0] || "User",
    email: session.email,
    avatarUrl: session.profile?.avatar_url || null,
  }
  const stageSubterms = data.stage.terms.flatMap((t) => [t, ...t.subterms])
  return <InspectionReportForm project={data.project} stage={{ id: data.stage.id, name: data.stage.name }} reportConfig={{ id: data.stage.id, reportName: `${data.stage.name} Report`, required: false, responsibleUser: null, templateReference: null, responseType: "combined", instructions: null, approvalRequired: true, status: data.stage.status }} response={null} translation={null} canReview={data.canReview} canManage={data.canManage} currentUserId={data.currentUserId} currentUserPerson={currentUserPerson} workflowActive={true} canEdit={true} suggestedVisitNumber={nextVisitNumber} initialResponseId={crypto.randomUUID()} ccCandidates={ccCandidates} initialCcRecipients={[]} stageSubterms={stageSubterms} siteVisitRequestId={siteVisitRequestId} />
}
