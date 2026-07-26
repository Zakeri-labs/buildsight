import { DateRangePill } from "@/components/dashboard/date-range-pill"
import { PortfolioKpis, type KpiCardData } from "@/components/dashboard/portfolio-kpis"
import { StatusDonutCard } from "@/components/dashboard/status-donut-card"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { ProjectsOverview } from "@/components/dashboard/projects-overview"
import { MyTasks } from "@/components/dashboard/my-tasks"
import { ProjectDetail } from "@/components/projects/project-detail"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getDashboardData, getOrgProjects, type DashboardData, type DomainProject } from "@/lib/db/domain"
import type { ProjectRecord, ProjectStatusKey } from "@/lib/mock-data"

// Deterministic upward sparkline that lands on `value`.
function spark(value: number): number[] {
  const n = 12
  const start = Math.max(0, Math.round(value * 0.4))
  return Array.from({ length: n }, (_, i) => Math.round(start + ((value - start) * i) / (n - 1)))
}

function projectStatusKey(status: string): ProjectStatusKey {
  const normalized = status.trim().toLowerCase().replaceAll("_", "-").replaceAll(" ", "-")
  if (normalized === "planning") return "planning"
  if (normalized === "on-hold" || normalized === "paused") return "onHold"
  if (normalized === "completed") return "completed"
  if (normalized === "handover") return "handover"
  return "underConstruction"
}

function displayDate(value: string | null): string {
  if (!value) return "Not set"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function toProjectRecord(
  project: DomainProject,
  counts: { ncrs: number; inspections: number } | undefined,
): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    location: project.location ?? "Location not set",
    image: project.image ?? "/placeholder.svg",
    statusKey: projectStatusKey(project.status),
    contractor: project.contractor ?? "Not assigned",
    consultant: project.consultant ?? "Not assigned",
    client: project.client ?? "Not assigned",
    startDate: displayDate(project.startDate),
    targetHandover: displayDate(project.targetHandover),
    contractValue: project.contractValue ?? "Not set",
    progress: {
      planned: project.progressPlanned,
      actual: project.progressActual,
      delay: project.progressDelay,
    },
    openNcrs: counts?.ncrs ?? 0,
    openInspections: counts?.inspections ?? 0,
  }
}

export default async function DashboardPage() {
  const session = await requireOnboarded()
  const orgId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
  const projectId = await getSelectedProjectId()

  let data: DashboardData
  let orgProjects: DomainProject[]

  if (orgId) {
    const result = await Promise.all([getDashboardData(orgId, projectId), getOrgProjects(orgId)])
    data = result[0]
    orgProjects = result[1]
  } else {
    data = {
      kpis: { totalProjects: 0, openNcrs: 0, openInspections: 0, openRfis: 0 },
      ncrDonut: [],
      inspectionDonut: [],
      activity: [],
      projects: [],
      tasks: [],
      scopeName: null,
    }
    orgProjects = []
  }

  if (projectId) {
    const selectedProject = orgProjects.find((project) => project.id === projectId)
    if (selectedProject) {
      const projectCounts = data.projects.find((project) => project.id === projectId)
      return <ProjectDetail project={toProjectRecord(selectedProject, projectCounts)} />
    }
  }

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
          <ProjectsOverview projects={data.projects} />
        </div>
        <MyTasks tasks={data.tasks} />
      </div>
    </div>
  )
}
