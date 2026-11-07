"use client"

import Link from "next/link"
import { useEffect } from "react"
import { ArrowLeft, ArrowRight, FileText, MapPin, MessageCircle, Phone, Video } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { MeetingRequestRow } from "@/lib/design-gallery/booking/admin"
import { meetingWhen } from "@/lib/design-gallery/booking/format"
import { findWilayat } from "@/lib/design-gallery/booking/wilayat"
import { fill } from "@/lib/design-gallery/public-locale"
import { useI18n } from "@/lib/i18n"
import { whatsappUrl } from "@/lib/whatsapp"
import { cn } from "@/lib/utils"

const STATUS_STYLE: Record<string, string> = {
  new: "bg-sky-600 text-white",
  confirmed: "bg-emerald-600 text-white",
  attended: "bg-indigo-600 text-white",
  quote: "bg-amber-500 text-black",
  contract: "bg-green-700 text-white",
  no_show: "bg-rose-600 text-white",
  cancelled: "",
}

/** Meeting requests from the public gallery (read-only list; statuses are changed from the calendar view). */
export function MeetingRequests({
  requests,
  timeZone,
  highlightId,
}: {
  requests: MeetingRequestRow[]
  timeZone: string
  highlightId: string | null
}) {
  const { t, locale } = useI18n()
  const p = t.designGallery.requestsPage
  const b = t.designGalleryPublic.booking
  const lang = locale === "ar" ? "ar" : "en"
  const BackIcon = lang === "ar" ? ArrowRight : ArrowLeft

  useEffect(() => {
    if (highlightId) document.getElementById(`request-${highlightId}`)?.scrollIntoView({ block: "center" })
  }, [highlightId])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div>
        <Link href="/design-gallery" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <BackIcon className="size-4" />
          {p.back}
        </Link>
        <h1 className="text-2xl font-semibold text-balance">{t.designGallery.bookingSettings.requests}</h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">{p.subtitle}</p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{p.empty}</CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => {
            const ModeIcon = r.meetingMode === "remote" ? Video : r.meetingMode === "office" ? MapPin : Phone
            const wilayat = r.wilayat?.startsWith("other:") ? r.wilayat.slice(6) : (() => {
              const found = findWilayat(r.wilayat)
              return found ? (lang === "ar" ? found.ar : found.en) : null
            })()
            const what = r.design
              ? `${lang === "ar" ? r.design.titleAr : r.design.titleEn} (${r.design.code ?? ""})${r.path === "modified" ? ` — ${p.modified}` : ""}`
              : p.idea
            const project = [
              b.projectTypes[r.projectType as keyof typeof b.projectTypes] ?? r.projectType,
              wilayat,
              // Isolated so the number and unit keep their order in Arabic.
              r.landAreaSqm ? `\u2068${r.landAreaSqm.toLocaleString("en-US")} ${lang === "ar" ? "م²" : "m²"}\u2069` : null,
            ].filter(Boolean)
            const calendarNote = p.calendar[r.calendarStatus as keyof typeof p.calendar]
            return (
              <li key={r.id} id={`request-${r.id}`} className="scroll-mt-24">
                <Card className={cn(highlightId === r.id && "ring-2 ring-primary")}>
                  <CardContent className="flex flex-col gap-3 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold [overflow-wrap:anywhere]">
                          <bdi>{r.clientName}</bdi>
                        </p>
                        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{what}</p>
                      </div>
                      <Badge className={cn(STATUS_STYLE[r.status])} variant={r.status === "cancelled" ? "outline" : "default"}>
                        {p.status[r.status as keyof typeof p.status] ?? r.status}
                      </Badge>
                    </div>

                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                      <ModeIcon className="size-4 shrink-0 text-primary" />
                      <span>{b.modes[r.meetingMode]}</span>
                      {r.startsAt ? (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span>{meetingWhen(r.startsAt, lang, timeZone)}</span>
                        </>
                      ) : null}
                    </p>

                    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                      <Item label={p.project} value={project.join(" · ")} />
                      <Item label={p.land} value={b.landStatuses[r.landStatus as keyof typeof b.landStatuses] ?? r.landStatus} />
                      <Item label={p.start} value={b.timelines[r.startTimeline as keyof typeof b.timelines] ?? r.startTimeline} />
                      {r.email ? <Item label={p.email} value={r.email} ltr /> : null}
                      {r.source ? <Item label={p.source} value={r.source} ltr /> : null}
                    </dl>

                    {r.ideaText ? (
                      <p className="whitespace-pre-line rounded-lg bg-muted/60 p-3 text-sm [overflow-wrap:anywhere]" dir="auto">
                        {r.ideaText}
                      </p>
                    ) : null}

                    {r.attachments.length ? (
                      <div className="flex flex-wrap gap-2">
                        {r.attachments.map((file, index) =>
                          file.url ? (
                            <a
                              key={file.id}
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:bg-muted"
                            >
                              <FileText className="size-4" />
                              {fill(p.file, { index: index + 1 })}
                            </a>
                          ) : null,
                        )}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      <a
                        href={whatsappUrl(r.whatsappPhone, "")}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-emerald-600/40 px-3 text-sm text-emerald-700 hover:bg-emerald-600/10 dark:text-emerald-400"
                      >
                        <MessageCircle className="size-4" />
                        <span dir="ltr">+{r.whatsappPhone}</span>
                      </a>
                      {r.meetLink ? (
                        <a href={r.meetLink} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted">
                          <Video className="size-4" />
                          {p.joinMeet}
                        </a>
                      ) : null}
                      {calendarNote ? (
                        <span className={cn("text-xs [overflow-wrap:anywhere]", r.calendarStatus === "failed" ? "text-destructive" : "text-muted-foreground")}>
                          {calendarNote}
                          {r.calendarStatus === "failed" && r.calendarError ? <span dir="ltr"> ({r.calendarError})</span> : null}
                        </span>
                      ) : null}
                      <span className="ms-auto text-xs text-muted-foreground">
                        {fill(p.received, { when: meetingWhen(r.createdAt, lang, timeZone) })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Item({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]" dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  )
}
