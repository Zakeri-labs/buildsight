import { Card, CardContent } from "@/components/ui/card"

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className}`} />
}

export default function MemberHomepageLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-0.5 overflow-hidden" aria-label="Loading dashboard">
      {/* 1. Summary Cards (3 top metrics matching MemberHomepage) */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} size="sm" className="relative min-w-0 gap-0 overflow-hidden rounded-xl border border-border/70 bg-card py-3">
            <CardContent className="flex min-h-[5.25rem] flex-col justify-between gap-2 px-3">
              <div className="flex items-center justify-between gap-1">
                <Skeleton className="h-3 w-14 rounded-md" />
                <Skeleton className="size-3.5 rounded-full" />
              </div>
              <Skeleton className="h-7 w-10 rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 2. Visit Compliance banner skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>

      {/* 3. Visit Requests section skeleton */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-4 w-6 rounded-md" />
        </div>
        <Card size="sm" className="py-0">
          <div className="flex min-h-[3.25rem] items-center gap-3 p-3">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4 rounded-md" />
              <Skeleton className="h-2.5 w-1/2 rounded-md" />
            </div>
            <Skeleton className="h-7 w-16 shrink-0 rounded-lg" />
          </div>
        </Card>
        <Card size="sm" className="py-0">
          <div className="flex min-h-[3.25rem] items-center gap-3 p-3">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3 rounded-md" />
              <Skeleton className="h-2.5 w-2/5 rounded-md" />
            </div>
            <Skeleton className="h-7 w-16 shrink-0 rounded-lg" />
          </div>
        </Card>
      </div>

      {/* 4. Recent Reports section skeleton */}
      <div className="space-y-2.5">
        <Skeleton className="h-4 w-24 rounded-md" />
        <Card size="sm" className="py-0">
          <div className="flex min-h-[3.25rem] items-center gap-3 p-3">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-4/5 rounded-md" />
              <Skeleton className="h-2.5 w-1/3 rounded-md" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
