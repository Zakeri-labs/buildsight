"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Layers3, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { updateProjectStageSelection } from "@/lib/actions/project-stages"
import type { ProjectStageSelectionOption } from "@/lib/db/project-stages"

export function ManageProjectStagesButton({ projectId, stages }: { projectId: string; stages: ProjectStageSelectionOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setSelected(new Set(stages.filter((stage) => stage.active).map((stage) => stage.templateStageId)))
    setSearch("")
    setError(null)
  }, [open, stages])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return stages
    return stages.filter((stage) => `${stage.name} ${stage.description ?? ""}`.toLowerCase().includes(query))
  }, [search, stages])

  const riskyDisabled = stages.filter((stage) => stage.active && !selected.has(stage.templateStageId) && (stage.hasData || stage.hasPendingReview))

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await updateProjectStageSelection({ projectId, selectedTemplateStageIds: Array.from(selected) })
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
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><Layers3 className="size-4" />Manage Stages</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Project Stage Control</DialogTitle>
            <DialogDescription>Enable the stages available to project users. Disabled stages are hidden from the active workflow.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stages..." className="pl-9" /></div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selected.size} selected</span>
              <div className="flex gap-2"><button type="button" className="font-medium text-primary" onClick={() => setSelected(new Set(stages.map((stage) => stage.templateStageId)))}>Select all</button><button type="button" className="font-medium text-primary" onClick={() => setSelected(new Set())}>Clear</button></div>
            </div>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {filtered.map((stage) => (
                <label key={stage.templateStageId} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 hover:bg-muted/30">
                  <input type="checkbox" checked={selected.has(stage.templateStageId)} onChange={() => toggle(stage.templateStageId)} className="mt-1 size-4 rounded border-input accent-primary" />
                  <span className="min-w-0 flex-1"><span className="block font-medium">{stage.name}</span>{stage.description ? <span className="mt-0.5 block text-xs text-muted-foreground">{stage.description}</span> : null}</span>
                  {stage.active ? <span className="text-xs font-medium text-emerald-700">Active</span> : null}
                </label>
              ))}
              {!filtered.length ? <p className="py-8 text-center text-sm text-muted-foreground">No stages match your search.</p> : null}
            </div>
            {riskyDisabled.length ? <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><p className="font-medium">Disabling stages with existing activity</p><p className="mt-1">Existing reports remain stored, but these stages will be hidden from the active project workflow: {riskyDisabled.map((stage) => stage.name).join(", ")}.</p></div></div> : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="button" onClick={save} disabled={pending}>{pending ? "Saving..." : "Save Stages"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
