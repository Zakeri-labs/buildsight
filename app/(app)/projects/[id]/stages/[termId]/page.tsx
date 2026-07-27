import { notFound } from "next/navigation"
import { InspectionReportForm } from "@/components/stages/inspection-report-form"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStageTerm } from "@/lib/db/project-stages"

export default async function ProjectStageTermPage({
  params,
}: {
  params: Promise<{ id: string; termId: string }>
}) {
  const [{ id, termId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStageTerm(id, termId, session.userId)
  if (!data) notFound()

  return (
    <InspectionReportForm
      project={data.project}
      stage={{ id: data.stage.id, name: data.stage.name }}
      term={{
        id: data.term.id,
        reportName: data.term.reportName,
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
