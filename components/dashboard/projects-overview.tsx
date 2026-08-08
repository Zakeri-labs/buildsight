"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ChevronRight, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProjectImageDisplay } from "@/components/projects/project-image-display"
import { ProjectEditDialog, type ProjectEditData } from "@/components/projects/project-edit-dialog"
import { useI18n } from "@/lib/i18n"
import { PROJECT_TYPES, isProjectTypeValue } from "@/lib/projects/project-options"
import type { ProjectSupervisorCandidate } from "@/lib/projects/supervisor-candidates"

export type ProjectOverviewRow = {
  id: string
  name: string
  image: string | null
  ownerClient: string | null
  supervisor: string | null
  role: string
  inspections: number
  rfis: number
  vos: number
  progress: number
  canEdit: boolean
  edit: {
    code: string | null
    address: string | null
    areaDistrict: string | null
    projectType: string | null
    supervisionType: string | null
    supervisionTypeOther: string | null
    status: string
    plotNo: string | null
    supervisionStartDate: string | null
    priority: string | null
    includedStructureVisits: number | null
    includedFinishingVisits: number | null
    structureSupervisionFee: number | null
    finishingSupervisionFee: number | null
    receivedAmount: number | null
    outstandingAmount: number | null
    nextPaymentAmount: number | null
    nextPaymentDueDate: string | null
    invoiceReferencePaymentNote: string | null
    initialRemarks: string | null
    description: string | null
    latitude: number | null
    longitude: number | null
    assignedSupervisorId: string | null
  } | null
}

const roleBadge: Record<string, string> = {
  Consultant: "bg-blue-50 text-blue-700",
  Contractor: "bg-emerald-50 text-emerald-700",
  Client: "bg-indigo-50 text-indigo-700",
}

function toEditData(project: ProjectOverviewRow): ProjectEditData {
  const edit = project.edit
  if (!edit) throw new Error("Project edit data is unavailable")
  const rawProjectType = edit.projectType
  const projectTypeValue = isProjectTypeValue(rawProjectType) ? rawProjectType : null
  const projectTypeLabel = PROJECT_TYPES.find((option) => option.value === projectTypeValue)?.label ?? "—"

  return {
    id: project.id,
    name: project.name,
    code: edit.code?.trim() || "—",
    address: edit.address?.trim() || "—",
    areaDistrict: edit.areaDistrict,
    projectTypeLabel,
    projectTypeValue,
    supervisionType: edit.supervisionType,
    supervisionTypeOther: edit.supervisionTypeOther,
    status: edit.status,
    plotNo: edit.plotNo,
    supervisionStartDate: edit.supervisionStartDate,
    priority: edit.priority,
    includedStructureVisits: edit.includedStructureVisits,
    includedFinishingVisits: edit.includedFinishingVisits,
    structureSupervisionFee: edit.structureSupervisionFee,
    finishingSupervisionFee: edit.finishingSupervisionFee,
    receivedAmount: edit.receivedAmount,
    outstandingAmount: edit.outstandingAmount,
    nextPaymentAmount: edit.nextPaymentAmount,
    nextPaymentDueDate: edit.nextPaymentDueDate,
    invoiceReferencePaymentNote: edit.invoiceReferencePaymentNote,
    initialRemarks: edit.initialRemarks,
    description: edit.description ?? "",
    latitude: edit.latitude,
    longitude: edit.longitude,
    assignedSupervisorId: edit.assignedSupervisorId,
  }
}

export function ProjectsOverview({
  projects,
  selectedProjectId,
  supervisorOptions = [],
}: {
  projects: ProjectOverviewRow[]
  selectedProjectId?: string | null
  supervisorOptions?: ProjectSupervisorCandidate[]
}) {
  const router = useRouter()
  const { locale } = useI18n()
  const [editTarget, setEditTarget] = useState<ProjectOverviewRow | null>(null)

  return (
    <>
      <div className="flex flex-col rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">Projects Overview</h2>

        <div className="mt-4 flex-1 overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
              <col className="w-[17%]" />
              <col className="w-[5%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="pb-3 pe-3 font-medium">Project Name</th>
                <th className="pb-3 pe-3 font-medium">Owner / Client</th>
                <th className="pb-3 pe-3 font-medium">Supervisor</th>
                <th className="pb-3 pe-3 font-medium">Role</th>
                <th className="pb-3 pe-3 text-center font-medium">Inspections</th>
                <th className="pb-3 pe-3 text-center font-medium">RFIs</th>
                <th className="pb-3 pe-3 text-center font-medium">VOs</th>
                <th className="pb-3 pe-3 font-medium">Progress</th>
                <th className="pb-3 text-end font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                    No projects yet.
                  </td>
                </tr>
              )}
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-3 pe-3 font-medium text-foreground">
                    <Link href={`/projects/${p.id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
                      <ProjectImageDisplay
                        src={p.image}
                        projectId={p.id}
                        alt={p.name}
                        className="size-9 shrink-0 rounded-lg border"
                        iconClassName="size-4"
                      />
                      <span className="min-w-0 truncate" title={p.name}>{p.name}</span>
                    </Link>
                  </td>
                  <td className="py-3 pe-3 text-foreground">
                    <span className="block truncate" title={p.ownerClient ?? undefined}>{p.ownerClient ?? "—"}</span>
                  </td>
                  <td className="py-3 pe-3 text-foreground">
                    <span className="block truncate" title={p.supervisor ?? undefined}>{p.supervisor ?? "—"}</span>
                  </td>
                  <td className="py-3 pe-3">
                    <span
                      className={cn(
                        "inline-flex max-w-full truncate rounded-md px-2 py-0.5 text-xs font-medium",
                        roleBadge[p.role] ?? "bg-slate-100 text-slate-700",
                      )}
                      title={p.role}
                    >
                      {p.role}
                    </span>
                  </td>
                  <td className="py-3 pe-3 text-center font-semibold text-blue-600">{p.inspections}</td>
                  <td className="py-3 pe-3 text-center font-semibold text-emerald-600">{p.rfis}</td>
                  <td className="py-3 pe-3 text-center font-semibold text-amber-600">{p.vos}</td>
                  <td className="py-3 pe-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${p.progress}%` }} />
                      </div>
                      <span className="w-9 shrink-0 text-xs font-medium text-muted-foreground">{p.progress}%</span>
                    </div>
                  </td>
                  <td className="py-3 text-end">
                    <button
                      type="button"
                      aria-label={p.canEdit ? `Edit ${p.name}` : `Actions for ${p.name}`}
                      disabled={!p.canEdit}
                      aria-disabled={!p.canEdit}
                      title={p.canEdit ? `Edit ${p.name}` : "You do not have permission to edit this project"}
                      onClick={() => {
                        if (p.canEdit && p.edit) setEditTarget(p)
                      }}
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
                        p.canEdit ? "hover:bg-muted hover:text-foreground" : "cursor-not-allowed opacity-50",
                      )}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Link
          href={selectedProjectId ? `/projects/${selectedProjectId}` : "/projects"}
          className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-primary hover:underline"
        >
          {selectedProjectId ? "View project overview" : "View all projects"}
          <ChevronRight className="size-4 flip-rtl" />
        </Link>
      </div>

      {editTarget ? (
        <ProjectEditDialog
          key={editTarget.id}
          project={toEditData(editTarget)}
          locale={locale}
          supervisorOptions={supervisorOptions}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}
