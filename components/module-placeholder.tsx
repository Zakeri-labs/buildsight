"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

type NavKey = "projects" | "inspections" | "ncrs" | "reports" | "documents" | "team" | "settings"

export function ModulePlaceholder({ titleKey }: { titleKey: NavKey }) {
  const { t } = useI18n()

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-balance">{t.nav[titleKey]}</h1>
          <p className="max-w-md text-muted-foreground text-pretty">{t.common.comingSoon}</p>
          <Button variant="outline" render={<Link href="/" />}>
            <ArrowLeft data-icon="inline-start" className="flip-rtl" />
            {t.common.backToDashboard}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
