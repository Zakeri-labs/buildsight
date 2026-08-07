import { redirect } from "next/navigation"
import { DateRangePill } from "@/components/dashboard/date-range-pill"
import { PortfolioKpis, type KpiCardData } from "@/components/dashboard/portfolio-kpis"
import { StatusDonutCard } from "@/components/dashboard/status-donut-card"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { ProjectsOverview } from "@/components/dashboard/projects-overview"
import { MyTasks } from "@/components/dashboard/my-tasks"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getDashboardData, type DashboardData } from "@/lib/db/domain"

// Deterministic upward sparkline that lands on `value`.
function spark(value: number): number[] {
  const n = 12
  const start = Math.max(0, Math.round(value * 0.4))
  return Array.from({ length: n }, (_, i) => Math.round(start + ((value - start) * i) / (n - 1)))
}

const emptyDashboard: DashboardData = {
  kpis: { totalProjects: 0, openNcrs: 0, openInspections: 0, openRfis: 0 },
  ncrDonut: [],
  inspectionDonut: [],
  activity: [],
  projects: [],
  tasks: [],
  scopeName: null,
}

export default async function DashboardPage() {
  const session = await requireOnboarded()

  // Keep Admin precedence identical to the default landing resolver while
  // making the authenticated Member landing deterministic if middleware is bypassed.
  const hasAdminRole = session.memberships.some((membership) => membership.role === "org_admin")
  const hasMemberRole = session.memberships.some((membership) => membership.role === "org_member")
  if (!hasAdminRole && hasMemberRole) {
    redirect("/memberhomepage")
  }

  const projectId = await getSelectedProjectId()
  const orgId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
  const data = orgId ? await getDashboardData(orgId, projectId, session.userId) : emptyDashboard

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
      key: "ncrs",
      label: "Open NCRs",
      value: data.kpis.openNcrs,
      tone: "red",
      icon: "ncr",
      spark: spark(data.kpis.openNcrs),
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
      key: "rfis",
      label: "Open RFIs",
      value: data.kpis.openRfis,
      tone: "green",
      icon: "rfi",
      spark: spark(data.kpis.openRfis),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <DateRangePill />
      </div>

      <PortfolioKpis kpis={kpis} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StatusDonutCard title="NCR Status" slices={data.ncrDonut} href="/ncrs" linkLabel="View all NCRs" />
        <StatusDonutCard
          title="Inspections Status"
          slices={data.inspectionDonut}
          href="/inspections"
          linkLabel="View all Inspections"
        />
        <ActivityFeed items={data.activity} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProjectsOverview projects={data.projects} selectedProjectId={projectId} />
        </div>
        <MyTasks tasks={data.tasks} />
      </div>
    </div>
  )
}
