import { InspectionsList } from "@/components/inspections/inspections-list"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getInspections } from "@/lib/db/domain"
import type { InspectionRecord } from "@/lib/mock-data"
import { formatDate } from "@/lib/format"

const defaultChecklist = (code: string) => [
  { id: `${code}-1`, label: "Materials conform to approved submittals", result: null },
  { id: `${code}-2`, label: "Dimensions and setting-out verified", result: null },
  { id: `${code}-3`, label: "Workmanship meets specification", result: null },
  { id: `${code}-4`, label: "Safety measures in place", result: null },
]

export default async function InspectionsPage() {
  const session = await requireOnboarded()
  const orgId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
  const projectId = await getSelectedProjectId()

  const rows = orgId ? await getInspections(orgId, projectId, session.userId) : []

  const inspections: InspectionRecord[] = rows.map((r) => ({
    id: r.code,
    title: r.title,
    discipline: r.discipline as InspectionRecord["discipline"],
    project: r.projectName,
    location: r.location ?? "—",
    requestedBy: r.requestedBy ?? "—",
    assignedTo: r.assignedTo ?? "—",
    assignedInitials: r.assignedInitials ?? "—",
    scheduled: formatDate(r.scheduled),
    dueDate: formatDate(r.dueDate),
    overdue: r.overdue,
    priority: r.priority,
    status: r.status,
    checklist: defaultChecklist(r.code),
  }))

  return <InspectionsList inspections={inspections} />
}
