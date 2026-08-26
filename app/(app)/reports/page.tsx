import { requireOnboarded } from "@/lib/auth/session"
import { resolveDashboardDateRange } from "@/lib/dashboard/date-range"
import { getPaginatedReportsList } from "@/lib/db/reports-list"
import { ReportsList } from "@/components/reports/reports-list"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    range?: string | string[]
    from?: string | string[]
    to?: string | string[]
  }>
}) {
  const session = await requireOnboarded()
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1)
  const dateRange = resolveDashboardDateRange(params)

  const primaryMembership = session.memberships[0]
  const organizationId = session.supervisingOrg?.id ?? primaryMembership?.organization?.id

  const data = await getPaginatedReportsList({
    userId: session.userId,
    organizationId,
    page,
    pageSize: 30,
    dateRange,
  })

  return (
    <ReportsList
      reports={data.items}
      totalReports={data.totalReports}
      currentPage={data.currentPage}
      totalPages={data.totalPages}
      dateRange={dateRange}
    />
  )
}

