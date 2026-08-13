function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className}`} />
}

export default function ProjectStagesLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 pb-1">
      {/* Header title & badge */}
      <div className="flex items-center justify-between gap-3 px-0.5 pt-0.5">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>

      {/* Project Card */}
      <section className="overflow-hidden rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5 rounded-md" />
            <Skeleton className="h-3 w-2/5 rounded-md" />
          </div>
        </div>
      </section>

      {/* Filter tabs */}
      <Skeleton className="h-8 w-full rounded-lg" />

      {/* Stages list */}
      <div className="overflow-hidden rounded-xl border bg-card divide-y divide-border/70">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-36 rounded-md" />
                <Skeleton className="h-2.5 w-24 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-8 w-20 shrink-0 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
