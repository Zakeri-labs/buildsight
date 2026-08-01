import { NcrsList } from "@/components/ncrs/ncrs-list"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { getNcrs } from "@/lib/db/domain"
import type { NcrRecord } from "@/lib/mock-data"
import { formatDate } from "@/lib/format"

export default async function NcrsPage() {
  const session = await requireOnboarded()
  const orgId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id ?? null
  const projectId = await getSelectedProjectId()

  const rows = orgId ? await getNcrs(orgId, projectId) : []

  const ncrs: NcrRecord[] = rows.map((r) => ({
    id: r.code,
    title: r.title,
    discipline: r.discipline as NcrRecord["discipline"],
    project: r.projectName,
    location: r.location ?? "—",
    severity: r.severity,
    status: r.status,
    raisedBy: r.raisedBy ?? "—",
    raisedOn: formatDate(r.raisedOn),
    assignedTo: r.assignedTo ?? "—",
    assignedInitials: r.assignedInitials ?? "—",
    dueDate: formatDate(r.dueDate),
    description: r.description ?? "—",
    rootCause: r.rootCause ?? "—",
    correctiveAction: r.correctiveAction ?? "—",
    timeline: [
      { label: "NCR Raised", date: formatDate(r.raisedOn), by: r.raisedBy ?? "—" },
      ...(r.status !== "open"
        ? [{ label: "Under Review", date: formatDate(r.raisedOn), by: r.assignedTo ?? "—" }]
        : []),
      ...(r.status === "closed"
        ? [{ label: "NCR Closed", date: formatDate(r.dueDate), by: r.assignedTo ?? "—" }]
        : []),
    ],
  }))

  return <NcrsList ncrs={ncrs} />
}
