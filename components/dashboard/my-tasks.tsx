import Link from "next/link"
import { ChevronRight, CircleDot, ClipboardCheck, Clock3 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TaskRow } from "@/lib/db/domain"

const typeBadge: Record<TaskRow["type"], string> = {
  NCR: "bg-red-50 text-red-700",
  Inspection: "bg-blue-50 text-blue-700",
  RFI: "bg-emerald-50 text-emerald-700",
  VO: "bg-amber-50 text-amber-700",
  "Stage Report": "bg-violet-50 text-violet-700",
}

const dueTone: Record<TaskRow["dueTone"], string> = {
  danger: "text-red-600",
  warning: "text-amber-600",
  muted: "text-muted-foreground",
}

const reviewStatusTone: Record<NonNullable<TaskRow["reviewStatus"]>, string> = {
  submitted: "bg-blue-50 text-blue-700",
  under_review: "bg-amber-50 text-amber-700",
}

function submittedLabel(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function reviewStatusLabel(status: NonNullable<TaskRow["reviewStatus"]>) {
  return status === "under_review" ? "Under Review" : "Submitted"
}

function TaskContent({ task }: { task: TaskRow }) {
  if (task.kind === "review" && task.reviewStatus) {
    const dateLabel = submittedLabel(task.submittedAt)
    return (
      <>
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardCheck className="size-4" />
        </div>
        <div className="min-w-0 flex-1 basis-[calc(100%_-_2.75rem)] sm:basis-auto">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {task.action} {task.reference ? `#${task.reference}` : ""}
            </p>
            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", typeBadge[task.type])}>
              {task.type}
            </span>
          </div>
          {task.title && <p className="mt-0.5 truncate text-sm text-foreground/85">{task.title}</p>}
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {task.projectName}
            {task.stageName ? ` · ${task.stageName}` : ""}
          </p>
          {task.submittedBy && <p className="mt-0.5 truncate text-xs text-muted-foreground">Submitted by {task.submittedBy}</p>}
        </div>
        <div className="flex w-full shrink-0 flex-row items-center justify-between gap-2 pl-11 sm:w-auto sm:flex-col sm:items-end sm:justify-start sm:gap-1 sm:pl-0">
          <span
            className={cn(
              "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
              reviewStatusTone[task.reviewStatus],
            )}
          >
            {reviewStatusLabel(task.reviewStatus)}
          </span>
          {dateLabel && (
            <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
              <Clock3 className="size-3" />
              Submitted {dateLabel}
            </span>
          )}
          <ChevronRight className="hidden size-4 text-muted-foreground sm:block" />
        </div>
      </>
    )
  }

  return (
    <>
      <CircleDot className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 basis-[calc(100%_-_2.75rem)] sm:basis-auto">
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
      <div className="flex w-full shrink-0 items-center justify-end gap-2 pl-8 sm:w-auto sm:pl-0">
        {task.dueLabel && <span className={cn("text-xs font-medium", dueTone[task.dueTone])}>{task.dueLabel}</span>}
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
    </>
  )
}

export function MyTasks({ tasks }: { tasks: TaskRow[] }) {
  const reviewCount = tasks.filter((task) => task.kind === "review").length

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">My Tasks</h2>
        {reviewCount > 0 && (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {reviewCount} pending {reviewCount === 1 ? "review" : "reviews"}
          </span>
        )}
      </div>

      <ul className="mt-4 flex max-h-[34rem] flex-1 flex-col divide-y divide-border overflow-y-auto pr-1">
        {tasks.length === 0 && <li className="py-3 text-sm text-muted-foreground">No tasks for this scope.</li>}
        {tasks.map((task) => (
          <li key={task.id} className="first:pt-0">
            {task.href ? (
              <Link
                href={task.href}
                className="flex min-w-0 flex-wrap items-start gap-3 rounded-lg py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <TaskContent task={task} />
              </Link>
            ) : (
              <div className="flex min-w-0 flex-wrap items-start gap-3 py-3">
                <TaskContent task={task} />
              </div>
            )}
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
