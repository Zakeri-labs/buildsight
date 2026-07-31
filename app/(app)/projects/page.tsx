import { ProjectsList, type ProjectRow, type OrgRole, type ProjectStatus } from "@/components/projects/projects-list"
import { requireOnboarded, isOrgAdmin } from "@/lib/auth/session"
import { canAdministerProject } from "@/lib/auth/guards"
import { getOrgProjects } from "@/lib/db/domain"
import { PROJECT_TYPES, isProjectTypeValue } from "@/lib/projects/project-options"
import { projectImageDisplayUrl } from "@/lib/projects/project-image"

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

function projectTypeLabel(value: string | null) {
  return PROJECT_TYPES.find((type) => type.value === value)?.label ?? "—"
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
  const canDeleteProjects = Boolean(
    session.supervisingOrg && isOrgAdmin(session, session.supervisingOrg.id),
  )
  const editPermissions = await Promise.all(projects.map((project) => canAdministerProject(project.id)))

  const rows: ProjectRow[] = projects.map((project, index) => ({
    id: project.id,
    code: project.code ?? "—",
    name: project.name,
    ownerClient: project.client?.trim() || "—",
    orgRole: organizationRole(project.ourRole),
    address: project.location?.trim() || "—",
    projectType: projectTypeLabel(project.projectType),
    projectTypeValue: isProjectTypeValue(project.projectType) ? project.projectType : null,
    supervisionType: project.supervisionType,
    supervisionTypeOther: project.supervisionTypeOther,
    description: project.description ?? "",
    status: projectStatus(project.status),
    startDate: displayDate(project.startDate),
    progress: Math.min(100, Math.max(0, Math.round(project.progressActual))),
    imageUrl: projectImageDisplayUrl(project.image, project.id) ?? "/placeholder.svg",
    latitude: project.latitude,
    longitude: project.longitude,
    canEdit: editPermissions[index] ?? false,
  }))

  return (
    <ProjectsList
      projects={rows}
      createdProjectId={params.created}
      canDeleteProjects={canDeleteProjects}
    />
  )
}
