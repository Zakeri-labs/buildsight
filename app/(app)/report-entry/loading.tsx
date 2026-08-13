function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className}`} />
}

export default function ReportEntryLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 pb-1">
      {/* Project selector dropdown skeleton */}
      <Skeleton className="h-11 w-full rounded-xl" />

      {/* Stages header title & badge skeleton */}
      <div className="flex items-center justify-between gap-3 px-0.5 pt-0.5">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>

      {/* Project card skeleton */}
      <section className="overflow-hidden rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5 rounded-md" />
            <Skeleton className="h-3 w-2/5 rounded-md" />
            <Skeleton className="h-3 w-1/3 rounded-md" />
          </div>
        </div>
      </section>

      {/* Stage list filter tabs skeleton */}
      <Skeleton className="h-8 w-full rounded-lg" />

      {/* Stage items skeleton */}
      <div className="overflow-hidden rounded-xl border bg-card divide-y divide-border/70">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-40 rounded-md" />
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
