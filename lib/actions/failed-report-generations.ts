"use server"

import { requireOnboarded } from "@/lib/auth/session"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"
import { getFailedReportGenerations, type FailedReportGenerationItem } from "@/lib/dashboard/failed-report-generations-server"

export async function getFailedReportGenerationsAction({
  orgId,
  projectId,
}: {
  orgId?: string | null
  projectId?: string | null
}): Promise<{ data: FailedReportGenerationItem[]; error?: string }> {
  try {
    const session = await requireOnboarded()
    const roleResolution = await resolveUserEffectiveRole(session.userId, session.email)
    if (roleResolution.role !== "admin") {
      return { data: [], error: "Unauthorized" }
    }

    const effectiveOrgId = orgId ?? session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
    const data = await getFailedReportGenerations({ orgId: effectiveOrgId, projectId })
    return { data }
  } catch (error) {
    console.error("[getFailedReportGenerationsAction] error:", error)
    return { data: [], error: error instanceof Error ? error.message : "Failed to refresh" }
  }
}
