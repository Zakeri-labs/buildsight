import { redirect } from "next/navigation"
import { DateRangePill } from "@/components/dashboard/date-range-pill"
import { PortfolioKpis, type KpiCardData } from "@/components/dashboard/portfolio-kpis"
import { CompletedVisitsBySupervisorCard } from "@/components/dashboard/inspections-by-supervisor-card"
import { RecentSupervisorReportsCard } from "@/components/dashboard/recent-supervisor-reports-card"
import { VisitComplianceCard } from "@/components/dashboard/visit-compliance-card"
import { ProjectsOverview } from "@/components/dashboard/projects-overview"
import { MyTasks } from "@/components/dashboard/my-tasks"
import { requireOnboarded } from "@/lib/auth/session"
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

  // Keep Admin precedence identical to the default landing resolver while
  // making the authenticated Member landing deterministic if middleware is bypassed.
  const hasAdminRole = session.memberships.some((membership) => membership.role === "org_admin")
  const hasMemberRole = session.memberships.some((membership) => membership.role === "org_member")
  if (!hasAdminRole && hasMemberRole) {
    redirect("/memberhomepage")
  }

  const projectId = await getSelectedProjectId()
  const orgId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
  const data = orgId
    ? await getDashboardData(orgId, projectId, session.userId, activityDateFilter, hasAdminRole)
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
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <DateRangePill
          preset={dateRange.preset}
          label={dateRange.label}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
        />
      </div>

      <PortfolioKpis kpis={kpis} />

      {hasAdminRole ? <VisitComplianceCard compliance={data.visitCompliance} /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CompletedVisitsBySupervisorCard
          supervisors={data.completedVisitsBySupervisor}
          completion={data.visitCompletion}
          dateRangeLabel={dateRange.label}
        />
        <RecentSupervisorReportsCard reports={data.recentSupervisorReports} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProjectsOverview
            projects={data.projects}
            selectedProjectId={projectId}
            supervisorOptions={supervisorOptions}
          />
        </div>
        <MyTasks tasks={data.tasks} />
      </div>
    </div>
  )
}
