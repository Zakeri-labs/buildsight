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
import {
  approveCalendarClientVisitRequestAction,
  createDirectSiteVisitAction,
} from "@/lib/actions/site-visits"
import type {
  CalendarClientRequestViewModel,
  CalendarSchedulingProjectViewModel,
} from "@/lib/calendar/types"
import { localDateInputValue } from "@/lib/site-visits/format"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function displayRequestedDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

export function ScheduleSiteVisitDialog({
  open,
  onOpenChange,
  projects,
  initialDate,
  request = null,
  onScheduled,
  onRefreshRequired,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: CalendarSchedulingProjectViewModel[]
  initialDate: string
  request?: CalendarClientRequestViewModel | null
  onScheduled: () => Promise<void> | void
  onRefreshRequired?: () => Promise<void> | void
}) {
  const requestProject = request ? projects.find((project) => project.id === request.projectId) ?? null : null
  const [projectId, setProjectId] = useState(request?.projectId ?? projects[0]?.id ?? "")
  const [date, setDate] = useState(request?.requestedDate ?? initialDate)
  const [time, setTime] = useState("")
  const [notes, setNotes] = useState(request?.notes ?? "")
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([])
  const [mobileNotesExpanded, setMobileNotesExpanded] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [isMobileProjectSelect, setIsMobileProjectSelect] = useState(false)

  const selectedProject = useMemo(
    () => requestProject ?? projects.find((project) => project.id === projectId) ?? projects[0] ?? null,
    [projectId, projects, requestProject],
  )

  useEffect(() => {
    if (!open) return
    setProjectId((current) => request?.projectId ?? (
      projects.some((project) => project.id === current) ? current : projects[0]?.id ?? ""
    ))
    setDate(request?.requestedDate ?? initialDate)
    setTime("")
    setNotes(request?.notes ?? "")
    setAssignedUserIds([])
    setMobileNotesExpanded(false)
    setError("")
  }, [open, initialDate, projects, request])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)")
    const syncViewport = () => setIsMobileProjectSelect(mediaQuery.matches)

    syncViewport()
    mediaQuery.addEventListener("change", syncViewport)
    return () => mediaQuery.removeEventListener("change", syncViewport)
  }, [])

  function changeProject(value: unknown) {
    if (request) return
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
    if (request && selectedProject.id !== request.projectId) {
      setError("The Client Visit Request project could not be validated.")
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
    const isMobileScheduling = window.matchMedia("(max-width: 639px)").matches
    const submittedAssignedUserIds = isMobileScheduling ? [] : assignedUserIds
    const validParticipantIds = new Set(selectedProject.participants.map((participant) => participant.id))
    if (submittedAssignedUserIds.some((id) => !UUID_PATTERN.test(id) || !validParticipantIds.has(id))) {
      setError("One or more selected participants are invalid.")
      return
    }

    setError("")
    startTransition(async () => {
      const result = request
        ? await approveCalendarClientVisitRequestAction({
            requestId: request.id,
            scheduledDate: date,
            scheduledTime: time,
            notes,
            assignedUserIds: submittedAssignedUserIds,
          })
        : await createDirectSiteVisitAction({
            projectId,
            scheduledDate: date,
            scheduledTime: time,
            notes,
            assignedUserIds: submittedAssignedUserIds,
          })

      if (result.ok === false) {
        setError(result.error)
        if (request && result.error === "This request has already been processed.") {
          await onRefreshRequired?.()
        }
        return
      }
      await onScheduled()
      onOpenChange(false)
    })
  }

  const isRequestApproval = Boolean(request)
  const projectIsFixed = isRequestApproval || projects.length === 1
  const showRequestedDateWarning = Boolean(
    request?.requestedDate && DATE_PATTERN.test(date) && date !== request.requestedDate,
  )

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => {
      if (pending) return
      onOpenChange(nextOpen)
      if (!nextOpen) setError("")
    }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg max-sm:w-[calc(100vw-1rem)] max-sm:max-w-none max-sm:max-h-[calc(100dvh-1rem)] max-sm:gap-2.5 max-sm:p-4">
        <DialogHeader className="max-sm:-mx-4 max-sm:gap-0.5 max-sm:border-b max-sm:border-border/70 max-sm:px-4 max-sm:pb-3">
          <DialogTitle>Schedule Site Visit</DialogTitle>
          <DialogDescription className="max-sm:hidden">
            {isRequestApproval
              ? "Confirm the schedule for this Client Visit Request. The client's requested values remain unchanged."
              : "Schedule a direct Site Visit for an authorized project."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-4 max-sm:gap-3.5">
          <div className="grid gap-2">
            <Label>Project</Label>
            {projectIsFixed && selectedProject ? (
              <>
                <div className="flex h-10 items-center gap-2 rounded-lg border bg-muted/30 px-3 text-sm font-medium max-sm:hidden">
                  <MapPinned className="size-4 text-primary" aria-hidden="true" />
                  <span className="truncate">{selectedProject.name}</span>
                </div>
                <div className="hidden h-10 min-w-0 items-center rounded-lg border bg-muted/30 px-3 text-sm font-medium max-sm:flex">
                  <span className="truncate">{selectedProject.name}</span>
                </div>
              </>
            ) : (
              <Select value={projectId || null} onValueChange={changeProject} disabled={pending}>
                <SelectTrigger className="h-10 w-full min-w-0 overflow-hidden max-sm:min-h-10">
                  <SelectValue placeholder="Select project">{() => selectedProject?.name ?? "Select project"}</SelectValue>
                </SelectTrigger>
                <SelectContent
                  align={isMobileProjectSelect ? "start" : "center"}
                  alignItemWithTrigger={!isMobileProjectSelect}
                  className="max-sm:!w-[var(--anchor-width)] max-sm:!min-w-0 max-sm:max-w-[calc(100vw-2rem)] max-sm:max-h-[min(18rem,var(--available-height))]"
                >
                  {projects.map((project) => (
                    <SelectItem
                      key={project.id}
                      value={project.id}
                      className="max-sm:items-start max-sm:py-2 max-sm:[&>span:first-child]:min-w-0 max-sm:[&>span:first-child]:shrink max-sm:[&>span:first-child]:whitespace-normal max-sm:[&>span:first-child]:break-words max-sm:[&>span:first-child]:leading-5"
                    >
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {request ? (
            <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground max-sm:hidden">
              Requested: {request.isAsap || !request.requestedDate ? "ASAP" : request.requestedDate} · {request.preferredTimeLabel}
            </div>
          ) : null}

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4 max-sm:gap-3.5">
            <div className="grid gap-2">
              <Label htmlFor="calendar-visit-date">Visit Date</Label>
              <Input id="calendar-visit-date" type="date" min={localDateInputValue()} value={date} onChange={(event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value)} disabled={pending} className="h-10" />
              {showRequestedDateWarning && request?.requestedDate ? (
                <p className="hidden items-center gap-1 text-xs font-medium text-amber-700 max-sm:flex dark:text-amber-400">
                  <span aria-hidden="true">⚠</span>
                  <span>Requested date: {displayRequestedDate(request.requestedDate)}</span>
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <Label htmlFor="calendar-visit-time">Start Time</Label>
                {request ? (
                  <span className="hidden min-w-0 truncate text-xs text-muted-foreground max-sm:block">
                    Requested: {request.preferredTimeLabel}
                  </span>
                ) : null}
              </div>
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

          <div className="grid gap-2 max-sm:hidden">
            <Label>Participants</Label>
            <div className="grid max-h-48 min-w-0 gap-1 overflow-y-auto rounded-xl border p-2 max-sm:max-h-40">
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

          <div className="grid gap-2 max-sm:hidden">
            <Label htmlFor="calendar-visit-notes">Notes</Label>
            <textarea id="calendar-visit-notes" value={notes} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value)} maxLength={4000} rows={3} disabled={pending} placeholder="Optional notes" className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" />
          </div>
          <div className="sm:hidden">
            {mobileNotesExpanded ? (
              <div className="grid gap-1.5">
                <Label htmlFor="calendar-mobile-visit-notes">Notes</Label>
                <textarea id="calendar-mobile-visit-notes" value={notes} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value)} maxLength={4000} rows={3} disabled={pending} placeholder="Optional notes..." className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" />
              </div>
            ) : (
              <button type="button" onClick={() => setMobileNotesExpanded(true)} disabled={pending} className="inline-flex min-h-8 w-fit items-center rounded-md px-0.5 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                + Add note
              </button>
            )}
          </div>

          {error ? <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2 max-sm:bg-background/95 max-sm:pt-3 max-sm:pb-[calc(0.5rem+env(safe-area-inset-bottom))] max-sm:backdrop-blur-sm">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending || !projectId || !date || !time}>
            {pending ? (
              "Scheduling..."
            ) : isRequestApproval ? (
              <>
                <span className="sm:hidden">Schedule Visit</span>
                <span className="max-sm:hidden">Approve and Schedule</span>
              </>
            ) : (
              "Schedule Visit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
