"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Layers3, Plus, Search } from "lucide-react"
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
import { createProjectStageAction, saveProjectStageSelectionAction } from "@/lib/actions/project-stages"
import type { ProjectStageSelectionOption, ProjectTermSelectionOption } from "@/lib/db/project-stages"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

type SelectionState = {
  stages: Set<string>
  terms: Set<string>
  subterms: Set<string>
  preCompletedStages: Set<string>
}

type DisabledItem = {
  id: string
  name: string
  kind: "Stage" | "Term" | "Sub-term"
  hasData: boolean
  hasPendingReview: boolean
}

function initialSelection(stages: ProjectStageSelectionOption[]): SelectionState {
  const hasConfiguredSelection = stages.some((stage) => stage.projectStageId && stage.active)
  const selectedStages = hasConfiguredSelection
    ? stages.filter((stage) => stage.active).map((stage) => stage.templateStageId)
    : stages.map((stage) => stage.templateStageId)

  const preCompleted = stages.filter((stage) => stage.isPreCompleted).map((stage) => stage.templateStageId)
  const selectedTerms = stages.flatMap((stage) => stage.terms).map((term) => term.templateTermId)
  const selectedSubterms = stages.flatMap((stage) => stage.terms).flatMap((term) => term.subterms).map((subterm) => subterm.templateTermId)

  return {
    stages: new Set(selectedStages),
    terms: new Set(selectedTerms),
    subterms: new Set(selectedSubterms),
    preCompletedStages: new Set(preCompleted),
  }
}

function cloneSelection(selection: SelectionState): SelectionState {
  return {
    stages: new Set(selection.stages),
    terms: new Set(selection.terms),
    subterms: new Set(selection.subterms),
    preCompletedStages: new Set(selection.preCompletedStages),
  }
}

function HierarchyCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  label: string
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
      className="size-4 shrink-0 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-45"
    />
  )
}

