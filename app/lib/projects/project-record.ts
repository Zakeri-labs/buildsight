import type { DomainProject } from "@/lib/db/domain"
import type { ProjectRecord, ProjectStatusKey } from "@/lib/mock-data"
import { PROJECT_TYPES, supervisionTypeLabel } from "@/lib/projects/project-options"
import { projectImageDisplayUrl } from "@/lib/projects/project-image"

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

function projectTypeLabel(value: string | null): string {
  return PROJECT_TYPES.find((option) => option.value === value)?.label ?? (value?.trim() || "Not set")
}

export function toProjectRecord(
  project: DomainProject,
  counts?: { ncrs: number; inspections: number },
): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    code: project.code?.trim() || "Not set",
    location: project.location ?? "Location not set",
    image: projectImageDisplayUrl(project.image, project.id) ?? "/placeholder.svg",
    statusKey: projectStatusKey(project.status),
    projectType: projectTypeLabel(project.projectType),
    supervisionType: supervisionTypeLabel(project.supervisionType, project.supervisionTypeOther),
    organizationRole: project.ourRole?.trim() || "Consultant",
    description: project.description?.trim() || "No project description has been added.",
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
