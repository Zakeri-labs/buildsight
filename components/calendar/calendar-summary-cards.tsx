import { CalendarCheck2, CalendarClock, MessageSquare } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const summaries = [
  {
    label: "Pending Client Requests",
    value: 0,
    icon: MessageSquare,
    prominent: true,
  },
  {
    label: "Upcoming Visits",
    value: 0,
    icon: CalendarClock,
    prominent: false,
  },
  {
    label: "Today's Visits",
    value: 0,
    icon: CalendarCheck2,
    prominent: false,
  },
] as const

export function CalendarSummaryCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {summaries.map((summary) => {
        const Icon = summary.icon

        return (
          <Card
            key={summary.label}
            size="sm"
            className={cn(
              "gap-0 py-0",
              summary.prominent && "bg-primary/[0.045] ring-primary/25 dark:bg-primary/[0.08]"
            )}
          >
            <CardContent className="flex min-h-24 items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium text-muted-foreground",
                    summary.prominent && "text-primary"
                  )}
                >
                  {summary.label}
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  {summary.value}
                </p>
              </div>
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground",
                  summary.prominent && "bg-primary/10 text-primary"
                )}
                aria-hidden="true"
              >
                <Icon className="size-5" />
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
