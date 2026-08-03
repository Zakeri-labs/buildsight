import { notFound } from "next/navigation"
import { StageTranslationViewer } from "@/components/stages/stage-translation-viewer"
import { requireOnboarded } from "@/lib/auth/session"
import { loadStageTranslationPageData } from "@/lib/stage-translations/data"
import { loadReportCcRecipients } from "@/lib/report-cc/server"

export default async function ReportTranslationPage({ params }: { params: Promise<{ projectId: string; stageId: string; reportId: string }> }) {
  const [{ projectId, stageId, reportId }, session] = await Promise.all([params, requireOnboarded()])
  const [data, ccRecipients] = await Promise.all([
    loadStageTranslationPageData(projectId, stageId, session.userId, reportId),
    loadReportCcRecipients(projectId, reportId, "report"),
  ])
  if (!data) notFound()
  return <StageTranslationViewer data={data} ccRecipients={ccRecipients} appendTranslatedPdfClosing />
}
