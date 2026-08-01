import { notFound } from "next/navigation"
import { StageTranslationViewer } from "@/components/stages/stage-translation-viewer"
import { requireOnboarded } from "@/lib/auth/session"
import { loadStageTranslationPageData } from "@/lib/stage-translations/data"
import { loadProjectStageReport } from "@/lib/db/project-stages"
import { loadReportCcRecipients } from "@/lib/report-cc/server"

export const dynamic = "force-dynamic"

export default async function ReportTranslationPage({ params }: { params: Promise<{ projectId: string; stageId: string; termId: string; reportId: string }> }) {
  const [{ projectId, stageId, termId, reportId }, session] = await Promise.all([params, requireOnboarded()])
  const [data, execution] = await Promise.all([
    loadStageTranslationPageData(projectId, stageId, termId, session.userId, reportId),
    loadProjectStageReport(projectId, termId, reportId, session.userId),
  ])
  if (!data || !execution || execution.stage.id !== stageId) notFound()
  const ccRecipients = await loadReportCcRecipients(projectId, reportId, "report")
  return <StageTranslationViewer data={data} ccRecipients={ccRecipients} />
}
