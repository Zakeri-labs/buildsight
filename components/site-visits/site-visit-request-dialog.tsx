"use client"

import { useMemo, useState, useTransition, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, MapPinned } from "lucide-react"
import { createSiteVisitRequestAction } from "@/lib/actions/site-visits"
import type { SiteVisitPreferredTime, SiteVisitProjectAccess } from "@/lib/site-visits/types"
import { localDateInputValue } from "@/lib/site-visits/format"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function newRequestKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16)
    return (token === "x" ? value : (value & 0x3) | 0x8).toString(16)
  })
}

export function SiteVisitRequestDialog({
  projects,
  fixedProjectId,
  triggerLabel = "Request New Visit",
  triggerVariant = "default",
}: {
  projects: SiteVisitProjectAccess[]
  fixedProjectId?: string
  triggerLabel?: string
  triggerVariant?: "default" | "outline"
}) {
  const router = useRouter()
  const requestProjects = useMemo(() => projects.filter((project) => project.canRequest), [projects])
  const fixedProject = fixedProjectId ? requestProjects.find((project) => project.id === fixedProjectId) : null
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState(fixedProject?.id ?? requestProjects[0]?.id ?? "")
  const [preferredMode, setPreferredMode] = useState<"date" | "asap">("asap")
  const [preferredDate, setPreferredDate] = useState("")
  const [preferredTime, setPreferredTime] = useState<SiteVisitPreferredTime>("any_time")
  const [purpose, setPurpose] = useState("")
  const [notes, setNotes] = useState("")
  const [requestKey, setRequestKey] = useState(newRequestKey)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  if (!requestProjects.length) return null

  function reset() {
    setProjectId(fixedProject?.id ?? requestProjects[0]?.id ?? "")
    setPreferredMode("asap")
    setPreferredDate("")
    setPreferredTime("any_time")
    setPurpose("")
    setNotes("")
    setRequestKey(newRequestKey())
    setError("")
  }

  function submit() {
    setError("")
    startTransition(async () => {
      const result = await createSiteVisitRequestAction({
        projectId,
        clientRequestId: requestKey,
        preferredMode,
        preferredDate,
        preferredTime,
        purpose,
        notes,
      })
      if (result.ok === false) {
        setError(result.error)
        return
      }
      setOpen(false)
      reset()
      router.push(`/site-visits/${result.requestId}?project=${encodeURIComponent(projectId)}`)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { setOpen(next); if (!next) setError("") }}>
      <DialogTrigger render={<Button type="button" variant={triggerVariant} size="lg" />}>
        <CalendarPlus className="size-4" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Site Visit</DialogTitle>
          <DialogDescription>Send a simple visit request to the authorized project team.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Project</Label>
            {fixedProject ? (
              <div className="flex h-10 items-center gap-2 rounded-lg border bg-muted/30 px-3 text-sm font-medium"><MapPinned className="size-4 text-primary" />{fixedProject.name}</div>
            ) : (
              <Select value={projectId} onValueChange={(value: unknown) => setProjectId(String(value))}>
                <SelectTrigger className="h-10 w-full"><SelectValue>{() => requestProjects.find((project) => project.id === projectId)?.name ?? "Select project"}</SelectValue></SelectTrigger>
                <SelectContent>{requestProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Preferred Visit</Label>
            <Select value={preferredMode} onValueChange={(value: unknown) => setPreferredMode(String(value) as "date" | "asap")}>
              <SelectTrigger className="h-10 w-full"><SelectValue>{(value: unknown) => String(value) === "date" ? "Select Date" : "ASAP"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="date">Select Date</SelectItem><SelectItem value="asap">ASAP</SelectItem></SelectContent>
            </Select>
          </div>

          {preferredMode === "date" ? (
            <div className="grid gap-2"><Label htmlFor="site-visit-date">Preferred Date</Label><Input id="site-visit-date" type="date" value={preferredDate} min={localDateInputValue()} onChange={(event: ChangeEvent<HTMLInputElement>) => setPreferredDate(event.target.value)} className="h-10" /></div>
          ) : null}

          <div className="grid gap-2">
            <Label>Preferred Time</Label>
            <Select value={preferredTime} onValueChange={(value: unknown) => setPreferredTime(String(value) as SiteVisitPreferredTime)}>
              <SelectTrigger className="h-10 w-full"><SelectValue>{(value: unknown) => String(value) === "morning" ? "Morning" : String(value) === "afternoon" ? "Afternoon" : "Any Time"}</SelectValue></SelectTrigger>
              <SelectContent><SelectItem value="morning">Morning</SelectItem><SelectItem value="afternoon">Afternoon</SelectItem><SelectItem value="any_time">Any Time</SelectItem></SelectContent>
            </Select>
          </div>

          <div className="grid gap-2"><Label htmlFor="site-visit-purpose">Purpose of Visit</Label><textarea id="site-visit-purpose" value={purpose} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setPurpose(event.target.value)} maxLength={2000} rows={4} placeholder="Describe why the site visit is needed" className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" /></div>
          <div className="grid gap-2"><Label htmlFor="site-visit-notes">Additional Notes</Label><textarea id="site-visit-notes" value={notes} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value)} maxLength={4000} rows={3} placeholder="Optional notes" className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" /></div>
          {error ? <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending || !projectId || !purpose.trim() || (preferredMode === "date" && !preferredDate)}>{pending ? "Submitting..." : "Request Site Visit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
