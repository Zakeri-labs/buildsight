export const dynamic = "force-dynamic"
export const revalidate = 0

import { ProjectsList, type ProjectRow } from "@/components/projects/projects-list"
import { requireOnboarded } from "@/lib/auth/session"
import { canAdministerOrganization, canAdministerProject } from "@/lib/auth/guards"
import { getOrgProjects } from "@/lib/db/domain"
import { PROJECT_TYPES, isProjectTypeValue } from "@/lib/projects/project-options"
import { projectImageDisplayUrl } from "@/lib/projects/project-image"
import { normalizeProjectStatus } from "@/lib/projects/project-status"
import { getProjectSupervisorCandidates } from "@/lib/projects/supervisor-candidates-server"
import { createAdminClient } from "@/lib/supabase/admin"

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

async function getAssignedSupervisorNames(supervisorIds: string[]) {
  const ids = Array.from(new Set(supervisorIds.filter(Boolean)))
  if (!ids.length) return new Map<string, string>()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids)
  if (error) throw error

  return new Map(
    (data ?? []).map((profile) => [
      profile.id,
      profile.full_name?.trim() || profile.email?.trim() || "Assigned Supervisor",
    ] as const),
  )
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>
}) {
  const session = await requireOnboarded()
  const params = await searchParams
  const primaryMembership = session.memberships[0]
  const organizationId = session.supervisingOrg?.id ?? primaryMembership?.organization?.id
  const projects = organizationId ? await getOrgProjects(organizationId, session.userId) : []
  const canCreateProjects = session.supervisingOrg
    ? await canAdministerOrganization(session.supervisingOrg.id)
    : false
  const canDeleteProjects = canCreateProjects
  const assignedSupervisorIds = projects
    .map((project) => project.assignedSupervisorId)
    .filter((id): id is string => Boolean(id))
  const [editPermissions, supervisorOptions, supervisorNameById] = await Promise.all([
    Promise.all(projects.map((project) => canAdministerProject(project.id))),
    organizationId && canCreateProjects ? getProjectSupervisorCandidates(organizationId) : Promise.resolve([]),
    getAssignedSupervisorNames(assignedSupervisorIds),
  ])

  const rows: ProjectRow[] = projects.map((project, index) => ({
    id: project.id,
    code: project.code ?? "—",
    name: project.name,
    ownerClient: project.client?.trim() || "—",
    supervisorName: project.assignedSupervisorId ? supervisorNameById.get(project.assignedSupervisorId) ?? "Assigned Supervisor" : null,
    address: project.location?.trim() || "—",
    areaDistrict: project.region?.trim() || null,
    projectType: projectTypeLabel(project.projectType),
    projectTypeValue: isProjectTypeValue(project.projectType) ? project.projectType : null,
    supervisionType: project.supervisionType,
    supervisionTypeOther: project.supervisionTypeOther,
    supervisionStartDate: project.supervisionStartDate,
    description: project.description ?? "",
    status: normalizeProjectStatus(project.status),
    startDate: displayDate(project.startDate),
    progress: Math.min(100, Math.max(0, Math.round(project.progressActual))),
    imageUrl: projectImageDisplayUrl(project.image, project.id) ?? "/placeholder.svg",
    latitude: project.latitude,
    longitude: project.longitude,
    assignedSupervisorId: project.assignedSupervisorId,
    canEdit: editPermissions[index] ?? false,
  }))

  return (
    <ProjectsList
      projects={rows}
      createdProjectId={params.created}
      canDeleteProjects={canDeleteProjects}
      canCreateProjects={canCreateProjects}
      supervisorOptions={supervisorOptions}
    />
  )
}
