import { CalendarSearch } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function ClientVisitRequestsPanel({ className }: { className?: string }) {
  return (
    <Card className={cn("h-full min-h-[360px]", className)}>
      <CardHeader className="border-b">
        <CardTitle>Client Visit Requests</CardTitle>
        <CardAction>
          <Badge variant="secondary" aria-label="0 client visit requests">
            0
          </Badge>
        </CardAction>
      </CardHeader>
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
    </Card>
  )
}
