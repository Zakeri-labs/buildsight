"use client"

import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

export function DesignGalleryAdminOnly() {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardContent className="py-10 text-center">
          <h1 className="text-lg font-semibold">{t.designGallery.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">{t.designGallery.adminOnly}</p>
        </CardContent>
      </Card>
    </div>
  )
}
