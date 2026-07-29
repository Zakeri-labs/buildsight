import { AiSummaryBuilder } from "@/components/ai-summary/ai-summary-builder"
import { requireOnboarded } from "@/lib/auth/session"
import { loadAiSummarySources } from "@/lib/ai-summary/sources"
import { getSelectedProjectId } from "@/lib/project-scope"

export default async function AiSummaryPage() {
  const [, selectedProjectId] = await Promise.all([requireOnboarded(), getSelectedProjectId()])
  const data = selectedProjectId ? await loadAiSummarySources(selectedProjectId) : null
  return <AiSummaryBuilder data={data} />
}
