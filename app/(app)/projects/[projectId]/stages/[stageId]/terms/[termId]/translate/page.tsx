import { notFound } from "next/navigation"
import { StageTranslationViewer } from "@/components/stages/stage-translation-viewer"
import { requireOnboarded } from "@/lib/auth/session"
import { loadStageTranslationPageData } from "@/lib/stage-translations/data"

export const dynamic = "force-dynamic"

export default async function StageTermTranslationPage({
  params,
}: {
  params: Promise<{ projectId: string; stageId: string; termId: string }>
}) {
  const [{ projectId, stageId, termId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadStageTranslationPageData(projectId, stageId, termId, session.userId)
  if (!data) notFound()
  return <StageTranslationViewer data={data} />
}
