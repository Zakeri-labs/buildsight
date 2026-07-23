"use client"

import { FilePlus2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"

export function DashboardHeader() {
  const { t, locale } = useI18n()
  const formatted = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date())

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{t.dashboard.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatted}</p>
      </div>
      <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
        <FilePlus2 data-icon="inline-start" />
        {t.common.newSiteReport}
      </Button>
    </div>
  )
}
