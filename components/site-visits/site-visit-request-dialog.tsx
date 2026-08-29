"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent } from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, Check, ChevronDown, MapPinned, Search } from "lucide-react"
import { createSiteVisitRequestAction } from "@/lib/actions/site-visits"
import type { SiteVisitPreferredTime, SiteVisitProjectAccess } from "@/lib/site-visits/types"
import { localDateInputValue } from "@/lib/site-visits/format"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

function projectLabel(project: SiteVisitProjectAccess | null | undefined) {
  if (!project) return "Select project"
  const code = project.code?.trim()
  return code ? `${project.name} — ${code}` : project.name
}

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
  const [projectSearchQuery, setProjectSearchQuery] = useState("")
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const projectDropdownRef = useRef<HTMLDivElement>(null)

  const [preferredMode, setPreferredMode] = useState<"date" | "asap">("asap")
  const [preferredDate, setPreferredDate] = useState("")
  const [preferredTime, setPreferredTime] = useState<SiteVisitPreferredTime>("any_time")
  const [purpose, setPurpose] = useState("")
  const [notes, setNotes] = useState("")
  const [requestKey, setRequestKey] = useState(newRequestKey)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!projectMenuOpen) return

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setProjectMenuOpen(false)
        setProjectSearchQuery("")
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProjectMenuOpen(false)
        setProjectSearchQuery("")
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
    () => fixedProject ?? requestProjects.find((project) => project.id === projectId) ?? requestProjects[0] ?? null,
    [projectId, requestProjects, fixedProject],
  )

  const filteredProjects = useMemo(() => {
    const query = projectSearchQuery.trim().toLowerCase()
    if (!query) return requestProjects
    return requestProjects.filter((project) => {
      const matchName = project.name.toLowerCase().includes(query)
      const matchCode = project.code ? project.code.toLowerCase().includes(query) : false
      return matchName || matchCode
    })
  }, [projectSearchQuery, requestProjects])

  if (!requestProjects.length) return null

  function reset() {
    setProjectId(fixedProject?.id ?? requestProjects[0]?.id ?? "")
    setProjectSearchQuery("")
    setProjectMenuOpen(false)
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
    <Dialog open={open} onOpenChange={(next: boolean) => {
      setOpen(next)
      if (!next) {
        setError("")
        setProjectMenuOpen(false)
        setProjectSearchQuery("")
      }
    }}>
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
              <div className="flex min-h-10 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium">
                <MapPinned className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 break-words">{projectLabel(fixedProject)}</span>
              </div>
            ) : (
              <div className="relative" ref={projectDropdownRef}>
                <button
                  type="button"
                  disabled={pending || requestProjects.length === 0}
                  onClick={() => {
                    if (pending) return
                    setProjectMenuOpen((prev) => {
                      if (prev) setProjectSearchQuery("")
                      return !prev
                    })
                  }}
                  className="flex h-auto min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-left text-sm font-medium outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0 break-words leading-5">
                    {projectLabel(selectedProject)}
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", projectMenuOpen && "rotate-180")} />
                </button>

                {projectMenuOpen ? (
                  <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[280px] max-h-60 overflow-y-auto rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-lg">
                    <div className="sticky top-0 z-10 border-b border-border/60 bg-popover p-2 pb-1.5">
                      <div className="relative flex items-center">
                        <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          value={projectSearchQuery}
                          onChange={(e) => setProjectSearchQuery(e.target.value)}
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
                                setProjectId(project.id)
                                setProjectSearchQuery("")
                                setProjectMenuOpen(false)
                                setError("")
                              }}
                              className={cn(
                                "flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors outline-none",
                                isSelected
                                  ? "bg-primary text-primary-foreground font-medium"
                                  : "hover:bg-accent hover:text-accent-foreground text-foreground",
                              )}
                            >
                              <span className="min-w-0 break-words leading-5">
                                {projectLabel(project)}
                              </span>
                              {isSelected ? <Check className="size-4 shrink-0" /> : null}
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
