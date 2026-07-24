import Link from "next/link"
import { Circle, MoreVertical, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TaskRow } from "@/lib/db/domain"

const typeBadge: Record<TaskRow["type"], string> = {
  NCR: "bg-red-50 text-red-700",
  Inspection: "bg-blue-50 text-blue-700",
  RFI: "bg-emerald-50 text-emerald-700",
  VO: "bg-amber-50 text-amber-700",
}

const dueTone: Record<TaskRow["dueTone"], string> = {
  danger: "text-red-600",
  warning: "text-amber-600",
  muted: "text-muted-foreground",
}

export function MyTasks({ tasks }: { tasks: TaskRow[] }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">My Tasks</h2>

      <ul className="mt-4 flex flex-1 flex-col divide-y divide-border">
        {tasks.length === 0 && <li className="py-3 text-sm text-muted-foreground">No tasks for this scope.</li>}
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-3 py-3 first:pt-0">
            <button
              type="button"
              aria-label={`Complete ${task.action} ${task.reference ?? ""}`}
              className="mt-0.5 text-muted-foreground transition-colors hover:text-emerald-600"
            >
              <Circle className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">
                  {task.action} {task.reference ? `#${task.reference}` : ""}
                </p>
                <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", typeBadge[task.type])}>
                  {task.type}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">{task.projectName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={cn("text-xs font-medium", dueTone[task.dueTone])}>{task.dueLabel}</span>
              <button
                type="button"
                aria-label={`Actions for ${task.reference}`}
                className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MoreVertical className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/calendar"
        className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-primary hover:underline"
      >
        View all tasks
        <ChevronRight className="size-4 flip-rtl" />
      </Link>
    </div>
  )
}
