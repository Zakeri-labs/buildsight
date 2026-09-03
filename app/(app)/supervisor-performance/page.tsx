import { requireOnboarded } from "@/lib/auth/session"
import { loadSupervisorPerformanceData } from "@/lib/supervisor-performance/server"
import { SupervisorPerformanceView } from "@/components/supervisor-performance/supervisor-performance-view"
import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

type SupervisorPerformancePageParams = {
  month?: string
}

export default async function SupervisorPerformancePage({
  searchParams,
}: {
  searchParams: Promise<SupervisorPerformancePageParams>
}) {
  const params = await searchParams
  const session = await requireOnboarded()
  const supervisingOrg = session.supervisingOrg

  const isManagerOrAdmin =
    supervisingOrg != null &&
    session.memberships.some(
      (m) =>
        m.organization?.id === supervisingOrg.id &&
        (m.role === "org_admin" || m.role === "org_manager"),
    )

  if (!supervisingOrg || !isManagerOrAdmin) {
    return (
      <div className="mx-auto max-w-2xl pt-8">
        <Card>
          <CardContent className="py-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-amber-600 dark:text-amber-400" />
            <h1 className="mt-3 text-lg font-semibold text-foreground">
              Supervisor Performance Analytics
            </h1>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
              Only organization administrators and managers can view supervisor performance analytics.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const rawMonth = params.month?.trim() ?? ""
  const currentMonthStr = new Date().toISOString().slice(0, 7)
  const selectedMonth = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonthStr

  const data = await loadSupervisorPerformanceData(supervisingOrg.id, selectedMonth)

  return <SupervisorPerformanceView data={data} selectedMonth={selectedMonth} />
}
