import { requireOnboarded } from "@/lib/auth/session"
import { resolveDashboardDateRange } from "@/lib/dashboard/date-range"
import { getPaginatedReportsList } from "@/lib/db/reports-list"
import { getOrganizationReportCredits } from "@/lib/db/report-credits"
import { ReportsList } from "@/components/reports/reports-list"
import { currentCalendarDateKey } from "@/lib/calendar/date"

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
    creditUsage?: string | string[]
  }>
}) {
  const session = await requireOnboarded()

  const rawParams = await searchParams
  const isCreditUsage = rawParams.creditUsage === "true" || rawParams.creditUsage === "1"

  const primaryMembership = session.memberships[0]
  const organizationId = session.supervisingOrg?.id ?? primaryMembership?.organization?.id

  let resolvedParams = { ...rawParams }

  if (isCreditUsage && (!rawParams.from || !rawParams.range)) {
    const credits = await getOrganizationReportCredits(organizationId ?? null)
    const today = currentCalendarDateKey()
    const startDate = credits.startAt ? credits.startAt.slice(0, 10) : today

    resolvedParams = {
      ...rawParams,
      range: "custom",
      from: startDate,
      to: today,
    }
  }

  const page = Math.max(1, parseInt(resolvedParams.page || "1", 10) || 1)
  const dateRange = resolveDashboardDateRange(resolvedParams)

  const data = await getPaginatedReportsList({
    userId: session.userId,
    organizationId,
    page,
    pageSize: 200,
    dateRange,
    creditUsage: isCreditUsage,
  })

  return (
    <ReportsList
      reports={data.items}
      totalReports={data.totalReports}
      dateRange={dateRange}
    />
  )
}

