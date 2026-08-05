import { CalendarCheck2, CalendarClock, MessageSquare } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import type { CalendarSummaryViewModel } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

export function CalendarSummaryCards({ summary }: { summary: CalendarSummaryViewModel }) {
  const summaries = [
    {
      label: "Pending Client Requests",
      value: summary.pendingClientRequests,
      icon: MessageSquare,
      prominent: true,
    },
    {
      label: "Upcoming Visits",
      value: summary.upcomingVisits,
      icon: CalendarClock,
      prominent: false,
    },
    {
      label: "Today's Visits",
      value: summary.todaysVisits,
      icon: CalendarCheck2,
      prominent: false,
    },
  ] as const

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {summaries.map((item) => {
        const Icon = item.icon

        return (
          <Card
            key={item.label}
            size="sm"
            className={cn(
              "gap-0 py-0",
              item.prominent && "bg-primary/[0.045] ring-primary/25 dark:bg-primary/[0.08]"
            )}
          >
            <CardContent className="flex min-h-24 items-center justify-between gap-4 px-4 py-4">
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium text-muted-foreground",
                    item.prominent && "text-primary"
                  )}
                >
                  {item.label}
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                  {item.value}
                </p>
              </div>
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground",
                  item.prominent && "bg-primary/10 text-primary"
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