export function ManageProjectStagesButton({
  projectId,
  stages,
}: {
  projectId: string
  stages: ProjectStageSelectionOption[]
}) {
  const router = useRouter()
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selection, setSelection] = useState<SelectionState>(() => initialSelection(stages))
  const [warningItems, setWarningItems] = useState<DisabledItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Add Custom Stage state
  const [addStageOpen, setAddStageOpen] = useState(false)
  const [newStageName, setNewStageName] = useState("")
  const [newStageDesc, setNewStageDesc] = useState("")
  const [addStageError, setAddStageError] = useState<string | null>(null)
  const [addStagePending, startAddStageTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setSelection(initialSelection(stages))
    setSearch("")
    setWarningItems([])
    setError(null)
  }, [open, stages])

  const query = search.trim().toLowerCase()
  const filteredStages = useMemo(() => {
    if (!query) return stages
    return stages.filter((stage) =>
      `${stage.name} ${stage.description ?? ""}`.toLowerCase().includes(query),
    )
  }, [query, stages])

  const effectiveSelectedCount = useMemo(() => {
    return stages.filter((stage) => selection.stages.has(stage.templateStageId)).length
  }, [selection, stages])

  const totalItemCount = stages.length

  const setStage = (stage: ProjectStageSelectionOption) => {
    setSelection((current) => {
      const next = cloneSelection(current)
      const childTermIds = stage.terms.map((term) => term.templateTermId)
      const childSubtermIds = stage.terms.flatMap((term) => term.subterms.map((subterm) => subterm.templateTermId))

      if (current.stages.has(stage.templateStageId)) {
        next.stages.delete(stage.templateStageId)
        next.preCompletedStages.delete(stage.templateStageId)
        childTermIds.forEach((id) => next.terms.delete(id))
        childSubtermIds.forEach((id) => next.subterms.delete(id))
      } else {
        next.stages.add(stage.templateStageId)
        childTermIds.forEach((id) => next.terms.add(id))
        childSubtermIds.forEach((id) => next.subterms.add(id))
      }
      return next
    })
  }

  const togglePreCompleted = (stage: ProjectStageSelectionOption) => {
    setSelection((current) => {
      const next = cloneSelection(current)
      if (current.preCompletedStages.has(stage.templateStageId)) {
        next.preCompletedStages.delete(stage.templateStageId)
      } else {
        next.preCompletedStages.add(stage.templateStageId)
        next.stages.add(stage.templateStageId)
        const childTermIds = stage.terms.map((term) => term.templateTermId)
        const childSubtermIds = stage.terms.flatMap((term) => term.subterms.map((subterm) => subterm.templateTermId))
        childTermIds.forEach((id) => next.terms.add(id))
        childSubtermIds.forEach((id) => next.subterms.add(id))
      }
      return next
    })
  }

  const selectAll = () => {
    setSelection({
      stages: new Set(stages.map((stage) => stage.templateStageId)),
      terms: new Set(stages.flatMap((stage) => stage.terms).map((term) => term.templateTermId)),
      subterms: new Set(
        stages.flatMap((stage) => stage.terms).flatMap((term) => term.subterms).map((subterm) => subterm.templateTermId),
      ),
      preCompletedStages: new Set(),
    })
  }

  const collectWarnings = () => {
    const items: DisabledItem[] = []
    for (const stage of stages) {
      const stageNowDisabled = stage.active && !selection.stages.has(stage.templateStageId)
      if (stageNowDisabled && (stage.hasData || stage.hasPendingReview)) {
        items.push({
          id: stage.templateStageId,
          name: stage.name,
          kind: "Stage",
          hasData: stage.hasData,
          hasPendingReview: stage.hasPendingReview,
        })
      }
    }
    return items
  }

  const save = (skipWarning = false) => {
    const warnings = collectWarnings()
    if (warnings.length && !skipWarning) {
      setWarningItems(warnings)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await saveProjectStageSelectionAction({
        projectId,
        selectedTemplateStageIds: Array.from(selection.stages),
        selectedTemplateTermIds: Array.from(selection.terms),
        selectedTemplateSubtermIds: Array.from(selection.subterms),
        preCompletedStageIds: Array.from(selection.preCompletedStages),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  function handleCreateCustomStage() {
    if (!newStageName.trim()) {
      setAddStageError("Stage name is required.")
      return
    }
    setAddStageError(null)
    startAddStageTransition(async () => {
      const result = await createProjectStageAction({
        projectId,
        name: newStageName.trim(),
        description: newStageDesc.trim() || undefined,
      })
      if (!result.ok) {
        setAddStageError(result.error)
        return
      }
      setAddStageOpen(false)
      setNewStageName("")
      setNewStageDesc("")
      router.refresh()
    })
  }

  const hasPendingWarning = warningItems.some((item) => item.hasPendingReview)

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={() => setOpen(true)}>
        <Layers3 className="size-4" />
        Manage Project Stages
      </Button>

      {/* Add Custom Stage Dialog */}
      <Dialog open={addStageOpen} onOpenChange={setAddStageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom Stage</DialogTitle>
            <DialogDescription>
              Create a new stage specifically for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="project-stage-name">Stage Name</Label>
              <Input
                id="project-stage-name"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="e.g. Finishing Inspection"
                disabled={addStagePending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-stage-desc">Description (Optional)</Label>
              <Input
                id="project-stage-desc"
                value={newStageDesc}
                onChange={(e) => setNewStageDesc(e.target.value)}
                placeholder="Optional notes or scope of this stage"
                disabled={addStagePending}
              />
            </div>
            {addStageError ? <p className="text-sm text-destructive">{addStageError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddStageOpen(false)} disabled={addStagePending}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateCustomStage} disabled={addStagePending}>
              {addStagePending ? "Adding…" : "Add Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Project Stages Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <DialogTitle>Manage Project Stages</DialogTitle>
                <DialogDescription>
                  Choose which stages are active for this project. All stages are enabled by default. Uncheck stages to exclude them.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {warningItems.length ? (
            <div className="space-y-4 overflow-y-auto">
              <div
                className={cn(
                  "rounded-xl border p-4 text-sm",
                  hasPendingWarning
                    ? "border-destructive/35 bg-destructive/10 text-destructive"
                    : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100",
                )}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {hasPendingWarning ? "Pending review work exists." : "This configuration contains project data."}
                    </p>
                    <p className="mt-1 opacity-90">
                      Disabling these stages will hide them from new employee work, but existing responses, files, and review history will not be deleted.
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {warningItems.map((item) => (
                        <li key={`${item.kind}-${item.id}`} className="flex items-start justify-between gap-3 rounded-md bg-background/55 px-2.5 py-1.5">
                          <span className="min-w-0 truncate">{item.name}</span>
                          <span className="shrink-0 text-xs font-medium">{item.hasPendingReview ? "Pending review" : item.kind}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setWarningItems([])} disabled={isPending}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant={hasPendingWarning ? "destructive" : "default"}
                  onClick={() => {
                    setWarningItems([])
                    save(true)
                  }}
                  disabled={isPending}
                >
                  Disable for This Project
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-lg border px-3">
                <Search className="size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search stages"
                  className="border-0 px-0 shadow-none focus-visible:ring-0"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="font-medium">{effectiveSelectedCount} of {totalItemCount} active</span>
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 px-2.5 text-xs font-medium" onClick={() => setAddStageOpen(true)}>
                    <Plus className="size-3.5" />
                    Add Stage
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelection((current) => ({ ...cloneSelection(current), stages: new Set(), preCompletedStages: new Set() }))
                    }}
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
                {filteredStages.length ? (
                  filteredStages.map((stage) => {
                    const stageActive = selection.stages.has(stage.templateStageId)
                    const isPreCompleted = selection.preCompletedStages.has(stage.templateStageId)
                    const cleanDescription = stage.description
                      ? stage.description.replace(/inspection checklists/gi, "inspection reports").replace(/checklists/gi, "reports")
                      : null

                    return (
                      <div
                        key={stage.templateStageId}
                        className={cn(
                          "flex items-center justify-between gap-3 border-b px-4 py-3.5 last:border-b-0 transition-colors",
                          isPreCompleted ? "bg-emerald-50/40 dark:bg-emerald-950/20" : "hover:bg-muted/30"
                        )}
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                          <HierarchyCheckbox
                            checked={stageActive}
                            label={`Enable ${stage.name}`}
                            onChange={() => setStage(stage)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold leading-5 text-foreground">{stage.name}</p>
                              {isPreCompleted ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  <CheckCircle2 className="size-3" />
                                  100% {isArabic ? "تکمیل‌شده قبل از شروع" : "Pre-completed"}
                                </span>
                              ) : null}
                            </div>
                            {cleanDescription ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{cleanDescription}</p>
                            ) : null}
                          </div>
                        </label>

                        {stageActive ? (
                          <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer shadow-2xs">
                            <input
                              type="checkbox"
                              checked={isPreCompleted}
                              onChange={() => togglePreCompleted(stage)}
                              className="size-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                            />
                            <span>{isArabic ? "تکمیل‌شده قبلی (۱۰۰٪)" : "Pre-completed (100%)"}</span>
                          </label>
                        ) : null}
                      </div>
                    )
                  })
                ) : (
                  <p className="p-8 text-center text-sm text-muted-foreground">No stages match your search.</p>
                )}
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                <Button type="button" onClick={() => save()} disabled={isPending}>{isPending ? "Saving…" : "Save Configuration"}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
