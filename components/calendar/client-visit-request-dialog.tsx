"use client"

import { useState, useTransition } from "react"

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
import { rejectCalendarClientVisitRequestAction } from "@/lib/actions/site-visits"
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
    <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value || "Not provided"}</p>
    </div>
  )
}

export function ClientVisitRequestDialog({
  request,
  open,
  onOpenChange,
  onApprove,
  onRejected,
  onRefreshRequired,
}: {
  request: CalendarClientRequestViewModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: (request: CalendarClientRequestViewModel) => void
  onRejected: () => Promise<void> | void
  onRefreshRequired: () => Promise<void> | void
}) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  if (!request) return null

  function rejectRequest() {
    if (pending) return
    setError("")
    startTransition(async () => {
      const result = await rejectCalendarClientVisitRequestAction({ requestId: request.id })
      if (result.ok === false) {
        setError(result.error)
        if (result.error === "This request has already been processed.") await onRefreshRequired()
        return
      }
      setRejectOpen(false)
      onOpenChange(false)
      await onRejected()
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (pending) return
        onOpenChange(nextOpen)
        if (!nextOpen) {
          setRejectOpen(false)
          setError("")
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="min-w-0">
                <DialogTitle>Client Visit Request</DialogTitle>
                <DialogDescription className="mt-2">
                  Review the client&apos;s requested visit details before taking action.
                </DialogDescription>
              </div>
              <Badge variant="outline" className="shrink-0 text-muted-foreground">Pending</Badge>
            </div>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Project" value={request.projectName} />
            <DetailField label="Requesting Client" value={request.requestedBy} />
            <DetailField label="Requested Date" value={displayDate(request.requestedDate, request.isAsap)} />
            <DetailField label="Preferred Time" value={request.preferredTimeLabel} />
            <DetailField label="Created" value={displayCreatedAt(request.createdAt)} />
            <DetailField label="Status" value="Pending" />
          </div>

          {request.purpose ? (
            <div className="rounded-lg border px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Purpose</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{request.purpose}</p>
            </div>
          ) : null}

          <div className="rounded-lg border px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground/80">
              {request.notes || "No additional notes were provided."}
            </p>
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Close</Button>
            {request.canManage ? (
              <Button type="button" variant="destructive" onClick={() => {
                setError("")
                setRejectOpen(true)
              }} disabled={pending}>
                Reject
              </Button>
            ) : null}
            {request.canManage ? (
              <Button
                type="button"
                onClick={() => onApprove(request)}
                disabled={pending || !request.canApprove}
                title={request.canApprove ? undefined : "Assign a Project Supervisor before scheduling this request."}
              >
                Approve and Schedule
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={(nextOpen) => {
        if (pending) return
        setRejectOpen(nextOpen)
        if (!nextOpen) setError("")
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Client Visit Request?</DialogTitle>
            <DialogDescription>
              This request will leave the pending queue and no Site Visit will be created.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={rejectRequest} disabled={pending}>
              {pending ? "Rejecting..." : "Reject Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
