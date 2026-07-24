import Link from "next/link"
import { ChevronRight, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { portfolioProjects, type ProjectRole } from "@/lib/portfolio-data"

const roleBadge: Record<ProjectRole, string> = {
  Consultant: "bg-blue-50 text-blue-700",
  Contractor: "bg-emerald-50 text-emerald-700",
  Client: "bg-indigo-50 text-indigo-700",
}

export function ProjectsOverview() {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Projects Overview</h2>

      <div className="mt-4 flex-1 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="pb-3 pe-3 font-medium">Project Name</th>
              <th className="pb-3 pe-3 font-medium">Role</th>
              <th className="pb-3 pe-3 text-center font-medium">NCRs</th>
              <th className="pb-3 pe-3 text-center font-medium">Inspections</th>
              <th className="pb-3 pe-3 text-center font-medium">RFIs</th>
              <th className="pb-3 pe-3 text-center font-medium">VOs</th>
              <th className="pb-3 pe-3 font-medium">Progress</th>
              <th className="pb-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {portfolioProjects.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-3 pe-3 font-medium text-foreground">{p.name}</td>
                <td className="py-3 pe-3">
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                      roleBadge[p.role],
                    )}
                  >
                    {p.role}
                  </span>
                </td>
                <td className="py-3 pe-3 text-center font-semibold text-red-600">{p.ncrs}</td>
                <td className="py-3 pe-3 text-center font-semibold text-blue-600">{p.inspections}</td>
                <td className="py-3 pe-3 text-center font-semibold text-emerald-600">{p.rfis}</td>
                <td className="py-3 pe-3 text-center font-semibold text-amber-600">{p.vos}</td>
                <td className="py-3 pe-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${p.progress}%` }} />
                    </div>
                    <span className="w-9 text-xs font-medium text-muted-foreground">{p.progress}%</span>
                  </div>
                </td>
                <td className="py-3 text-end">
                  <button
                    type="button"
                    aria-label={`Actions for ${p.name}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
        href="/projects"
        className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-primary hover:underline"
      >
        View all projects
        <ChevronRight className="size-4 flip-rtl" />
      </Link>
    </div>
  )
}
