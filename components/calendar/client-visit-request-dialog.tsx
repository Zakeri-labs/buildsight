"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { CalendarClientRequestViewModel } from "@/lib/calendar/types"

function displayDate(value: string | null, isAsap = false) {
  if (isAsap || !value) return "ASAP"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function displayCreatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not available"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium leading-5 text-foreground">{value || "Not provided"}</p>
    </div>
  )
}

export function ClientVisitRequestDialog({
  request,
  open,
  onOpenChange,
  onApprove,
}: {
  request: CalendarClientRequestViewModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: (request: CalendarClientRequestViewModel) => void
}) {
  const [error, setError] = useState("")

  if (!request) return null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      onOpenChange(nextOpen)
      if (!nextOpen) setError("")
    }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl max-sm:w-[calc(100vw-1rem)] max-sm:max-w-none max-sm:max-h-[calc(100dvh-1rem)] max-sm:gap-3 max-sm:p-4">
        <DialogHeader className="max-sm:gap-1.5">
          <div className="flex min-w-0 items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <DialogTitle>Client Visit Request</DialogTitle>
              <DialogDescription className="mt-1.5 max-sm:text-xs max-sm:leading-5">
                Review the client&apos;s requested visit details before taking action.
              </DialogDescription>
            </div>
            <Badge variant="outline" className="shrink-0 text-muted-foreground">Pending</Badge>
          </div>
        </DialogHeader>

        <div className="grid min-w-0 gap-2.5 sm:grid-cols-2 sm:gap-3">
          <DetailField label="Project" value={request.projectName} />
          <DetailField label="Requesting Client" value={request.requestedBy} />
          <DetailField label="Requested Date" value={displayDate(request.requestedDate, request.isAsap)} />
          <DetailField label="Preferred Time" value={request.preferredTimeLabel} />
          <DetailField label="Created" value={displayCreatedAt(request.createdAt)} />
          <DetailField label="Status" value="Pending" />
        </div>

        {request.purpose ? (
          <div className="min-w-0 rounded-lg border px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Purpose</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-foreground sm:leading-6">{request.purpose}</p>
          </div>
        ) : null}

        <div className="min-w-0 rounded-lg border px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-foreground/80 sm:leading-6">
            {request.notes || "No additional notes were provided."}
          </p>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter className="max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:grid max-sm:grid-cols-2 max-sm:bg-background/95 max-sm:backdrop-blur-sm">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {request.canManage ? (
            <Button
              type="button"
              onClick={() => {
                setError("")
                onApprove(request)
              }}
              disabled={!request.canApprove}
              title={request.canApprove ? undefined : "Assign a Project Supervisor before scheduling this request."}
            >
              Approve and Schedule
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
