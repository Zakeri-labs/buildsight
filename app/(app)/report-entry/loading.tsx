import { Card, CardContent } from "@/components/ui/card"

export default function ReportEntryLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-11 animate-pulse rounded-xl bg-muted" />
      <Card size="sm">
        <CardContent className="grid grid-cols-[6.75rem_1fr] gap-4 py-1">
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
          <div className="space-y-3 py-2">
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="mt-8 h-4 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
