"use client"

import Link from "next/link"
import { ArrowLeft, CalendarClock, Clock3, FileText, MapPinned, UserRound } from "lucide-react"
import type { SiteVisitListItem } from "@/lib/site-visits/types"
import { preferredTimeLabel, siteVisitRequestCode } from "@/lib/site-visits/format"
import { SiteVisitStatusBadge } from "@/components/site-visits/site-visit-status-badge"
import { SiteVisitStatusActions, WhatsAppQuickMessage } from "@/components/site-visits/site-visit-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid gap-1"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="text-sm font-semibold text-foreground">{value}</dd></div>
}

export function SiteVisitDetail({ request }: { request: SiteVisitListItem }) {
  const listHref = `/site-visits?project=${encodeURIComponent(request.projectId)}`
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <Link href={listHref} className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to Site Visits</Link>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">{siteVisitRequestCode(request.id)}</p>
            <CardTitle className="mt-1 text-lg">Site Visit Request</CardTitle>
            <p className="mt-1 truncate text-sm text-muted-foreground">{request.projectName}</p>
          </div>
          <SiteVisitStatusBadge status={request.status} />
        </CardHeader>
        <CardContent className="grid gap-6 p-5 sm:p-6">
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Project" value={<span className="inline-flex items-center gap-2"><MapPinned className="size-4 text-primary" />{request.projectName}</span>} />
            <Field label="Requested By" value={<span className="inline-flex items-center gap-2"><UserRound className="size-4 text-primary" />{request.requestedBy}</span>} />
            <Field label="Preferred Visit" value={request.isAsap ? "ASAP" : formatDate(request.preferredDate)} />
            <Field label="Preferred Time" value={preferredTimeLabel(request.preferredTime)} />
            <Field label="Created" value={formatDateTime(request.createdAt)} />
            <Field label="Current Status" value={<SiteVisitStatusBadge status={request.status} />} />
            {request.scheduledDate ? <Field label="Scheduled Date" value={formatDate(request.scheduledDate)} /> : null}
            {request.scheduledTime ? <Field label="Scheduled Time" value={<span className="inline-flex items-center gap-2"><Clock3 className="size-4 text-primary" />{request.scheduledTime.slice(0, 5)}</span>} /> : null}
          </dl>

          <div className="grid gap-5 border-t pt-5 lg:grid-cols-2">
            <div className="rounded-xl border bg-muted/15 p-4"><p className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4 text-primary" />Purpose of Visit</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{request.purpose}</p></div>
            <div className="rounded-xl border bg-muted/15 p-4"><p className="text-sm font-semibold">Additional Notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{request.notes || "No additional notes."}</p></div>
          </div>

          {request.scheduledDate ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
              <p className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200"><CalendarClock className="size-4" />Visit Schedule</p>
              <p className="mt-2 text-sm">{formatDate(request.scheduledDate)} at {request.scheduledTime?.slice(0, 5) ?? "—"}</p>
              {request.scheduledBy ? <p className="mt-1 text-sm text-muted-foreground">Scheduled by: {request.scheduledBy}</p> : null}
              {request.assignedParticipants.length ? <p className="mt-1 text-sm text-muted-foreground">Assigned: {request.assignedParticipants.map((person) => person.name).join(", ")}</p> : null}
              {request.scheduledNotes ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.scheduledNotes}</p> : null}
            </div>
          ) : null}

          <div className="flex flex-col justify-between gap-3 border-t pt-5 lg:flex-row lg:items-start">
            <SiteVisitStatusActions request={request} />
            <WhatsAppQuickMessage request={request} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
