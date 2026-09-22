import { redirect } from "next/navigation"
import { AiSummaryBuilder } from "@/components/ai-summary/ai-summary-builder"
import { requireOnboarded } from "@/lib/auth/session"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"
import { loadAiSummarySources } from "@/lib/ai-summary/sources"
import { getSelectedProjectId } from "@/lib/project-scope"

export default async function AiSummaryPage() {
  const session = await requireOnboarded()
  const roleRes = await resolveUserEffectiveRole(session.userId, session.email)
  if (roleRes.role === "viewer") {
    redirect("/projects")
  }

  const selectedProjectId = await getSelectedProjectId()
  const data = selectedProjectId ? await loadAiSummarySources(selectedProjectId) : null
  return <AiSummaryBuilder data={data} />
}
