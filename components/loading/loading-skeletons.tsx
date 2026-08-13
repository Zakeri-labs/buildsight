import { HardHat } from "lucide-react"
import { cn } from "@/lib/utils"

type LoadingMessage =
  | "Loading workspace..."
  | "Loading projects..."
  | "Loading project data..."
  | "Loading stages and terms..."
  | "Preparing letters..."
  | "Preparing AI Summary..."
  | "Preparing translation workspace..."

function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("loading-shimmer rounded-lg bg-slate-200/75 dark:bg-slate-800/80", className)} />
}

function LoadingStatus({ message }: { message: LoadingMessage }) {
  return (
    <div className="mb-5 flex items-center justify-center" role="status" aria-live="polite">
      <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-300">
        <span className="relative flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
          <HardHat className="size-4 loading-hardhat" />
          <span className="absolute -bottom-0.5 h-0.5 w-4 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
            <span className="block h-full w-1/2 rounded-full bg-blue-600 loading-progress-line" />
          </span>
        </span>
        <span>{message}</span>
      </div>
    </div>
  )
}

function RouteLoadingFrame({
  children,
  className,
}: {
  message?: LoadingMessage
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("route-loading-reveal mx-auto w-full", className)} aria-busy="true">
      {children}
    </div>
  )
}

function CardShell({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900", className)}>
      {children}
    </div>
  )
}

function MetricCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <CardShell key={index} className="flex items-center gap-4">
          <SkeletonBlock className="size-12 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <SkeletonBlock className="h-3 w-24 max-w-full" />
            <SkeletonBlock className="h-7 w-14" />
          </div>
        </CardShell>
      ))}
    </div>
  )
}

