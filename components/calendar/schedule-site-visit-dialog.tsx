"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent } from "react"
import { Check, ChevronDown, MapPinned, Search, Trash2 } from "lucide-react"

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
import {
  approveCalendarClientVisitRequestAction,
  createDirectSiteVisitAction,
  updateScheduledSiteVisitAction,
  updateSiteVisitStatusAction,
} from "@/lib/actions/site-visits"
import type {
  CalendarClientRequestViewModel,
  CalendarEventViewModel,
  CalendarSchedulingProjectViewModel,
} from "@/lib/calendar/types"
import { localDateInputValue } from "@/lib/site-visits/format"
import { cn } from "@/lib/utils"

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

function normalizeTimeValue(value: string | null | undefined): string {
  if (!value) return ""
  const trimmed = value.trim()
  if (TIME_PATTERN.test(trimmed)) return trimmed
  const match = /^(\d{1,2}):(\d{2})/.exec(trimmed)
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`
  return ""
}

export function ScheduleSiteVisitDialog({
  open,
  onOpenChange,
  projects,
  initialDate,
  request = null,
  editVisit = null,
  onScheduled,
  onRefreshRequired,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: CalendarSchedulingProjectViewModel[]
  initialDate: string
  request?: CalendarClientRequestViewModel | null
  editVisit?: CalendarEventViewModel | null
  onScheduled: () => Promise<void> | void
  onRefreshRequired?: () => Promise<void> | void
}) {
  const isEditMode = Boolean(editVisit)
  const isRequestApproval = Boolean(request)
  const fixedProject = editVisit
    ? projects.find((project) => project.id === editVisit.projectId) ?? null
    : request
      ? projects.find((project) => project.id === request.projectId) ?? null
      : null

  const [projectId, setProjectId] = useState(editVisit?.projectId ?? request?.projectId ?? projects[0]?.id ?? "")
  const [projectSearch, setProjectSearch] = useState("")
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [date, setDate] = useState(editVisit?.date ?? request?.requestedDate ?? initialDate)
  const [time, setTime] = useState(normalizeTimeValue(editVisit?.timeLabel))
  const [notes, setNotes] = useState(editVisit?.notes ?? request?.notes ?? "")
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>(editVisit?.assignedUserIds ?? [])
  const [mobileNotesExpanded, setMobileNotesExpanded] = useState(Boolean(editVisit?.notes))
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [isMobileProjectSelect, setIsMobileProjectSelect] = useState(false)
  const projectDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!projectMenuOpen) return

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setProjectMenuOpen(false)
        setProjectSearch("")
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProjectMenuOpen(false)
        setProjectSearch("")
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("touchstart", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [projectMenuOpen])

  const selectedProject = useMemo(
    () => fixedProject ?? projects.find((project) => project.id === projectId) ?? projects[0] ?? null,
    [projectId, projects, fixedProject],
  )

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase()
    if (!query) return projects
    return projects.filter((project) => {
      const matchName = project.name.toLowerCase().includes(query)
      const matchCode = project.code ? project.code.toLowerCase().includes(query) : false
      return matchName || matchCode
    })
  }, [projectSearch, projects])

  useEffect(() => {
    if (!open) return
    const targetProjectId = editVisit?.projectId ?? request?.projectId ?? (
      projects.some((project) => project.id === projectId) ? projectId : projects[0]?.id ?? ""
    )
    setProjectId(targetProjectId)
    setProjectSearch("")
    setProjectMenuOpen(false)
    setDate(editVisit?.date ?? request?.requestedDate ?? initialDate)
    setTime(normalizeTimeValue(editVisit?.timeLabel))
    setNotes(editVisit?.notes ?? request?.notes ?? "")
    setAssignedUserIds(editVisit?.assignedUserIds ?? [])
    setMobileNotesExpanded(Boolean(editVisit?.notes))
    setConfirmCancelOpen(false)
    setError("")
  }, [open, initialDate, projects, request, editVisit])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)")
    const syncViewport = () => setIsMobileProjectSelect(mediaQuery.matches)

    syncViewport()
    mediaQuery.addEventListener("change", syncViewport)
    return () => mediaQuery.removeEventListener("change", syncViewport)
  }, [])

  function changeProject(value: unknown) {
    if (isEditMode || request) return
    setProjectId(String(value))
    setProjectSearch("")
    setProjectMenuOpen(false)
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
      let result
      if (isEditMode && editVisit) {
        result = await updateScheduledSiteVisitAction({
          requestId: editVisit.id,
          scheduledDate: date,
          scheduledTime: time,
          notes,
          assignedUserIds: submittedAssignedUserIds,
        })
      } else if (isRequestApproval && request) {
        result = await approveCalendarClientVisitRequestAction({
          requestId: request.id,
          scheduledDate: date,
          scheduledTime: time,
          notes,
          assignedUserIds: submittedAssignedUserIds,
        })
      } else {
        result = await createDirectSiteVisitAction({
          projectId,
          scheduledDate: date,
          scheduledTime: time,
          notes,
          assignedUserIds: submittedAssignedUserIds,
        })
      }

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

  function handleCancelVisit() {
    if (!editVisit || pending) return
    setError("")
    startTransition(async () => {
      const result = await updateSiteVisitStatusAction({
        requestId: editVisit.id,
        status: "cancelled",
      })
      if (result.ok === false) {
        setError(result.error)
        setConfirmCancelOpen(false)
        return
      }
      await onScheduled()
      setConfirmCancelOpen(false)
      onOpenChange(false)
    })
  }

  const projectIsFixed = isEditMode || isRequestApproval || projects.length === 1
  const showRequestedDateWarning = Boolean(
    request?.requestedDate && DATE_PATTERN.test(date) && date !== request.requestedDate,
  )

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => {
      if (pending) return
      onOpenChange(nextOpen)
      if (!nextOpen) {
        setError("")
        setConfirmCancelOpen(false)
      }
    }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg max-sm:w-[calc(100vw-1rem)] max-sm:max-w-none max-sm:max-h-[calc(100dvh-1rem)] max-sm:gap-2.5 max-sm:p-4">
        <DialogHeader className="max-sm:-mx-4 max-sm:gap-0.5 max-sm:border-b max-sm:border-border/70 max-sm:px-4 max-sm:pb-3">
          <DialogTitle>
            {isEditMode ? "Edit Site Visit" : "Schedule Site Visit"}
          </DialogTitle>
          <DialogDescription className="max-sm:hidden">
            {isEditMode
              ? "Update visit schedule and details for this site visit."
              : isRequestApproval
                ? "Confirm the schedule for this Client Visit Request."
                : "Schedule a direct Site Visit for an authorized project."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-4 max-sm:gap-3.5 max-sm:pb-14">
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
              <div className="relative" ref={projectDropdownRef}>
                <button
                  type="button"
                  disabled={pending || projects.length === 0}
                  onClick={() => {
                    if (pending) return
                    setProjectMenuOpen((open) => {
                      if (open) setProjectSearch("")
                      return !open
                    })
                  }}
                  className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 max-sm:min-h-10 text-left"
                >
                  <span className="truncate">{selectedProject?.name ?? "Select project"}</span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", projectMenuOpen && "rotate-180")} />
                </button>

                {projectMenuOpen ? (
                  <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[280px] max-h-60 overflow-y-auto rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-lg">
                    <div className="sticky top-0 z-10 bg-popover p-2 pb-1.5 border-b border-border/60">
                      <div className="relative flex items-center">
                        <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          placeholder="Search projects..."
                          autoFocus
                          className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                    </div>

                    <div className="p-1 space-y-0.5">
                      {filteredProjects.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                          No projects found
                        </div>
                      ) : (
                        filteredProjects.map((project) => {
                          const isSelected = project.id === selectedProject?.id
                          return (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => {
                                changeProject(project.id)
                              }}
                              className={cn(
                                "flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm text-left transition-colors outline-none",
                                isSelected
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "hover:bg-accent hover:text-accent-foreground text-foreground",
                              )}
                            >
                              <span className="truncate">{project.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                {project.code ? (
                                  <span
                                    className={cn(
                                      "text-xs font-mono",
                                      isSelected ? "text-primary-foreground/90" : "text-muted-foreground",
                                    )}
                                  >
                                    {project.code}
                                  </span>
                                ) : null}
                                {isSelected ? <Check className="size-4 shrink-0" /> : null}
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
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
              <Input
                id="calendar-visit-date"
                type="date"
                dir="ltr"
                lang="en-US"
                min={localDateInputValue()}
                value={date}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setDate(event.target.value)}
                disabled={pending}
                className="h-10 [direction:ltr] [text-align:start]"
              />
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
              <Input
                id="calendar-visit-time"
                type="time"
                dir="ltr"
                lang="en-US"
                value={time}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setTime(event.target.value)}
                disabled={pending}
                className="h-10 [direction:ltr] [text-align:start]"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Supervisor</Label>
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
              <p className="truncate text-sm font-medium text-foreground">{selectedProject?.supervisor?.name ?? "Assigned Project Supervisor"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Project Supervisor</p>
            </div>
          </div>

          <div className="grid gap-2 max-sm:hidden">
            <Label>Participants</Label>
            <div className="grid max-h-48 min-w-0 gap-1 overflow-y-auto rounded-xl border p-2 max-sm:max-h-40">
              {selectedProject?.participants?.length ? selectedProject.participants.map((person) => (
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
              <div className="grid gap-1.5 pb-1">
                <Label htmlFor="calendar-mobile-visit-notes">Notes</Label>
                <textarea id="calendar-mobile-visit-notes" value={notes} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value)} maxLength={4000} rows={2} disabled={pending} placeholder="Optional notes..." className="h-16 min-h-16 max-h-16 w-full resize-none overflow-y-auto rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" />
              </div>
            ) : (
              <button type="button" onClick={() => setMobileNotesExpanded(true)} disabled={pending} className="inline-flex min-h-8 w-fit items-center rounded-md px-0.5 text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                + Add note
              </button>
            )}
          </div>

          {error ? <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-4 max-sm:px-4 max-sm:bg-background/95 max-sm:pt-2.5 max-sm:pb-[calc(0.5rem+env(safe-area-inset-bottom))] max-sm:backdrop-blur-sm max-sm:border-t max-sm:border-border/60">
          {confirmCancelOpen ? (
            <div className="flex w-full flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs">
              <p className="font-semibold text-destructive">
                Are you sure you want to cancel this site visit?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmCancelOpen(false)}
                  disabled={pending}
                  className="h-8 text-xs font-medium"
                >
                  Keep Visit
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelVisit}
                  disabled={pending}
                  className="h-8 text-xs font-medium"
                >
                  {pending ? "Cancelling..." : "Yes, Cancel Visit"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex w-full min-w-0 items-center justify-between gap-2 max-sm:grid max-sm:grid-cols-2">
              {isEditMode ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmCancelOpen(true)}
                  disabled={pending}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive max-sm:order-3 max-sm:col-span-2"
                >
                  <Trash2 className="size-4 me-1.5" />
                  Cancel Visit
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
              <Button type="button" onClick={submit} disabled={pending || !projectId || !date || !time}>
                {pending ? (
                  isEditMode ? "Saving..." : "Scheduling..."
                ) : isEditMode ? (
                  "Save Changes"
                ) : isRequestApproval ? (
                  <>
                    <span className="sm:hidden">Schedule Visit</span>
                    <span className="max-sm:hidden">Approve and Schedule</span>
                  </>
                ) : (
                  "Schedule Visit"
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
