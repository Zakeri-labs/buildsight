import { Card, CardContent } from "@/components/ui/card"

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className}`} />
}

export default function CalendarLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3.5 p-0.5 overflow-hidden" aria-label="Loading calendar">
      {/* 1. Top 3 Metric Cards */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} size="sm" className="relative min-w-0 gap-0 overflow-hidden rounded-xl border border-border/70 bg-card py-3">
            <CardContent className="flex min-h-[5.25rem] flex-col justify-between gap-2 px-3">
              <div className="flex items-center justify-between gap-1">
                <Skeleton className="h-3 w-16 rounded-md" />
                <Skeleton className="size-3.5 rounded-full" />
              </div>
              <Skeleton className="h-7 w-8 rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 2. Client Visit Requests bar skeleton */}
      <Card size="sm" className="py-0">
        <div className="flex h-11 items-center justify-between px-3">
          <Skeleton className="h-4 w-36 rounded-md" />
          <Skeleton className="size-4 rounded-md" />
        </div>
      </Card>

      {/* 3. Main Calendar Container */}
      <Card size="sm" className="p-3 space-y-4 rounded-2xl">
        {/* Week navigation header */}
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="size-6 rounded-md" />
          <Skeleton className="h-4 w-32 rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-6 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        </div>

        {/* 7 Days week strip */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={`flex flex-col items-center justify-center py-2 rounded-xl border border-transparent ${
                i === 4 ? "border-primary/20 bg-primary/10" : ""
              }`}
            >
              <Skeleton className="h-2.5 w-6 rounded-xs" />
              <Skeleton className="mt-1.5 h-4 w-5 rounded-sm" />
            </div>
          ))}
        </div>

        <div className="border-t border-border/60 pt-3 space-y-3">
          {/* Day title & Schedule Visit button */}
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-36 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>

          {/* Schedule Visit Rows */}
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} size="sm" className="py-0 overflow-hidden">
                <div className="flex min-h-[3.25rem] items-center gap-3 p-2.5">
                  {/* Left time block */}
                  <Skeleton className="h-10 w-12 shrink-0 rounded-lg" />

                  {/* Middle details */}
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32 rounded-md" />
                    <Skeleton className="h-2.5 w-20 rounded-md" />
                  </div>

                  {/* Right status badge */}
                  <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
