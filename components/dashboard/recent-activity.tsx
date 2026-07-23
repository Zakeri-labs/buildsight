"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { recentActivity } from "@/lib/mock-data"

const toneDot: Record<string, string> = {
  info: "bg-info",
  danger: "bg-destructive",
  success: "bg-success",
  neutral: "bg-muted-foreground",
}

export function RecentActivity() {
  const { t } = useI18n()

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t.dashboard.recentActivity}</CardTitle>
        <Link href="/reports" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {t.common.viewAll}
          <ChevronRight className="size-4 flip-rtl" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {recentActivity.map((a) => (
          <div key={a.id} className="flex items-center gap-3 border-b border-border/60 py-3 last:border-0">
            <Avatar className="size-9">
              <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                {a.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">
                <span className="font-semibold">{a.person}</span> {a.action}{" "}
                <span className="font-medium text-primary">{a.reference}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="whitespace-nowrap text-xs text-muted-foreground">{a.time}</span>
              <span className={cn("size-2 rounded-full", toneDot[a.tone])} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
