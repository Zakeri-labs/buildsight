"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Check, Layers3, ListPlus, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  createProjectSubtermAction,
  deleteProjectSubtermAction,
  restoreProjectSubtermAction,
  saveProjectStageSelectionAction,
  updateProjectSubtermAction,
} from "@/lib/actions/project-stages"
import type { ProjectStageSelectionOption, ProjectStageTermExecution } from "@/lib/db/project-stages"
import { SUBTERM_RESPONSE_TYPES, type SubtermResponseType } from "@/lib/stages/execution"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

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
  const [selected, setSelected] = useState<Set<string>>(() => new Set(stages.filter((stage) => stage.active).map((stage) => stage.templateStageId)))
  const [warningStages, setWarningStages] = useState<ProjectStageSelectionOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setSelected(new Set(stages.filter((stage) => stage.active).map((stage) => stage.templateStageId)))
    setSearch("")
    setWarningStages([])
    setError(null)
  }, [open, stages])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return stages
    return stages.filter((stage) => `${stage.name} ${stage.description ?? ""}`.toLowerCase().includes(query))
  }, [search, stages])

  const save = () => {
    const disablingWithData = stages.filter((stage) => stage.active && !selected.has(stage.templateStageId) && stage.hasData)
    if (disablingWithData.length && !warningStages.length) {
      setWarningStages(disablingWithData)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await saveProjectStageSelectionAction({ projectId, selectedTemplateStageIds: Array.from(selected) })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={() => setOpen(true)}>
        <Layers3 className="size-4" />
        Manage Stages
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Manage Project Stages</DialogTitle>
            <DialogDescription>Choose the existing construction stages that are active for this project.</DialogDescription>
          </DialogHeader>

          {warningStages.length ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="font-semibold">This stage already contains project data.</p>
                    <p className="mt-1 text-amber-800 dark:text-amber-200">
                      Disabling it will hide the stage from normal project workflows, but its existing records will not be deleted.
                    </p>
                    <ul className="mt-3 list-disc space-y-1 ps-5">
                      {warningStages.map((stage) => <li key={stage.templateStageId}>{stage.name}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setWarningStages([])} disabled={isPending}>Cancel</Button>
                <Button type="button" variant="destructive" onClick={save} disabled={isPending}>
                  {isPending ? "Saving…" : warningStages.length === 1 ? "Disable Stage" : "Disable Stages"}
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
                <span className="font-medium">{selected.size} of {stages.length} selected</span>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set(stages.map((stage) => stage.templateStageId)))}>Select All</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear All</Button>
                </div>
              </div>

              <div className="max-h-[44vh] overflow-y-auto rounded-xl border">
                {filtered.length ? filtered.map((stage) => {
                  const checked = selected.has(stage.templateStageId)
                  return (
                    <label key={stage.templateStageId} className="flex cursor-pointer items-start gap-3 border-b p-3 last:border-b-0 hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelected((current) => {
                          const next = new Set(current)
                          if (next.has(stage.templateStageId)) next.delete(stage.templateStageId)
                          else next.add(stage.templateStageId)
                          return next
                        })}
                        className="mt-1 size-4 rounded border-input accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{stage.name}</span>
                        {stage.description ? <span className="mt-0.5 block text-xs text-muted-foreground">{stage.description}</span> : null}
                      </span>
                      {checked ? <Check className="mt-0.5 size-4 text-primary" /> : null}
                    </label>
                  )
                }) : <p className="p-6 text-center text-sm text-muted-foreground">No stages match your search.</p>}
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
                <Button type="button" onClick={save} disabled={isPending}>{isPending ? "Saving…" : "Save Stages"}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

type TermDialogMode =
  | { type: "add"; parent: ProjectStageTermExecution }
  | { type: "edit"; subterm: ProjectStageTermExecution }

