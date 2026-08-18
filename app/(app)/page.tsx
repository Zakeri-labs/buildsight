import { redirect } from "next/navigation"
import { DateRangePill } from "@/components/dashboard/date-range-pill"
import { PortfolioKpis, type KpiCardData } from "@/components/dashboard/portfolio-kpis"
import { CompletedVisitsBySupervisorCard } from "@/components/dashboard/inspections-by-supervisor-card"
import { RecentSupervisorReportsCard } from "@/components/dashboard/recent-supervisor-reports-card"
import { VisitComplianceCard } from "@/components/dashboard/visit-compliance-card"
import { UpcomingSiteVisitsCard } from "@/components/dashboard/upcoming-site-visits-card"
import { ProjectsOverview } from "@/components/dashboard/projects-overview"
import { MyTasks } from "@/components/dashboard/my-tasks"
import { requireOnboarded } from "@/lib/auth/session"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"
import { canAdministerOrganization } from "@/lib/auth/guards"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getDashboardData, type DashboardData } from "@/lib/db/domain"
import { dashboardActivityDateFilter, resolveDashboardDateRange } from "@/lib/dashboard/date-range"
import { getProjectSupervisorCandidates } from "@/lib/projects/supervisor-candidates-server"

// Deterministic upward sparkline that lands on `value`.
function spark(value: number): number[] {
  const n = 12
  const start = Math.max(0, Math.round(value * 0.4))
  return Array.from({ length: n }, (_, i) => Math.round(start + ((value - start) * i) / (n - 1)))
}

const emptyDashboard: DashboardData = {
  kpis: { totalProjects: 0, openNcrs: 0, openInspections: 0, wirCount: 0 },
  ncrDonut: [],
  inspectionDonut: [],
  visitCompletion: { completed: 0, scheduled: 0 },
  upcomingSiteVisits: { count: 0, nextVisit: null },
  completedVisitsBySupervisor: [],
  visitCompliance: { eligibleProjectCount: 0, overdueCount: 0, dueTodayCount: 0, dueSoonCount: 0, projects: [] },
  recentSupervisorReports: [],
  projects: [],
  tasks: [],
  scopeName: null,
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string | string[]
    from?: string | string[]
    to?: string | string[]
  }>
}) {
  const [session, query] = await Promise.all([requireOnboarded(), searchParams])
  const dateRange = resolveDashboardDateRange(query)
  const activityDateFilter = dashboardActivityDateFilter(dateRange)

  const roleResolution = await resolveUserEffectiveRole(session.userId, session.email)
  if (roleResolution.role === "member") {
    redirect("/memberhomepage")
  }
  if (roleResolution.role === "viewer") {
    redirect("/projects")
  }
  const hasAdminRole = roleResolution.role === "admin"

  const projectId = await getSelectedProjectId()
  const orgId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
  const data = orgId
    ? await getDashboardData(orgId, projectId, session.userId, activityDateFilter, hasAdminRole, true)
    : emptyDashboard
  const canManageProjectSupervisors = session.supervisingOrg
    ? await canAdministerOrganization(session.supervisingOrg.id)
    : false
  const supervisorOptions =
    orgId && canManageProjectSupervisors && data.projects.some((project) => project.canEdit)
      ? await getProjectSupervisorCandidates(orgId)
      : []

  const kpis: KpiCardData[] = [
    {
      key: "projects",
      label: "Total Projects",
      value: data.kpis.totalProjects,
      tone: "blue",
      icon: "projects",
      caption: data.scopeName ? `Scope: ${data.scopeName}` : "Active projects",
      spark: spark(data.kpis.totalProjects),
    },
    {
      key: "inspections",
      label: "Open Inspections",
      value: data.kpis.openInspections,
      tone: "amber",
      icon: "inspection",
      spark: spark(data.kpis.openInspections),
    },
    {
      key: "wir",
      label: "WIR",
      value: data.kpis.wirCount,
      tone: "green",
      icon: "wir",
      spark: spark(data.kpis.wirCount),
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground sm:text-base">Portfolio Overview</h2>
        <DateRangePill
          preset={dateRange.preset}
          label={dateRange.label}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
        />
      </div>

      <PortfolioKpis kpis={kpis} />

      <div
        className={
          hasAdminRole
            ? "grid grid-cols-1 items-stretch gap-4 sm:gap-6 lg:grid-cols-3"
            : "grid grid-cols-1 items-stretch gap-4 sm:gap-6 lg:grid-cols-2"
        }
      >
        <CompletedVisitsBySupervisorCard
          supervisors={data.completedVisitsBySupervisor}
          completion={data.visitCompletion}
          dateRangeLabel={dateRange.label}
        />
        {hasAdminRole ? <VisitComplianceCard compliance={data.visitCompliance} /> : null}
        <UpcomingSiteVisitsCard data={data.upcomingSiteVisits} />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="min-h-0 lg:col-span-2 lg:h-full">
          <ProjectsOverview
            projects={data.projects}
            selectedProjectId={projectId}
            supervisorOptions={supervisorOptions}
          />
        </div>
        <div className="flex min-h-0 flex-col gap-4 sm:gap-6 lg:h-full">
          <div className="min-h-0 flex-1 overflow-hidden">
            <RecentSupervisorReportsCard reports={data.recentSupervisorReports} />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <MyTasks tasks={data.tasks} />
          </div>
        </div>
      </div>
    </div>
  )
}