function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="grid gap-4 border-b border-slate-200 bg-slate-50/80 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/35" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => <SkeletonBlock key={index} className={cn("h-3", index === columns - 1 ? "w-8 justify-self-end" : "w-20 max-w-full")} />)}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="grid items-center gap-4 px-5 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((_, column) => (
              <SkeletonBlock
                key={column}
                className={cn(
                  "h-4",
                  column === 0 ? "w-4/5" : column === columns - 1 ? "size-8 justify-self-end rounded-md" : row % 2 ? "w-3/5" : "w-4/5",
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function GlobalLoadingScreen({ message = "Loading workspace..." }: { message?: LoadingMessage }) {
  return (
    <div className="route-loading-reveal fixed inset-0 z-[100] flex min-h-dvh items-center justify-center bg-slate-50/98 px-6 dark:bg-slate-950/98" role="status" aria-live="polite" aria-busy="true">
      <div className="flex max-w-sm flex-col items-center text-center">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <span className="block h-full w-2/5 rounded-full bg-blue-600 loading-progress-line" />
        </div>
      </div>
    </div>
  )
}

export function WorkspaceLoadingSkeleton() {
  return (
    <RouteLoadingFrame message="Loading workspace..." className="max-w-7xl">
      <MetricCardsSkeleton />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <CardShell className="min-h-72 lg:col-span-2">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="mt-5 h-52 w-full rounded-xl" />
        </CardShell>
        <CardShell className="min-h-72">
          <SkeletonBlock className="h-5 w-32" />
          <div className="mt-5 space-y-4">{Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-9 w-full" />)}</div>
        </CardShell>
      </div>
    </RouteLoadingFrame>
  )
}

export function ProjectsLoadingSkeleton() {
  return (
    <RouteLoadingFrame message="Loading projects..." className="max-w-7xl">
      <MetricCardsSkeleton />
      <CardShell className="mt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2"><SkeletonBlock className="h-6 w-40" /><SkeletonBlock className="h-4 w-64 max-w-full" /></div>
          <div className="flex flex-wrap gap-2"><SkeletonBlock className="h-10 w-48" /><SkeletonBlock className="h-10 w-28" /><SkeletonBlock className="h-10 w-28" /></div>
        </div>
      </CardShell>
      <div className="mt-4"><TableSkeleton rows={7} columns={6} /></div>
    </RouteLoadingFrame>
  )
}

export function ProjectDashboardLoadingSkeleton() {
  return (
    <RouteLoadingFrame message="Loading project data..." className="max-w-7xl">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
        <CardShell className="overflow-hidden p-0">
          <SkeletonBlock className="h-64 w-full rounded-none" />
          <div className="p-6">
            <SkeletonBlock className="h-7 w-2/3" />
            <SkeletonBlock className="mt-3 h-4 w-2/5" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <SkeletonBlock key={index} className="h-16 w-full rounded-xl" />)}</div>
          </div>
        </CardShell>
        <div className="space-y-6">
          <CardShell><SkeletonBlock className="h-5 w-36" /><SkeletonBlock className="mx-auto mt-6 size-44 rounded-full" /></CardShell>
          <CardShell><SkeletonBlock className="h-5 w-32" /><div className="mt-5 space-y-3">{Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-10 w-full" />)}</div></CardShell>
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <CardShell><SkeletonBlock className="mb-5 h-5 w-44" /><TableSkeleton rows={4} columns={3} /></CardShell>
        <CardShell><SkeletonBlock className="mb-5 h-5 w-36" /><TableSkeleton rows={4} columns={3} /></CardShell>
      </div>
    </RouteLoadingFrame>
  )
}

export function DocumentsLoadingSkeleton() {
  return (
    <RouteLoadingFrame message="Preparing letters..." className="max-w-7xl">
      <MetricCardsSkeleton />
      <CardShell className="mt-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2"><SkeletonBlock className="h-7 w-40" /><SkeletonBlock className="h-4 w-72 max-w-full" /></div>
          <SkeletonBlock className="h-10 w-36" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3"><SkeletonBlock className="h-10 w-64 max-w-full" /><SkeletonBlock className="h-10 w-32" /><SkeletonBlock className="h-10 w-32" /></div>
      </CardShell>
      <div className="mt-4"><TableSkeleton rows={7} columns={6} /></div>
    </RouteLoadingFrame>
  )
}

export function StagesLoadingSkeleton() {
  return (
    <RouteLoadingFrame message="Loading stages and terms..." className="max-w-7xl">
      <CardShell>
        <SkeletonBlock className="h-7 w-52" />
        <SkeletonBlock className="mt-3 h-4 w-96 max-w-full" />
      </CardShell>
      <div className="mt-5 space-y-4">
        {Array.from({ length: 4 }).map((_, stage) => (
          <CardShell key={stage} className="p-0">
            <div className="flex items-center gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <SkeletonBlock className="size-10 rounded-xl" /><div className="flex-1 space-y-2"><SkeletonBlock className="h-5 w-52 max-w-full" /><SkeletonBlock className="h-3 w-32" /></div><SkeletonBlock className="h-8 w-24 rounded-full" />
            </div>
            <div className="space-y-3 p-5">{Array.from({ length: stage % 2 ? 2 : 3 }).map((_, term) => <SkeletonBlock key={term} className="h-16 w-full rounded-xl" />)}</div>
          </CardShell>
        ))}
      </div>
    </RouteLoadingFrame>
  )
}

export function AiSummaryLoadingSkeleton() {
  return (
    <RouteLoadingFrame message="Preparing AI Summary..." className="max-w-7xl">
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <CardShell>
          <SkeletonBlock className="h-6 w-44" />
          <SkeletonBlock className="mt-3 h-4 w-full" />
          <div className="mt-6 space-y-3">{Array.from({ length: 7 }).map((_, index) => <SkeletonBlock key={index} className="h-14 w-full rounded-xl" />)}</div>
        </CardShell>
        <CardShell className="min-h-[620px]">
          <div className="flex items-center justify-between"><SkeletonBlock className="h-6 w-48" /><SkeletonBlock className="h-10 w-36" /></div>
          <SkeletonBlock className="mt-6 h-24 w-full rounded-xl" />
          <div className="mt-6 grid gap-5 lg:grid-cols-2">{Array.from({ length: 2 }).map((_, index) => <SkeletonBlock key={index} className="h-[420px] w-full rounded-xl" />)}</div>
        </CardShell>
      </div>
    </RouteLoadingFrame>
  )
}

function TranslationColumnSkeleton({ rtl = false }: { rtl?: boolean }) {
  return (
    <div className="space-y-4" dir={rtl ? "rtl" : "ltr"}>
      <CardShell>
        <div className={cn("flex items-center gap-3", rtl && "flex-row-reverse")}><SkeletonBlock className="size-10 rounded-xl" /><div className="flex-1 space-y-2"><SkeletonBlock className="h-5 w-2/3" /><SkeletonBlock className="h-3 w-1/3" /></div></div>
      </CardShell>
      {Array.from({ length: 7 }).map((_, index) => (
        <CardShell key={index}>
          <SkeletonBlock className={cn("h-5 w-40", rtl && "ms-auto")} />
          <div className="mt-4 space-y-2.5"><SkeletonBlock className="h-4 w-full" /><SkeletonBlock className="h-4 w-11/12" /><SkeletonBlock className="h-4 w-3/4" /></div>
          {index === 2 ? <div className="mt-5"><TableSkeleton rows={3} columns={3} /></div> : null}
          {index === 4 ? <SkeletonBlock className="mt-5 aspect-[16/9] w-full rounded-xl" /> : null}
        </CardShell>
      ))}
    </div>
  )
}

export function TranslationLoadingSkeleton() {
  return (
    <RouteLoadingFrame message="Preparing translation workspace..." className="max-w-[1600px]">
      <CardShell className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2"><SkeletonBlock className="h-6 w-64 max-w-full" /><SkeletonBlock className="h-4 w-44" /></div>
        <div className="flex gap-2"><SkeletonBlock className="h-10 w-32" /><SkeletonBlock className="h-10 w-32" /><SkeletonBlock className="h-10 w-32" /></div>
      </CardShell>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <TranslationColumnSkeleton />
        <TranslationColumnSkeleton rtl />
      </div>
    </RouteLoadingFrame>
  )
}
