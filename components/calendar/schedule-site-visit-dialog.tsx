"use client"

import { useEffect, useMemo, useState, useTransition, type ChangeEvent } from "react"
import { MapPinned } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createDirectSiteVisitAction } from "@/lib/actions/site-visits"
import type { CalendarSchedulingProjectViewModel } from "@/lib/calendar/types"
import { localDateInputValue } from "@/lib/site-visits/format"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function ScheduleSiteVisitDialog({
  open,
  onOpenChange,
  projects,
  initialDate,
  onScheduled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: CalendarSchedulingProjectViewModel[]
  initialDate: string
  onScheduled: () => Promise<void> | void
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "")
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState("")
  const [notes, setNotes] = useState("")
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([])
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? projects[0] ?? null,
    [projectId, projects],
  )

  useEffect(() => {
    if (!open) return
    setProjectId((current) => projects.some((project) => project.id === current) ? current : projects[0]?.id ?? "")
    setDate(initialDate)
    setTime("")
    setNotes("")
    setAssignedUserIds([])
    setError("")
  }, [open, initialDate, projects])

  function changeProject(value: unknown) {
    setProjectId(String(value))
    setAssignedUserIds([])
    setError("")
  }

  function toggleParticipant(userId: string) {
    setAssignedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    )
  }

  function submit() {
    if (pending) return
    if (!selectedProject || !UUID_PATTERN.test(projectId)) {
      setError("Select a valid project.")
      return
    }
    if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) {
      setError("Select a valid visit date and time.")
      return
    }
    if (date < localDateInputValue()) {
      setError("Visit date cannot be in the past.")
      return
    }
    const validParticipantIds = new Set(selectedProject.participants.map((participant) => participant.id))
    if (assignedUserIds.some((id) => !UUID_PATTERN.test(id) || !validParticipantIds.has(id))) {
      setError("One or more selected participants are invalid.")
      return
    }

    setError("")
    startTransition(async () => {
      const result = await createDirectSiteVisitAction({
        projectId,
        scheduledDate: date,
        scheduledTime: time,
        notes,
        assignedUserIds,
      })
      if (result.ok === false) {
        setError(result.error)
        return
      }
      await onScheduled()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => {
      if (pending) return
      onOpenChange(nextOpen)
      if (!nextOpen) setError("")
    }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Site Visit</DialogTitle>
          <DialogDescription>Schedule a direct Site Visit for an authorized project.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Project</Label>
            {projects.length === 1 && selectedProject ? (
              <div className="flex h-10 items-center gap-2 rounded-lg border bg-muted/30 px-3 text-sm font-medium">
                <MapPinned className="size-4 text-primary" aria-hidden="true" />
                <span className="truncate">{selectedProject.name}</span>
              </div>
            ) : (
              <Select value={projectId || null} onValueChange={changeProject} disabled={pending}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Select project">{() => selectedProject?.name ?? "Select project"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="calendar-visit-date">Visit Date</Label>
              <Input id="calendar-visit-date" type="date" min={localDateInputValue()} value={date} onChange={(event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value)} disabled={pending} className="h-10" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calendar-visit-time">Start Time</Label>
              <Input id="calendar-visit-time" type="time" value={time} onChange={(event: ChangeEvent<HTMLInputElement>) => setTime(event.target.value)} disabled={pending} className="h-10" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Supervisor</Label>
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
              <p className="truncate text-sm font-medium text-foreground">{selectedProject?.supervisor.name ?? "Assigned Project Supervisor"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Project Supervisor</p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Participants</Label>
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border p-2">
              {selectedProject?.participants.length ? selectedProject.participants.map((person) => (
                <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
                  <input type="checkbox" checked={assignedUserIds.includes(person.id)} onChange={() => toggleParticipant(person.id)} disabled={pending} className="size-4 rounded border-input accent-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{person.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{person.role ?? "Project participant"}</span>
                  </span>
                </label>
              )) : <p className="px-2 py-4 text-sm text-muted-foreground">No assignable project participants were found.</p>}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="calendar-visit-notes">Notes</Label>
            <textarea id="calendar-visit-notes" value={notes} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value)} maxLength={4000} rows={3} disabled={pending} placeholder="Optional notes" className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" />
          </div>

          {error ? <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending || !projectId || !date || !time}>{pending ? "Scheduling..." : "Schedule Visit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
