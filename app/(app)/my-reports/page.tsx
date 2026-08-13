import { MyReportsView } from "@/components/my-reports/my-reports-view"
import { requireOnboarded } from "@/lib/auth/session"
import { getSupervisorMyReports } from "@/lib/my-reports/server"

export const dynamic = "force-dynamic"

export default async function MyReportsPage() {
  const session = await requireOnboarded()
  const reports = await getSupervisorMyReports(session.userId)

  return <MyReportsView reports={reports} />
}
