import Link from "next/link"
import { ChevronRight } from "lucide-react"

export type SupervisorInspectionSummary = {
  supervisorId: string
  name: string
  inspectionCount: number
  projectCount: number
}

export function InspectionsBySupervisorCard({
  supervisors,
}: {
  supervisors: SupervisorInspectionSummary[]
}) {
  const maxInspectionCount = supervisors.reduce(
    (max, item) => Math.max(max, item.inspectionCount),
    0,
  )

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Inspections by Supervisor</h2>

      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center">
        {supervisors.length ? (
          <ul className="divide-y divide-border/70">
            {supervisors.map((supervisor) => {
              const relativeWidth =
                maxInspectionCount > 0
                  ? Math.max(0, Math.min(100, (supervisor.inspectionCount / maxInspectionCount) * 100))
                  : 0

              return (
                <li key={supervisor.supervisorId} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {supervisor.name}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">
                      {supervisor.inspectionCount}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="w-[74px] shrink-0 text-xs text-muted-foreground">
                      {supervisor.projectCount} {supervisor.projectCount === 1 ? "Project" : "Projects"}
                    </span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${relativeWidth}%` }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="py-6 text-sm">
            <p className="font-medium text-foreground">No inspection activity</p>
            <p className="mt-1 text-muted-foreground">
              No inspections were recorded for the selected scope.
            </p>
          </div>
        )}
      </div>

      <Link
        href="/inspections"
        className="mt-3 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-primary hover:underline"
      >
        View all Inspections
        <ChevronRight className="size-4 flip-rtl" />
      </Link>
    </div>
  )
}
