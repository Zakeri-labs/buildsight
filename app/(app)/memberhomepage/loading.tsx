import { Card, CardContent } from "@/components/ui/card"

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />
}

function PlaceholderSummaryCard({ label, value }: { label: string; value?: number }) {
  return (
    <Card size="sm" className="min-w-0 gap-0 py-3">
      <CardContent className="flex min-h-[5.5rem] flex-col justify-between gap-2 px-3">
        <p className="min-w-0 text-[11px] font-medium leading-4 text-muted-foreground sm:text-xs">{label}</p>
        {typeof value === "number" ? (
          <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
        ) : (
          <Skeleton className="h-8 w-10" />
        )}
      </CardContent>
    </Card>
  )
}

export default function MemberHomepageLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 overflow-hidden" aria-label="Loading Member homepage">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <PlaceholderSummaryCard label="Today's Reports" />
        <PlaceholderSummaryCard label="Tomorrow's Visits" />
        <PlaceholderSummaryCard label="Visit Requests" />
      </div>
      <div className="space-y-2.5">
        <span className="text-base font-semibold tracking-tight sm:text-lg">Visit Compliance</span>
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-lg font-semibold tracking-tight">Visit Requests</span>
          <Skeleton className="h-4 w-5" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  )
}
