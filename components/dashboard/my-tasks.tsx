import Link from "next/link"
import { Circle, MoreVertical, ChevronRight, ClipboardCheck, Mail, MapPinned } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TaskRow } from "@/lib/db/domain"

const typeBadge: Record<TaskRow["type"], string> = {
  NCR: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  Inspection: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  RFI: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  VO: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Review: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  "Site Visit": "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  CC: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
}

const dueTone: Record<TaskRow["dueTone"], string> = {
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  muted: "text-muted-foreground",
}

function dateTime(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function ReviewTask({ task }: { task: TaskRow }) {
  const content = (
    <>
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
        <ClipboardCheck className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Review Submission</p>
          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", typeBadge.Review)}>Review</span>
        </div>
        <p className="mt-1 truncate text-xs font-semibold text-foreground">{task.reportTitle ?? task.reference ?? "Report"}</p>
        {task.reference ? <p className="truncate font-mono text-[11px] text-muted-foreground">{task.reference}</p> : null}
        <p className="truncate text-xs font-medium text-foreground">{task.projectName}</p>
        <p className="truncate text-xs text-muted-foreground">Stage: {task.stageName}</p>
        <p className="truncate text-xs text-muted-foreground">Term: {task.parentTermName}</p>
        {task.subtermName ? <p className="truncate text-xs text-muted-foreground">Sub-term: {task.subtermName}</p> : null}
        <p className="mt-1 text-[11px] text-muted-foreground">
          Submitted by {task.submittedBy ?? "Unknown user"} · {dateTime(task.submittedAt)}
        </p>
      </div>
      <div className="shrink-0 text-end">
        <span className={cn("text-xs font-medium", dueTone[task.dueTone])}>{task.dueLabel}</span>
      </div>
    </>
  )

  return task.href ? (
    <Link
      href={task.href}
      className="flex items-start gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open ${task.subtermName ?? task.parentTermName} review submission`}
    >
      {content}
    </Link>
  ) : (
    <div className="flex items-start gap-3 py-3">{content}</div>
  )
}


function SiteVisitTask({ task }: { task: TaskRow }) {
  const content = (
    <>
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
        <MapPinned className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">New Site Visit Request</p>
          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", typeBadge["Site Visit"])}>Site Visit</span>
        </div>
        <p className="mt-1 truncate text-xs font-medium text-foreground">{task.projectName}</p>
        <p className="truncate text-xs text-muted-foreground">Requested by: {task.requestedBy ?? "Client"}</p>
        <p className="truncate text-xs text-muted-foreground">Preferred visit: {task.preferredVisit ?? "Not specified"}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{dateTime(task.submittedAt)}</p>
      </div>
      <div className="shrink-0 text-end">
        <span className={cn("text-xs font-medium", dueTone[task.dueTone])}>{task.dueLabel}</span>
      </div>
    </>
  )

  return task.href ? (
    <Link href={task.href} className="flex items-start gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Open site visit request for ${task.projectName}`}>
      {content}
    </Link>
  ) : <div className="flex items-start gap-3 py-3">{content}</div>
}

function CcTask({ task }: { task: TaskRow }) {
  const content = (
    <>
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"><Mail className="size-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{task.ccContext === "translation" ? "Translation CC" : "Report CC"}</p>
          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", typeBadge.CC)}>CC</span>
        </div>
        <p className="mt-1 truncate text-xs font-semibold text-foreground">{task.reportTitle ?? task.reference ?? "Report"}</p>
        {task.reference ? <p className="truncate font-mono text-[11px] text-muted-foreground">{task.reference}</p> : null}
        <p className="truncate text-xs font-medium text-foreground">{task.projectName}</p>
        <p className="truncate text-xs text-muted-foreground">{task.stageName} · {task.parentTermName}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Added by {task.ccAddedBy ?? "Project member"} · {dateTime(task.submittedAt)}</p>
      </div>
      <div className="shrink-0 text-end"><span className={cn("text-xs font-medium", dueTone[task.dueTone])}>{task.dueLabel}</span></div>
    </>
  )
  return task.href ? <Link href={task.href} className="flex items-start gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content}</Link> : <div className="flex items-start gap-3 py-3">{content}</div>
}

function StandardTask({ task }: { task: TaskRow }) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0">
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
    </div>
  )
}

export function MyTasks({ tasks }: { tasks: TaskRow[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">My Tasks</h2>

      <ul className="mt-4 flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto">
        {tasks.length === 0 && <li className="py-3 text-sm text-muted-foreground">No tasks for this scope.</li>}
        {tasks.map((task) => (
          <li key={task.id}>{task.type === "Review" ? <ReviewTask task={task} /> : task.type === "Site Visit" ? <SiteVisitTask task={task} /> : task.type === "CC" ? <CcTask task={task} /> : <StandardTask task={task} />}</li>
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
