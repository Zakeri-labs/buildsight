import { redirect } from "next/navigation"

import { ReportEntry } from "@/components/report-entry/report-entry"
import { requireOnboarded } from "@/lib/auth/session"
import { getReportEntryProjects } from "@/lib/report-entry/server"

export const dynamic = "force-dynamic"

export default async function ReportEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const [session, query] = await Promise.all([requireOnboarded(), searchParams])
  if (session.memberships[0]?.role !== "org_member") redirect("/")

  const projects = await getReportEntryProjects(session.userId)
  const errorCode = Array.isArray(query.error) ? query.error[0] : query.error

  return <ReportEntry projects={projects} errorCode={errorCode ?? null} />
}
