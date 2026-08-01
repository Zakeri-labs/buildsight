import { notFound, redirect } from "next/navigation"
import { requireOnboarded } from "@/lib/auth/session"
import { loadProjectStageTerm } from "@/lib/db/project-stages"

export default async function LegacyStageTermTranslationPage({ params }: { params: Promise<{ projectId: string; stageId: string; termId: string }> }) {
  const [{ projectId, stageId, termId }, session] = await Promise.all([params, requireOnboarded()])
  const data = await loadProjectStageTerm(projectId, termId, session.userId)
  if (!data || data.stage.id !== stageId || !data.term.response) notFound()
  redirect(`/projects/${projectId}/stages/${stageId}/terms/${termId}/reports/${data.term.response.id}/translate`)
}
