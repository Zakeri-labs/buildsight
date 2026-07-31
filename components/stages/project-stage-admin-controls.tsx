"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ChevronDown, ChevronRight, Layers3, Search } from "lucide-react"
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
import { saveProjectStageSelectionAction } from "@/lib/actions/project-stages"
import type { ProjectStageSelectionOption, ProjectTermSelectionOption } from "@/lib/db/project-stages"
import { cn } from "@/lib/utils"

type SelectionState = {
  stages: Set<string>
  terms: Set<string>
  subterms: Set<string>
}

type DisabledItem = {
  id: string
  name: string
  kind: "Stage" | "Term" | "Sub-term"
  hasData: boolean
  hasPendingReview: boolean
}

function initialSelection(stages: ProjectStageSelectionOption[]): SelectionState {
  return {
    stages: new Set(stages.filter((stage) => stage.active).map((stage) => stage.templateStageId)),
    terms: new Set(stages.flatMap((stage) => stage.terms).filter((term) => term.active).map((term) => term.templateTermId)),
    subterms: new Set(
      stages
        .flatMap((stage) => stage.terms)
        .flatMap((term) => term.subterms)
        .filter((subterm) => subterm.active)
        .map((subterm) => subterm.templateTermId),
    ),
  }
}

function cloneSelection(selection: SelectionState): SelectionState {
  return {
    stages: new Set(selection.stages),
    terms: new Set(selection.terms),
    subterms: new Set(selection.subterms),
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

function termMatches(term: ProjectTermSelectionOption, query: string) {
  return (
    term.name.toLowerCase().includes(query) ||
    term.subterms.some((subterm) => subterm.name.toLowerCase().includes(query))
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
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selection, setSelection] = useState<SelectionState>(() => initialSelection(stages))
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set())
  const [warningItems, setWarningItems] = useState<DisabledItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setSelection(initialSelection(stages))
    setExpandedStages(new Set(stages.filter((stage) => stage.active).map((stage) => stage.templateStageId)))
    setExpandedTerms(
      new Set(
        stages
          .flatMap((stage) => stage.terms)
          .filter((term) => term.active && term.subterms.length > 0)
          .map((term) => term.templateTermId),
      ),
    )
    setSearch("")
    setWarningItems([])
    setError(null)
  }, [open, stages])

  const query = search.trim().toLowerCase()
  const filteredStages = useMemo(() => {
    if (!query) return stages
    return stages.filter(
      (stage) =>
        `${stage.name} ${stage.description ?? ""}`.toLowerCase().includes(query) ||
        stage.terms.some((term) => termMatches(term, query)),
    )
  }, [query, stages])

  const effectiveSelectedCount = useMemo(() => {
    let count = 0
    for (const stage of stages) {
      if (!selection.stages.has(stage.templateStageId)) continue
      count += 1
      for (const term of stage.terms) {
        if (!selection.terms.has(term.templateTermId)) continue
        count += 1
        count += term.subterms.filter((subterm) => selection.subterms.has(subterm.templateTermId)).length
      }
    }
    return count
  }, [selection, stages])

  const totalItemCount = useMemo(
    () => stages.reduce((total, stage) => total + 1 + stage.terms.reduce((sum, term) => sum + 1 + term.subterms.length, 0), 0),
    [stages],
  )

  const setStage = (stage: ProjectStageSelectionOption) => {
    setSelection((current) => {
      const next = cloneSelection(current)
      const childTermIds = stage.terms.map((term) => term.templateTermId)
      const childSubtermIds = stage.terms.flatMap((term) => term.subterms.map((subterm) => subterm.templateTermId))
      const allChildrenSelected =
        childTermIds.every((id) => current.terms.has(id)) && childSubtermIds.every((id) => current.subterms.has(id))

      if (current.stages.has(stage.templateStageId) && allChildrenSelected) {
        next.stages.delete(stage.templateStageId)
      } else if (current.stages.has(stage.templateStageId)) {
        childTermIds.forEach((id) => next.terms.add(id))
        childSubtermIds.forEach((id) => next.subterms.add(id))
      } else {
        next.stages.add(stage.templateStageId)
        if (!stage.projectStageId) {
          childTermIds.forEach((id) => next.terms.add(id))
          childSubtermIds.forEach((id) => next.subterms.add(id))
        }
        setExpandedStages((expanded) => new Set(expanded).add(stage.templateStageId))
      }
      return next
    })
  }

  const setTerm = (stage: ProjectStageSelectionOption, term: ProjectTermSelectionOption) => {
    setSelection((current) => {
      const next = cloneSelection(current)
      const childIds = term.subterms.map((subterm) => subterm.templateTermId)
      const allChildrenSelected = childIds.every((id) => current.subterms.has(id))

      if (current.terms.has(term.templateTermId) && allChildrenSelected) {
        next.terms.delete(term.templateTermId)
      } else if (current.terms.has(term.templateTermId)) {
        childIds.forEach((id) => next.subterms.add(id))
      } else {
        next.stages.add(stage.templateStageId)
        next.terms.add(term.templateTermId)
        if (!term.projectTermId) childIds.forEach((id) => next.subterms.add(id))
        setExpandedStages((expanded) => new Set(expanded).add(stage.templateStageId))
        if (childIds.length) setExpandedTerms((expanded) => new Set(expanded).add(term.templateTermId))
      }
      return next
    })
  }

  const setSubterm = (
    stage: ProjectStageSelectionOption,
    term: ProjectTermSelectionOption,
    subterm: ProjectTermSelectionOption,
  ) => {
    setSelection((current) => {
      const next = cloneSelection(current)
      if (current.subterms.has(subterm.templateTermId)) {
        next.subterms.delete(subterm.templateTermId)
      } else {
        next.stages.add(stage.templateStageId)
        next.terms.add(term.templateTermId)
        next.subterms.add(subterm.templateTermId)
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
    })
    setExpandedStages(new Set(stages.map((stage) => stage.templateStageId)))
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
      for (const term of stage.terms) {
        const termNowDisabled =
          term.active &&
          (!selection.stages.has(stage.templateStageId) || !selection.terms.has(term.templateTermId))
        if (termNowDisabled && (term.hasData || term.hasPendingReview)) {
          items.push({
            id: term.templateTermId,
            name: `${stage.name} / ${term.name}`,
            kind: "Term",
            hasData: term.hasData,
            hasPendingReview: term.hasPendingReview,
          })
        }
        for (const subterm of term.subterms) {
          const subtermNowDisabled =
            subterm.active &&
            (!selection.stages.has(stage.templateStageId) ||
              !selection.terms.has(term.templateTermId) ||
              !selection.subterms.has(subterm.templateTermId))
          if (subtermNowDisabled && (subterm.hasData || subterm.hasPendingReview)) {
            items.push({
              id: subterm.templateTermId,
              name: `${stage.name} / ${term.name} / ${subterm.name}`,
              kind: "Sub-term",
              hasData: subterm.hasData,
              hasPendingReview: subterm.hasPendingReview,
            })
          }
        }
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
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage Project Stages</DialogTitle>
            <DialogDescription>
              Choose which predefined stages, terms, and sub-terms are available for this project. Changes apply only to this project.
            </DialogDescription>
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
                      Disabling these items will hide them from new employee work, but existing responses, files, and review history will not be deleted. Reviewers retain access to submitted work.
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
                  placeholder="Search stages, terms, and sub-terms"
                  className="border-0 px-0 shadow-none focus-visible:ring-0"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="font-medium">{effectiveSelectedCount} of {totalItemCount} active</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                                        setSelection((current) => ({ ...cloneSelection(current), stages: new Set() }))
                    }}
                  >
                    Clear All
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
                {filteredStages.length ? (
                  filteredStages.map((stage) => {
                    const stageExpanded = query ? true : expandedStages.has(stage.templateStageId)
                    const stageActive = selection.stages.has(stage.templateStageId)
                    const selectedTerms = stage.terms.filter((term) => selection.terms.has(term.templateTermId)).length
                    const allTermsSelected = stage.terms.length === 0 || selectedTerms === stage.terms.length
                    const stageIndeterminate = stageActive && !allTermsSelected

                    return (
                      <div key={stage.templateStageId} className="border-b last:border-b-0">
                        <div className="flex items-start gap-2 bg-muted/25 px-3 py-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="-ms-1 mt-0.5"
                            aria-label={stageExpanded ? `Collapse ${stage.name}` : `Expand ${stage.name}`}
                            onClick={() => setExpandedStages((current) => {
                              const next = new Set(current)
                              if (next.has(stage.templateStageId)) next.delete(stage.templateStageId)
                              else next.add(stage.templateStageId)
                              return next
                            })}
                          >
                            {stageExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </Button>
                          <div className="mt-1">
                            <HierarchyCheckbox
                              checked={stageActive && allTermsSelected}
                              indeterminate={stageIndeterminate}
                              label={`Enable ${stage.name}`}
                              onChange={() => setStage(stage)}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{stage.name}</p>
                            {stage.description ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{stage.description}</p> : null}
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{selectedTerms}/{stage.terms.length}</span>
                        </div>

                        {stageExpanded ? (
                          <div className="divide-y">
                            {stage.terms.length ? stage.terms
                              .filter((term) => !query || termMatches(term, query) || stage.name.toLowerCase().includes(query))
                              .map((term) => {
                                const termExpanded = query ? true : expandedTerms.has(term.templateTermId)
                                const termPreference = selection.terms.has(term.templateTermId)
                                const effectiveTermActive = stageActive && termPreference
                                const selectedSubterms = term.subterms.filter((subterm) => selection.subterms.has(subterm.templateTermId)).length
                                const allSubtermsSelected = term.subterms.length === 0 || selectedSubterms === term.subterms.length
                                const termIndeterminate = effectiveTermActive && !allSubtermsSelected

                                return (
                                  <div key={term.templateTermId}>
                                    <div className="flex items-center gap-2 px-4 py-2.5 ps-10">
                                      {term.subterms.length ? (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          aria-label={termExpanded ? `Collapse ${term.name}` : `Expand ${term.name}`}
                                          onClick={() => setExpandedTerms((current) => {
                                            const next = new Set(current)
                                            if (next.has(term.templateTermId)) next.delete(term.templateTermId)
                                            else next.add(term.templateTermId)
                                            return next
                                          })}
                                        >
                                          {termExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                        </Button>
                                      ) : <span className="size-8" />}
                                      <HierarchyCheckbox
                                        checked={effectiveTermActive && allSubtermsSelected}
                                        indeterminate={termIndeterminate}
                                        disabled={!stageActive}
                                        label={`Enable ${term.name}`}
                                        onChange={() => setTerm(stage, term)}
                                      />
                                      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", !stageActive && "text-muted-foreground")}>{term.name}</span>
                                      {term.subterms.length ? <span className="text-xs text-muted-foreground">{selectedSubterms}/{term.subterms.length}</span> : null}
                                    </div>

                                    {termExpanded && term.subterms.length ? (
                                      <div className="border-s ms-16">
                                        {term.subterms
                                          .filter((subterm) => !query || subterm.name.toLowerCase().includes(query) || term.name.toLowerCase().includes(query) || stage.name.toLowerCase().includes(query))
                                          .map((subterm) => {
                                            const effectiveSubtermActive =
                                              stageActive && termPreference && selection.subterms.has(subterm.templateTermId)
                                            return (
                                              <label key={subterm.templateTermId} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 ps-6 hover:bg-muted/35">
                                                <HierarchyCheckbox
                                                  checked={effectiveSubtermActive}
                                                  disabled={!effectiveTermActive}
                                                  label={`Enable ${subterm.name}`}
                                                  onChange={() => setSubterm(stage, term, subterm)}
                                                />
                                                <span className={cn("min-w-0 flex-1 truncate text-sm", !effectiveTermActive && "text-muted-foreground")}>{subterm.name}</span>
                                                <span className="shrink-0 text-[11px] text-muted-foreground">{subterm.required ? "Required" : "Optional"}</span>
                                              </label>
                                            )
                                          })}
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              }) : (
                              <p className="px-12 py-4 text-sm text-muted-foreground">No reusable terms are defined for this stage.</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )
                  })
                ) : (
                  <p className="p-8 text-center text-sm text-muted-foreground">No workflow items match your search.</p>
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
