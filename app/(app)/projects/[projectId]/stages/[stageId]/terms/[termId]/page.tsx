import { notFound } from "next/navigation"
import { InspectionReportForm } from "@/components/stages/inspection-report-form"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStageTerm } from "@/lib/db/project-stages"

export default async function ProjectStageTermPage({
  params,
}: {
  params: Promise<{ projectId: string; stageId: string; termId: string }>
}) {
  const [{ projectId, stageId, termId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStageTerm(projectId, termId, session.userId)
  if (!data || data.stage.id !== stageId) notFound()

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
        approvalRequired: data.term.approvalRequired,
        status: data.term.status,
      }}
      response={data.term.response}
      canReview={data.canReview}
    />
  )
}
