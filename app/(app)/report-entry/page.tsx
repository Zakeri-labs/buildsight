import { notFound, redirect } from "next/navigation"

import { ReportEntry } from "@/components/report-entry/report-entry"
import { requireOnboarded } from "@/lib/auth/session"
import { getReportEntryProjects, getReportEntrySiteVisitContext } from "@/lib/report-entry/server"

export const dynamic = "force-dynamic"

export default async function ReportEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; siteVisitId?: string | string[] }>
}) {
  const [session, query] = await Promise.all([requireOnboarded(), searchParams])

  let projects = []
  try {
    projects = await getReportEntryProjects(session.userId)
  } catch (err) {
    console.error("[report-entry/page] loader error:", err)
  }

  const errorCode = Array.isArray(query.error) ? query.error[0] : query.error
  const rawSiteVisitId = Array.isArray(query.siteVisitId) ? query.siteVisitId[0] : query.siteVisitId
  const hasSiteVisitContext = typeof rawSiteVisitId === "string" && rawSiteVisitId.trim().length > 0
  let linkedSiteVisit = null
  if (hasSiteVisitContext) {
    try {
      linkedSiteVisit = await getReportEntrySiteVisitContext(rawSiteVisitId!.trim(), projects.map((project) => project.id))
    } catch {
      linkedSiteVisit = null
    }
  }

  if (hasSiteVisitContext && !linkedSiteVisit) notFound()

  return (
    <ReportEntry
      projects={projects}
      errorCode={errorCode ?? null}
      linkedSiteVisit={linkedSiteVisit}
    />
  )
}
