"use client"

import Image from "next/image"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"
import { sitePhotos } from "@/lib/mock-data"

export function LatestPhotos() {
  const { t } = useI18n()

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t.dashboard.latestPhotos}</CardTitle>
        <Link href="/reports" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {t.common.viewAll}
          <ChevronRight className="size-4 flip-rtl" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {sitePhotos.map((photo) => (
            <figure key={photo.id} className="flex flex-col gap-2">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg">
                <Image
                  src={photo.image || "/placeholder.svg"}
                  alt={photo.title}
                  fill
                  className="object-cover transition-transform hover:scale-105"
                  sizes="(max-width: 640px) 100vw, 33vw"
                />
              </div>
              <figcaption>
                <p className="text-sm font-medium leading-tight">{photo.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{photo.timestamp}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
