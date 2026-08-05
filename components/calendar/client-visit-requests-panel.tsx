import { CalendarSearch } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CalendarClientRequestViewModel } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

function displayDate(request: CalendarClientRequestViewModel) {
  if (request.isAsap || !request.requestedDate) return "ASAP"
  const date = new Date(`${request.requestedDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return request.requestedDate
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

export function ClientVisitRequestsPanel({
  requests,
  className,
  onRequestClick,
}: {
  requests: CalendarClientRequestViewModel[]
  className?: string
  onRequestClick?: (request: CalendarClientRequestViewModel) => void
}) {
  return (
    <Card className={cn("h-full min-h-[360px]", className)}>
      <CardHeader className="border-b">
        <CardTitle>Client Visit Requests</CardTitle>
        <CardAction>
          <Badge
            variant="secondary"
            aria-label={`${requests.length} client visit ${requests.length === 1 ? "request" : "requests"}`}
          >
            {requests.length}
          </Badge>
        </CardAction>
      </CardHeader>

      {requests.length ? (
        <CardContent className="min-h-0 flex-1 overflow-y-auto px-0">
          <div className="divide-y">
            {requests.map((request) => (
              <button
                key={request.id}
                type="button"
                onClick={() => onRequestClick?.(request)}
                className="block w-full px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-foreground">
                      {request.projectName}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {displayDate(request)} · {request.preferredTimeLabel}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-muted-foreground">
                    Pending
                  </Badge>
                </div>
                {request.requestedBy ? (
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    Requested by {request.requestedBy}
                  </p>
                ) : null}
                {request.notesPreview ? (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-foreground/75">
                    {request.notesPreview}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </CardContent>
      ) : (
        <CardContent className="flex flex-1 items-center justify-center py-10">
          <div className="mx-auto flex max-w-xs flex-col items-center text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <CalendarSearch className="size-6" aria-hidden="true" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">No client visit requests</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              New requests will appear here in preferred visit date order.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
