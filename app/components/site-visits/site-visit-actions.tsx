"use client"

import { useMemo, useState, useTransition, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, CheckCircle2, MessageCircle, XCircle } from "lucide-react"
import { scheduleSiteVisitAction, updateSiteVisitStatusAction } from "@/lib/actions/site-visits"
import type { SiteVisitListItem } from "@/lib/site-visits/types"
import { localDateInputValue, preferredVisitLabel } from "@/lib/site-visits/format"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function whatsappUrl(phone: string, message: string) {
  let digits = phone.trim().replace(/^00/, "").replace(/\D/g, "")
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : "#"
}

export function WhatsAppQuickMessage({ request }: { request: SiteVisitListItem }) {
  const [open, setOpen] = useState(false)
  const message = useMemo(() => [
    "Hello,",
    "",
    "I would like to request a site visit for:",
    "",
    `Project: ${request.projectName}`,
    `Preferred Visit: ${preferredVisitLabel(request)}`,
    `Purpose: ${request.purpose}`,
    "",
    "Thank you.",
  ].join("\n"), [request])

  if (!request.whatsappRecipients.length) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="lg" />}><MessageCircle className="size-4" />Send via WhatsApp</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Send via WhatsApp</DialogTitle><DialogDescription>Select a project participant with a WhatsApp-capable phone number.</DialogDescription></DialogHeader>
        <div className="grid max-h-72 gap-2 overflow-y-auto">
          {request.whatsappRecipients.map((recipient) => (
            <a key={recipient.id} href={whatsappUrl(recipient.phone ?? "", message.replace("Hello,", `Hello ${recipient.name},`))} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3 transition-colors hover:bg-muted">
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{recipient.name}</span><span className="block truncate text-xs text-muted-foreground">{recipient.role ?? "Project participant"} · {recipient.phone}</span></span>
              <MessageCircle className="size-4 shrink-0 text-emerald-600" />
            </a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ScheduleSiteVisitDialog({ request }: { request: SiteVisitListItem }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(request.scheduledDate ?? (!request.isAsap ? request.preferredDate ?? "" : ""))
  const [time, setTime] = useState(request.scheduledTime?.slice(0, 5) ?? "")
  const [notes, setNotes] = useState(request.scheduledNotes ?? "")
  const [assigned, setAssigned] = useState<string[]>(request.assignedParticipants.map((person) => person.id))
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function toggle(userId: string) {
    setAssigned((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId])
  }

  function submit() {
    setError("")
    startTransition(async () => {
      const result = await scheduleSiteVisitAction({ requestId: request.id, scheduledDate: date, scheduledTime: time, notes, assignedUserIds: assigned })
      if (result.ok === false) return setError(result.error)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="lg" />}><CalendarClock className="size-4" />{request.status === "scheduled" ? "Reschedule" : "Schedule Visit"}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Schedule Site Visit</DialogTitle><DialogDescription>Set the confirmed visit date, time, participants, and notes.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="scheduled-date">Visit Date</Label><Input id="scheduled-date" type="date" min={localDateInputValue()} value={date} onChange={(event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value)} className="h-10" /></div>
            <div className="grid gap-2"><Label htmlFor="scheduled-time">Visit Time</Label><Input id="scheduled-time" type="time" value={time} onChange={(event: ChangeEvent<HTMLInputElement>) => setTime(event.target.value)} className="h-10" /></div>
          </div>
          <div className="grid gap-2">
            <Label>Assigned Participants</Label>
            <div className="grid max-h-48 gap-2 overflow-y-auto rounded-xl border p-2">
              {request.teamMembers.length ? request.teamMembers.map((person) => (
                <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                  <input type="checkbox" checked={assigned.includes(person.id)} onChange={() => toggle(person.id)} className="size-4 rounded border-input accent-primary" />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{person.name}</span><span className="block truncate text-xs text-muted-foreground">{person.role ?? "Project team"}</span></span>
                </label>
              )) : <p className="px-2 py-4 text-sm text-muted-foreground">No assignable project participants were found.</p>}
            </div>
          </div>
          <div className="grid gap-2"><Label htmlFor="schedule-notes">Notes</Label><textarea id="schedule-notes" value={notes} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value)} maxLength={4000} rows={3} className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" /></div>
          {error ? <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="button" onClick={submit} disabled={pending || !date || !time}>{pending ? "Saving..." : "Schedule Visit"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function SiteVisitStatusActions({ request }: { request: SiteVisitListItem }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  if (!request.canManage || request.status === "completed" || request.status === "cancelled") return null

  function change(status: "completed" | "cancelled") {
    const prompt = status === "completed" ? "Mark this scheduled site visit as completed?" : "Cancel this site visit request?"
    if (!window.confirm(prompt)) return
    setError("")
    startTransition(async () => {
      const result = await updateSiteVisitStatusAction({ requestId: request.id, status })
      if (result.ok === false) return setError(result.error)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <ScheduleSiteVisitDialog request={request} />
        {request.status === "scheduled" ? <Button type="button" variant="outline" size="lg" onClick={() => change("completed")} disabled={pending}><CheckCircle2 className="size-4" />Mark Completed</Button> : null}
        <Button type="button" variant="destructive" size="lg" onClick={() => change("cancelled")} disabled={pending}><XCircle className="size-4" />Cancel</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
