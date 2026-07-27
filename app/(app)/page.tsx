import { DateRangePill } from "@/components/dashboard/date-range-pill"
import { PortfolioKpis, type KpiCardData } from "@/components/dashboard/portfolio-kpis"
import { StatusDonutCard } from "@/components/dashboard/status-donut-card"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { ProjectsOverview } from "@/components/dashboard/projects-overview"
import { MyTasks } from "@/components/dashboard/my-tasks"
import { ProjectDetail } from "@/components/projects/project-detail"
import type { ProjectDocument } from "@/components/projects/project-documents"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getDashboardData, getOrgProjects, type DashboardData, type DomainProject } from "@/lib/db/domain"
import type { ProjectRecord, ProjectStatusKey } from "@/lib/mock-data"
import { normalizeDocumentType } from "@/lib/documents/document-types"
import { createClient } from "@/lib/supabase/server"

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

type DashboardDocumentRow = {
  id: string
  reference: string
  title: string
  document_type: string
  status: string
  created_by: string
  updated_at: string
  file_storage_path: string | null
  original_filename: string | null
}

type DashboardDocumentProfile = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
}

function personInitials(name: string): string {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"
}

function displayDocumentDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date)
}

async function getProjectDocuments(projectId: string, currentUserId: string, currentUserEmail: string): Promise<ProjectDocument[]> {
  const supabase = await createClient()
  const { data: documents } = await supabase
    .from("documents")
    .select("id, reference, title, document_type, status, created_by, updated_at, file_storage_path, original_filename")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(5)

  const documentRows = (documents ?? []) as DashboardDocumentRow[]
  const creatorIds = Array.from(new Set(documentRows.map((document) => document.created_by)))
  const { data: profiles } = creatorIds.length
    ? await supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", creatorIds)
    : { data: [] as DashboardDocumentProfile[] }
  const profileRows = (profiles ?? []) as DashboardDocumentProfile[]
  const profileMap = new Map<string, DashboardDocumentProfile>(profileRows.map((profile) => [profile.id, profile]))

  return documentRows.map((document) => {
    const profile = profileMap.get(document.created_by)
    const name = profile?.full_name?.trim() || profile?.email || (document.created_by === currentUserId ? currentUserEmail : "Project member")
    return {
      id: document.id,
      reference: document.reference,
      title: document.title,
      type: normalizeDocumentType(document.document_type),
      uploadedBy: { name, initials: personInitials(name), avatar: profile?.avatar_url ?? undefined },
      lastUpdated: displayDocumentDate(document.updated_at),
      status: document.status === "published" ? "Published" : "Draft",
      fileStoragePath: document.file_storage_path ?? null,
      originalFilename: document.original_filename ?? null,
    }
  })
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
      const documents = await getProjectDocuments(projectId, session.userId, session.email)
      return <ProjectDetail project={toProjectRecord(selectedProject, projectCounts)} documents={documents} />
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
