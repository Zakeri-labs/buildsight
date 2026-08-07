"use client"

import { ArrowRight, Building2, ClipboardList, FileText, ImageIcon, MapPin } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ReportEntryProject, ReportEntrySiteVisitContext } from "@/lib/report-entry/server"
import { startReportEntryAction } from "@/lib/report-entry/actions"
import { cn } from "@/lib/utils"

function reportDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function stageNumber(index: number) {
  return String(index + 1).padStart(2, "0")
}

export function ReportEntry({
  projects,
  errorCode,
  linkedSiteVisit,
}: {
  projects: ReportEntryProject[]
  errorCode?: string | null
  linkedSiteVisit?: ReportEntrySiteVisitContext | null
}) {
  const initialProjectId = linkedSiteVisit?.projectId ?? (projects.length === 1 ? projects[0]!.id : "")
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)
  const [selectedStageId, setSelectedStageId] = useState("")
  const [linkedSiteVisitId, setLinkedSiteVisitId] = useState<string | null>(linkedSiteVisit?.id ?? null)
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)
  const [changeProjectOpen, setChangeProjectOpen] = useState(false)
  const stageListRef = useRef<HTMLDivElement>(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const applyProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId)
    setSelectedStageId("")
    if (stageListRef.current) stageListRef.current.scrollTop = 0
  }

  const handleProjectChange = (projectId: string) => {
    if (projectId === selectedProjectId) return

    if (linkedSiteVisitId && linkedSiteVisit && projectId !== linkedSiteVisit.projectId) {
      setPendingProjectId(projectId)
      setChangeProjectOpen(true)
      return
    }

    applyProjectChange(projectId)
  }

  const confirmProjectChange = () => {
    if (pendingProjectId === null) return
    applyProjectChange(pendingProjectId)
    setLinkedSiteVisitId(null)
    setPendingProjectId(null)
    setChangeProjectOpen(false)
  }

  const handleProjectDialogOpenChange = (open: boolean) => {
    setChangeProjectOpen(open)
    if (!open) setPendingProjectId(null)
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 md:space-y-5">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Stage reporting</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Report Entry</h1>
          {linkedSiteVisitId ? <Badge variant="secondary">Linked to scheduled visit</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">Choose a supervised project and stage to open the existing report response workflow.</p>
      </div>

      {errorCode ? (
        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorCode === "unauthorized-project"
            ? "That project is not available in your Supervisor scope."
            : errorCode === "invalid-stage"
              ? "That stage is not available for the selected project."
              : errorCode === "invalid-visit"
                ? "That scheduled Site Visit is no longer available for reporting."
                : "Select a valid supervised project and stage."}
        </div>
      ) : null}

      {!projects.length ? (
        <Card size="sm">
          <CardContent className="flex min-h-48 flex-col items-center justify-center px-5 py-8 text-center">
            <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Building2 className="size-5" aria-hidden="true" />
            </div>
            <h2 className="font-semibold text-foreground">No supervised projects available</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Projects explicitly assigned to you as Supervisor will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-2" aria-labelledby="report-entry-project-label">
            <label id="report-entry-project-label" htmlFor="report-entry-project" className="text-sm font-semibold text-foreground">
              Project
            </label>
            <div className="relative">
              <select
                id="report-entry-project"
                value={selectedProjectId}
                onChange={(event) => handleProjectChange(event.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-10 text-sm font-medium text-foreground outline-none transition-shadow focus:border-ring focus:ring-3 focus:ring-ring/20"
              >
                {projects.length > 1 ? <option value="">Select project</option> : null}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code ? `${project.name} · ${project.code}` : project.name}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">⌄</span>
            </div>
          </section>

          {selectedProject ? (
            <>
              <Card className="py-0">
                <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-0 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <div className="relative min-h-40 overflow-hidden bg-muted sm:min-h-44">
                    {selectedProject.imageUrl ? (
                      <img src={selectedProject.imageUrl} alt={`${selectedProject.name} cover`} className="absolute inset-0 size-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
                        <ImageIcon className="size-6" aria-hidden="true" />
                        <span className="text-[11px]">No project image</span>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 space-y-3 p-3.5 sm:p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="min-w-0 flex-1 text-base font-bold leading-snug text-foreground">{selectedProject.name}</h2>
                        {selectedProject.status ? <Badge variant="secondary" className="max-w-full">{selectedProject.status}</Badge> : null}
                      </div>
                      {selectedProject.code ? (
                        <p className="mt-1 max-w-full break-words font-mono text-[11px] leading-[1.25] text-muted-foreground [overflow-wrap:anywhere]">
                          {selectedProject.code}
                        </p>
                      ) : null}
                      {selectedProject.location ? (
                        <div className="mt-2 flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 break-words">{selectedProject.location}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="border-t pt-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <FileText className="size-3.5 text-primary" aria-hidden="true" />
                        Last Report
                      </div>
                      {selectedProject.latestReport ? (
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{selectedProject.latestReport.stageName}</p>
                          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                            Visit No. {selectedProject.latestReport.visitNumber} · {reportDate(selectedProject.latestReport.createdAt)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No reports yet</p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              <section className="space-y-2.5" aria-labelledby="report-entry-stage-title">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 id="report-entry-stage-title" className="text-sm font-semibold text-foreground">Stage</h2>
                    <p className="text-xs text-muted-foreground">Select the stage you want to report on.</p>
                  </div>
                  <ClipboardList className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>

                {selectedProject.stages.length ? (
                  <div
                    ref={stageListRef}
                    className="max-h-[13rem] w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-border bg-card [scrollbar-gutter:stable]"
                    role="listbox"
                    aria-label="Project stages"
                  >
                    <div className="divide-y divide-border">
                      {selectedProject.stages.map((stage, index) => {
                        const selected = selectedStageId === stage.id
                        return (
                          <button
                            key={stage.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => setSelectedStageId(stage.id)}
                            className={cn(
                              "flex min-h-[3.2rem] w-full items-center gap-3 px-3 py-2 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
                              selected
                                ? "bg-primary/10 text-foreground shadow-[inset_3px_0_0_0_var(--primary)]"
                                : "bg-card text-card-foreground hover:bg-muted/40",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                                selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                              )}
                            >
                              {stageNumber(index)}
                            </span>
                            <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{stage.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    No reportable stages are available for this project.
                  </div>
                )}
              </section>

              <form action={startReportEntryAction} className="pt-1">
                <input type="hidden" name="projectId" value={selectedProject.id} />
                <input type="hidden" name="stageId" value={selectedStageId} />
                {linkedSiteVisitId ? <input type="hidden" name="siteVisitId" value={linkedSiteVisitId} /> : null}
                <Button type="submit" size="lg" disabled={!selectedStageId} className="h-11 w-full gap-2 text-sm font-semibold">
                  Start Report
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </form>
            </>
          ) : (
            <Card size="sm">
              <CardContent className="flex min-h-44 flex-col items-center justify-center px-5 py-7 text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="size-5" aria-hidden="true" />
                </div>
                <h2 className="font-semibold text-foreground">Select a project</h2>
                <p className="mt-1 text-sm text-muted-foreground">Project details, the latest report, and ordered stages will appear here.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={changeProjectOpen} onOpenChange={handleProjectDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change project?</DialogTitle>
            <DialogDescription>
              This Report Entry was opened from a scheduled Site Visit. If you change the project, the new report will no longer be linked to that visit and the original visit will remain incomplete.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleProjectDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmProjectChange}>
              Change Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
