import { ProjectsList, type ProjectRow, type OrgRole, type ProjectStatus } from "@/components/projects/projects-list"
import { requireOnboarded } from "@/lib/auth/session"
import { getOrgProjects } from "@/lib/db/domain"

function projectStatus(status: string): ProjectStatus {
  const normalized = status.trim().toLowerCase().replaceAll("_", "-")
  if (normalized.includes("complete")) return "Completed"
  if (normalized.includes("hold") || normalized.includes("pause")) return "On Hold"
  if (normalized.includes("plan") || normalized === "draft") return "Planning"
  return "In Progress"
}

function organizationRole(role: string | null): OrgRole {
  const normalized = role?.trim().toLowerCase() ?? ""
  if (normalized.includes("contract")) return "Contractor"
  if (normalized.includes("client") || normalized.includes("owner")) return "Client"
  if (normalized.includes("government")) return "Government"
  if (normalized.includes("third")) return "Third Party"
  return "Consultant"
}

function displayDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date)
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>
}) {
  const [params, session] = await Promise.all([searchParams, requireOnboarded()])
  const primaryMembership = session.memberships[0]
  const organizationId = session.supervisingOrg?.id ?? primaryMembership?.organization?.id
  const projects = organizationId ? await getOrgProjects(organizationId) : []

  const rows: ProjectRow[] = projects.map((project) => ({
    id: project.id,
    code: project.code ?? "—",
    name: project.name,
    ownerClient: project.client?.trim() || "—",
    orgRole: organizationRole(project.ourRole),
    address: project.location?.trim() || "—",
    projectType: "—",
    status: projectStatus(project.status),
    startDate: displayDate(project.startDate),
    progress: Math.min(100, Math.max(0, Math.round(project.progressActual))),
    imageUrl: project.image?.trim() || "/placeholder.svg",
  }))

  return <ProjectsList projects={rows} createdProjectId={params.created} />
}
