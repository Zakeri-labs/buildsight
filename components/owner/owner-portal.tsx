"use client"

import Image from "next/image"
import Link from "next/link"
import { Lock, ArrowLeft, TrendingUp, AlertTriangle, ClipboardCheck, ShieldCheck } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { Logo } from "@/components/logo"
import { LanguageSwitch } from "@/components/language-switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DonutChart } from "@/components/dashboard/donut-chart"
import {
  activeProject,
  milestones,
  projectRisk,
  reports,
  sitePhotos,
  kpis,
} from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const riskTone: Record<string, string> = {
  onTrack: "bg-[var(--success)]/15 text-[var(--success)]",
  atRisk: "bg-[var(--warning)]/15 text-[var(--warning)]",
  delayed: "bg-[var(--danger)]/15 text-[var(--danger)]",
}

export function OwnerPortal() {
  const { t, dir } = useI18n()
  const p = activeProject

  const riskLabel =
    projectRisk === "onTrack" ? t.owner.onTrack : projectRisk === "atRisk" ? t.owner.atRisk : t.owner.delayed

  const metrics = [
    { icon: TrendingUp, label: t.dashboard.actual, value: `${p.progress.actual}%`, tone: "text-[var(--success)]" },
    { icon: ClipboardCheck, label: t.dashboard.openInspections, value: kpis.openInspections, tone: "text-[var(--info)]" },
    { icon: AlertTriangle, label: t.dashboard.openNcrs, value: kpis.openNcrs, tone: "text-[var(--danger)]" },
    { icon: ShieldCheck, label: t.dashboard.safetyObservations, value: kpis.safetyObservations, tone: "text-[var(--success)]" },
  ]

  const publishedReports = reports.filter((r) => r.type !== "safety").slice(0, 3)

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b border-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge className="border-transparent bg-white/10 text-sidebar-foreground">
              <Lock className="size-3" data-icon="inline-start" />
              {t.owner.readOnly}
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitch />
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:text-sidebar-foreground"
            >
              <ArrowLeft className={cn("size-4", dir === "rtl" && "rotate-180")} />
              {t.owner.backToApp}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-balance">{t.owner.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.owner.subtitle}</p>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-lg border border-[var(--info)]/30 bg-[var(--info)]/8 p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-[var(--info)]" />
          <p className="text-sm text-foreground/80">{t.owner.readOnlyNote}</p>
        </div>

        {/* Project + progress */}
        <Card className="mb-6 overflow-hidden">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="relative h-48 w-full md:h-auto md:w-72 md:self-stretch">
              <Image src={p.image || "/placeholder.svg"} alt={p.name} fill className="object-cover" />
            </div>
            <CardContent className="flex flex-1 flex-col gap-4 py-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold text-balance">{p.name}</h2>
                <p className="text-sm text-muted-foreground">{p.location}</p>
                <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span className="text-muted-foreground">
                    {t.dashboard.contractor}: <span className="text-foreground">{p.contractor}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {t.dashboard.targetHandover}: <span className="text-foreground">{p.targetHandover}</span>
                  </span>
                </div>
                <Badge className={cn("mt-2 w-fit border-transparent", riskTone[projectRisk])}>{riskLabel}</Badge>
              </div>
              <DonutChart
                segments={[
                  { value: p.progress.actual, color: "var(--success)" },
                  { value: Math.max(0, 100 - p.progress.actual), color: "var(--muted)" },
                ]}
                total={100}
                size={128}
                centerTop={<span className="text-2xl font-semibold tabular-nums">{p.progress.actual}%</span>}
                centerBottom={<span className="text-xs text-muted-foreground">{t.dashboard.actual}</span>}
              />
            </CardContent>
          </div>
        </Card>

        {/* Metrics */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {metrics.map((m) => (
            <Card key={m.label}>
              <CardContent className="flex items-center gap-3 py-4">
                <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <m.icon className={cn("size-5", m.tone)} />
                </span>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{m.value}</p>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Milestones */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t.owner.milestones}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {milestones.map((m) => (
                  <div key={m.key} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{t.owner[m.key]}</span>
                      <span className="tabular-nums text-muted-foreground">{m.progress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${m.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Reports */}
          <Card>
            <CardHeader>
              <CardTitle>{t.owner.latestReports}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col divide-y divide-border">
                {publishedReports.map((r) => (
                  <div key={r.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                    <span className="text-sm font-medium text-foreground">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.date} · {r.author}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Photos */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t.owner.sitePhotos}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {sitePhotos.map((photo) => (
                <figure key={photo.id} className="overflow-hidden rounded-lg border border-border">
                  <div className="relative aspect-video">
                    <Image src={photo.image || "/placeholder.svg"} alt={photo.title} fill className="object-cover" />
                  </div>
                  <figcaption className="px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{photo.title}</p>
                    <p className="text-xs text-muted-foreground">{photo.timestamp}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
