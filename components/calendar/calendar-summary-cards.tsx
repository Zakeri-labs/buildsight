import { CalendarCheck2, CalendarClock, MessageSquare } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import type { CalendarSummaryViewModel } from "@/lib/calendar/types"
import { cn } from "@/lib/utils"

export function CalendarSummaryCards({
  summary,
  memberMobile = false,
}: {
  summary: CalendarSummaryViewModel
  memberMobile?: boolean
}) {
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
    <div className={cn("grid gap-3 sm:grid-cols-3", memberMobile && "grid-cols-3 gap-2 sm:grid-cols-3 md:gap-3")}>
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
            <CardContent
              className={cn(
                "flex min-h-24 items-center justify-between gap-4 px-4 py-4",
                memberMobile &&
                  "min-h-[5.5rem] flex-col items-stretch justify-between gap-1.5 px-2.5 py-2.5 md:min-h-24 md:flex-row md:items-center md:gap-4 md:px-4 md:py-4",
              )}
            >
              <div className={cn("min-w-0", memberMobile && "contents md:block")}>
                <div className={cn(memberMobile && "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-1 md:contents")}>
                  <p
                    className={cn(
                      "text-sm font-medium text-muted-foreground",
                      item.prominent && "text-primary",
                      memberMobile && "min-w-0 text-[9px] leading-[1.15] sm:text-[10px] md:text-sm md:leading-normal",
                    )}
                  >
                    {item.label}
                  </p>
                  {memberMobile ? (
                    <div
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground md:hidden",
                        item.prominent && "bg-primary/10 text-primary",
                      )}
                      aria-hidden="true"
                    >
                      <Icon className="size-3" />
                    </div>
                  ) : null}
                </div>
                <p
                  className={cn(
                    "mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums",
                    memberMobile && "mt-0 text-xl leading-6 sm:text-2xl md:mt-1 md:text-2xl",
                  )}
                >
                  {item.value}
                </p>
              </div>
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground",
                  item.prominent && "bg-primary/10 text-primary",
                  memberMobile && "hidden md:flex",
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
