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

type StageFilter = "all" | "reported" | "no-reports"

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
  const [linkedSiteVisitId, setLinkedSiteVisitId] = useState<string | null>(linkedSiteVisit?.id ?? null)
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)
  const [changeProjectOpen, setChangeProjectOpen] = useState(false)
  const [filter, setFilter] = useState<StageFilter>("all")
  const stageListRef = useRef<HTMLDivElement>(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const contextualLatestReport = selectedProject?.latestReport ?? null
  const latestReportContextLabel = "Latest Project Report"

  const reportedCount = useMemo(
    () => selectedProject?.stages.filter((stage) => stage.reportsCount > 0).length ?? 0,
    [selectedProject],
  )

  const visibleStages = useMemo(() => {
    if (!selectedProject) return []
    if (filter === "reported") return selectedProject.stages.filter((s) => s.reportsCount > 0)
    if (filter === "no-reports") return selectedProject.stages.filter((s) => s.reportsCount === 0)
    return selectedProject.stages
  }, [selectedProject, filter])

  const applyProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId)
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
      ) : !selectedProject ? (
        /* State 1: No project selected - original dropdown & title */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Report Entry</h1>
            {linkedSiteVisitId ? <Badge variant="secondary">Linked to scheduled visit</Badge> : null}
          </div>

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

          <Card size="sm">
            <CardContent className="flex min-h-44 flex-col items-center justify-center px-5 py-7 text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-5" aria-hidden="true" />
              </div>
              <h2 className="font-semibold text-foreground">Select a project</h2>
              <p className="mt-1 text-sm text-muted-foreground">Project details, the latest report, and ordered stages will appear here.</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* State 2: Project selected - MemberProjectStagesMobile design */
        <div className="space-y-3 pb-1">
          {/* Top project dropdown selector */}
          <div className="space-y-1">
            <SearchableProjectSelect
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={handleProjectChange}
            />
          </div>

          {/* 1. Stages title & count badge outside card */}
          <div className="flex items-center justify-between gap-3 px-0.5 pt-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Stages</h1>
              {linkedSiteVisitId ? <Badge variant="secondary" className="text-xs">Linked visit</Badge> : null}
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {selectedProject.stages.length} {selectedProject.stages.length === 1 ? "Stage" : "Stages"}
            </span>
          </div>

          {/* 2. Compact Project Card with cover image / building icon on left */}
          <section className="overflow-hidden rounded-xl border border-border bg-card p-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40 text-primary">
                {selectedProject.imageUrl ? (
                  <img src={selectedProject.imageUrl} alt={selectedProject.name} className="size-full object-cover" />
                ) : (
                  <Building2 className="size-6 text-primary" aria-hidden="true" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate text-sm font-bold leading-tight text-foreground">{selectedProject.name}</h2>
                  {selectedProject.status ? <Badge variant="secondary" className="shrink-0 text-[10px]">{selectedProject.status}</Badge> : null}
                </div>
                {selectedProject.code ? (
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{selectedProject.code}</p>
                ) : null}
                <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                  {reportedCount} Reported <span aria-hidden="true">·</span> {selectedProject.stages.length - reportedCount} No Reports
                </p>
              </div>
            </div>

            {/* Latest report preview if available */}
            {contextualLatestReport ? (
              <div className="mt-2.5 border-t border-border/60 pt-2">
                <Link
                  href={`/projects/${selectedProject.id}/stages/${contextualLatestReport.stageId}/reports/${contextualLatestReport.id}`}
                  className="group flex items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                      <FileText className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate">{latestReportContextLabel}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[12px] font-semibold text-foreground group-hover:text-primary">
                      {contextualLatestReport.reportTitle}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            ) : null}
          </section>

          {/* 3. Filter tabs and stage list */}
          {selectedProject.stages.length ? (
            <>
              <div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-muted/20 p-0.5" aria-label="Filter stages by report history">
                {(
                  [
                    ["all", "All"],
                    ["reported", "Reported"],
                    ["no-reports", "No Reports"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                    className={cn(
                      "min-w-0 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
                      filter === value ? "bg-background text-primary shadow-xs" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border bg-card shadow-2xs">
                {visibleStages.length ? (
                  <div className="divide-y divide-border/70" ref={stageListRef}>
                    {visibleStages.map((stage, index) => {
                      const hasReports = stage.reportsCount > 0

                      return (
                        <div
                          key={stage.id}
                          className="flex items-center justify-between gap-2.5 px-3 py-2.5 text-left"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold tabular-nums text-primary">
                              {stageNumber(index)}
                            </div>

                            <div className="min-w-0 self-center">
                              <p className="line-clamp-2 text-[13px] font-semibold leading-[1.15rem] text-foreground">
                                {stageDisplayName(stage.name)}
                              </p>

                              {hasReports ? (
                                <div className="mt-1 space-y-1">
                                  <p className="text-[11px] font-medium leading-none text-muted-foreground">
                                    {stage.reportsCount} {stage.reportsCount === 1 ? "Report" : "Reports"} · {stage.checkedChecklistItems}/{stage.totalChecklistItems} · {stage.progressPercentage}%
                                  </p>
                                  <div className="h-1 w-full max-w-[130px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                    <div
                                      className="h-full rounded-full bg-primary transition-all duration-300"
                                      style={{ width: `${stage.progressPercentage}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">No reports yet</p>
                              )}
                            </div>
                          </div>

                          {/* Right Action buttons: Eye icon if reports exist + '+ Report' button */}
                          <div className="flex shrink-0 items-center gap-1.5">
                            {hasReports ? (
                              <Link
                                href={`/projects/${selectedProject.id}/stages/${stage.id}`}
                                aria-label={`View stage reports for ${stageDisplayName(stage.name)}`}
                                title="View reports"
                                className={cn(
                                  buttonVariants({ variant: "outline", size: "sm" }),
                                  "size-8 shrink-0 rounded-lg p-0 text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                              >
                                <Eye className="size-4" aria-hidden="true" />
                              </Link>
                            ) : null}

                            <form action={startReportEntryAction}>
                              <input type="hidden" name="projectId" value={selectedProject.id} />
                              <input type="hidden" name="stageId" value={stage.id} />
                              {linkedSiteVisitId ? <input type="hidden" name="siteVisitId" value={linkedSiteVisitId} /> : null}
                              <Button
                                type="submit"
                                size="sm"
                                className="h-8 gap-1 rounded-lg px-2.5 text-xs font-semibold"
                              >
                                <Plus className="size-3.5" aria-hidden="true" />
                                Report
                              </Button>
                            </form>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No stages match this filter.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No reportable stages are available for this project.
            </div>
          )}
        </div>
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