export function ProjectTermAdminMenu({
  projectId,
  term,
  kind,
}: {
  projectId: string
  term: ProjectStageTermExecution
  kind: "parent" | "subterm"
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<TermDialogMode | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState("")
  const [required, setRequired] = useState(true)
  const [approvalRequired, setApprovalRequired] = useState(false)
  const [responseType, setResponseType] = useState<SubtermResponseType>("combined")
  const [instructions, setInstructions] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const openDialog = (next: TermDialogMode) => {
    setDialog(next)
    const source = next.type === "edit" ? next.subterm : null
    setName(source?.reportName ?? "")
    setRequired(source?.required ?? true)
    setApprovalRequired(source?.approvalRequired ?? false)
    setResponseType(source?.responseType ?? "combined")
    setInstructions(source?.instructions ?? "")
    setError(null)
  }

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError("Sub-term name is required.")
      return
    }
    setError(null)
    startTransition(async () => {
      const payload = {
        projectId,
        name: trimmed,
        required,
        approvalRequired,
        responseType,
        instructions: instructions.trim(),
      }
      const result = dialog?.type === "edit"
        ? await updateProjectSubtermAction({ ...payload, subtermId: dialog.subterm.id })
        : dialog?.type === "add"
          ? await createProjectSubtermAction({ ...payload, parentTermId: dialog.parent.id })
          : null
      if (!result) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDialog(null)
      router.refresh()
    })
  }

  const remove = () => {
    setError(null)
    startTransition(async () => {
      const result = await deleteProjectSubtermAction({ projectId, subtermId: term.id })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDeleteOpen(false)
      router.refresh()
    })
  }

  const restore = () => {
    startTransition(async () => {
      const result = await restoreProjectSubtermAction({ projectId, subtermId: term.id })
      if (!result.ok) {
        window.alert(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-0.5">
        {kind === "parent" ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Add sub-term"
                  onClick={() => openDialog({ type: "add", parent: term })}
                >
                  <ListPlus className="size-4" />
                </Button>
              }
            />
            <TooltipContent>Add sub-term</TooltipContent>
          </Tooltip>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="ghost" size="icon-sm" aria-label={kind === "parent" ? "Term actions" : "Sub-term actions"}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-44">
            {kind === "parent" ? (
              <DropdownMenuItem onClick={() => openDialog({ type: "add", parent: term })}>
                <Plus className="size-4" /> Add Sub-term
              </DropdownMenuItem>
            ) : term.isActive ? (
              <>
                <DropdownMenuItem onClick={() => openDialog({ type: "edit", subterm: term })}>
                  <Pencil className="size-4" /> Edit Sub-term
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => { setError(null); setDeleteOpen(true) }}>
                  <Trash2 className="size-4" /> Delete Sub-term
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={restore} disabled={isPending}>
                <RotateCcw className="size-4" /> Restore Sub-term
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={Boolean(dialog)} onOpenChange={(next) => !next && setDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.type === "edit" ? "Edit Sub-term" : "Add Sub-term"}</DialogTitle>
            <DialogDescription>
              Configure one child level under <span className="font-medium text-foreground">{dialog?.type === "add" ? dialog.parent.reportName : term.parentTermId ? "the parent Term" : term.reportName}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`subterm-name-${term.id}`}>Sub-term Name</Label>
              <Input
                id={`subterm-name-${term.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter sub-term name"
                maxLength={200}
                autoFocus
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Required / Optional</Label>
                <Select value={required ? "required" : "optional"} onValueChange={(value) => setRequired(value === "required")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Approval Required</Label>
                <Select value={approvalRequired ? "yes" : "no"} onValueChange={(value) => setApprovalRequired(value === "yes")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Response Type</Label>
              <Select value={responseType} onValueChange={(value) => setResponseType(value as SubtermResponseType)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBTERM_RESPONSE_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`subterm-instructions-${term.id}`}>Description / Instructions</Label>
              <textarea
                id={`subterm-instructions-${term.id}`}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value.slice(0, 5000))}
                rows={4}
                placeholder="Explain what the user must inspect, answer, or upload"
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
              />
              <p className="text-end text-xs text-muted-foreground">{instructions.length}/5000</p>
            </div>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={isPending}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={isPending}>{isPending ? "Saving…" : dialog?.type === "edit" ? "Save changes" : "Add Sub-term"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{term.hasLinkedData ? "Archive Sub-term" : "Delete Sub-term"}</DialogTitle>
            <DialogDescription>
              {term.hasLinkedData
                ? "This sub-term contains responses, inspections, attachments, or approval history. It will be archived and its existing records will be preserved."
                : "This sub-term has no linked workflow data and can be deleted safely."}
            </DialogDescription>
          </DialogHeader>
          <div className={cn("rounded-lg border p-3 text-sm", term.hasLinkedData && "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30")}>
            <div className="flex items-center gap-2 font-medium">
              {term.hasLinkedData ? <AlertTriangle className="size-4 text-amber-600" /> : <Trash2 className="size-4" />}
              {term.reportName}
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={isPending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={isPending}>
              {isPending ? "Saving…" : term.hasLinkedData ? "Archive Sub-term" : "Delete Sub-term"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
