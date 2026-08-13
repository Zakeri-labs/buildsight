"use client"

import Link from "next/link"
import { ArrowRight, Building2, Check, ChevronRight, ChevronsUpDown, ClipboardList, FileText, ImageIcon, MapPin, Search, X } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { ReportEntryProject, ReportEntrySiteVisitContext } from "@/lib/report-entry/server"
import { startReportEntryAction } from "@/lib/report-entry/actions"
import { cn } from "@/lib/utils"

function stageNumber(index: number) {
  return String(index + 1).padStart(2, "0")
}

function stageDisplayName(name: string) {
  return name.replace(/^\s*\d+\.\s*/, "")
}

function formatReportCount(count: number) {
  return `${count} ${count === 1 ? "Report" : "Reports"}`
}

function SearchableProjectSelect({
  projects,
  selectedProjectId,
  onSelectProject,
}: {
  projects: ReportEntryProject[]
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  )

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects
    const q = searchQuery.trim().toLowerCase()
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)),
    )
  }, [projects, searchQuery])

  const handleSelect = (id: string) => {
    onSelectProject(id)
    setOpen(false)
    setSearchQuery("")
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3.5 text-sm font-medium text-foreground outline-none transition-all hover:bg-accent/40 focus:border-ring focus:ring-2 focus:ring-ring/20"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {selectedProject ? (
            <span className="truncate">
              <span className="font-semibold">{selectedProject.name}</span>
              {selectedProject.code ? (
                <span className="ms-1.5 font-mono text-xs text-muted-foreground">· {selectedProject.code}</span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">Search or select project... ({projects.length} available)</span>
          )}
        </div>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 rounded-2xl sm:max-w-lg">
          <DialogHeader className="border-b p-4 pb-3">
            <DialogTitle className="text-base font-bold">Select Project</DialogTitle>
            <DialogDescription className="text-xs">Search from {projects.length} supervised projects by name or code.</DialogDescription>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type project name or code..."
                className="h-10 w-full rounded-lg border border-input bg-muted/30 pl-9 pr-8 text-sm outline-none focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/60 p-1">
            {filteredProjects.length > 0 ? (
              filteredProjects.map((project) => {
                const isSelected = project.id === selectedProjectId
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handleSelect(project.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-foreground hover:bg-accent/60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{project.name}</div>
                      {project.code ? (
                        <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{project.code}</div>
                      ) : null}
                    </div>
                    {isSelected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                )
              })
            ) : (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No projects match &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
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

  const selectedStage = useMemo(
    () => selectedProject?.stages.find((stage) => stage.id === selectedStageId) ?? null,
    [selectedProject, selectedStageId],
  )

  const contextualLatestReport = selectedStage ? selectedStage.latestReport : selectedProject?.latestReport ?? null
  const latestReportContextLabel = selectedStage
    ? `Last Report of ${stageDisplayName(selectedStage.name)} Stage`
    : "Latest Project Report"

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
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Report Entry</h1>
        {linkedSiteVisitId ? <Badge variant="secondary">Linked to scheduled visit</Badge> : null}
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
            <label id="report-entry-project-label" className="text-sm font-semibold text-foreground">
              Project
            </label>
            <SearchableProjectSelect
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={handleProjectChange}
            />
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
                      <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-tight text-foreground">
                        <FileText className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                        <span className="min-w-0 truncate" title={latestReportContextLabel}>{latestReportContextLabel}</span>
                      </div>
                      {contextualLatestReport ? (
                        <Link
                          href={`/projects/${selectedProject.id}/stages/${contextualLatestReport.stageId}/reports/${contextualLatestReport.id}`}
                          className="group -mx-1 flex w-[calc(100%+0.5rem)] min-w-0 items-start gap-2 rounded-lg px-1 py-0.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40"
                          aria-label={`Open ${contextualLatestReport.reportTitle}`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold leading-snug text-foreground" title={contextualLatestReport.reportTitle}>
                              {contextualLatestReport.reportTitle}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.05rem] text-muted-foreground">
                              {contextualLatestReport.subject || "No subject provided"}
                            </p>
                          </div>
                          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </Link>
                      ) : (
                        <p className="text-xs leading-5 text-muted-foreground">
                          {selectedStage ? "No reports yet for this stage" : "No reports yet for this project"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              <section className="space-y-2.5" aria-labelledby="report-entry-stage-title">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 id="report-entry-stage-title" className="text-sm font-semibold text-foreground">Stage</h2>
                      <Badge variant="secondary" className="text-[11px] font-medium">
                        {selectedProject.stages.length} {selectedProject.stages.length === 1 ? "Stage" : "Stages"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Select the stage you want to report on (scroll to view all stages).</p>
                  </div>
                  <ClipboardList className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>

                {selectedProject.stages.length ? (
                  <div
                    ref={stageListRef}
                    className="max-h-[26rem] w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-border bg-card [scrollbar-gutter:stable] sm:max-h-[30rem]"
                    role="listbox"
                    aria-label="Project stages"
                  >
                    <div className="divide-y divide-border">
                      {selectedProject.stages.map((stage, index) => {
                        const selected = selectedStageId === stage.id
                        const reportsText = formatReportCount(stage.reportsCount ?? 0)
                        const metaText = `${reportsText} · ${stage.checkedChecklistItems ?? 0}/${stage.totalChecklistItems ?? 0} · ${stage.progressPercentage ?? 0}%`

                        return (
                          <button
                            key={stage.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => setSelectedStageId(stage.id)}
                            className={cn(
                              "flex min-h-[3.6rem] w-full items-start gap-3 px-3 py-2.5 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
                              selected
                                ? "bg-primary/10 text-foreground shadow-[inset_3px_0_0_0_var(--primary)]"
                                : "bg-card text-card-foreground hover:bg-muted/40",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                                selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                              )}
                            >
                              {stageNumber(index)}
                            </span>
                            <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                              <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{stageDisplayName(stage.name)}</span>
                              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                                <span className="text-xs font-medium text-muted-foreground">{metaText}</span>
                                <div className="h-1 w-full overflow-hidden rounded-full bg-muted/60">
                                  <div
                                    className="h-full bg-primary transition-all duration-300"
                                    style={{ width: `${Math.min(100, Math.max(0, stage.progressPercentage ?? 0))}%` }}
                                  />
                                </div>
                              </div>
                            </div>
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
