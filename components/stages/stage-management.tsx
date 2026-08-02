"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Layers3, Pencil, Plus, Power, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { createStage, deleteStage, moveStage, setStageActive, updateStage } from "@/lib/actions/stages"
import type { StageManagementData, StageRecord } from "@/lib/db/stages"

export function StageManagement({ organization, data }: { organization: { id: string; name: string }; data: StageManagementData }) {
  const router = useRouter()
  const [editor, setEditor] = useState<{ mode: "create"; stage: null } | { mode: "edit"; stage: StageRecord } | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function openCreate() {
    setName("")
    setDescription("")
    setError(null)
    setEditor({ mode: "create", stage: null })
  }

  function openEdit(stage: StageRecord) {
    setName(stage.name)
    setDescription(stage.description ?? "")
    setError(null)
    setEditor({ mode: "edit", stage })
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error ?? "Could not complete the action.")
        return
      }
      router.refresh()
    })
  }

  function save() {
    if (!editor) return
    run(async () => {
      const result = editor.mode === "create"
        ? await createStage({ organizationId: organization.id, name, description })
        : await updateStage({ stageId: editor.stage.id, name, description })
      if (result.ok) setEditor(null)
      return result
    })
  }

  function remove(stage: StageRecord) {
    if (!window.confirm(`Delete or archive “${stage.name}”?`)) return
    run(() => deleteStage({ stageId: stage.id }))
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Layers3 className="size-4" />{organization.name}</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Stage Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the global stage list, display order, and availability for projects.</p>
        </div>
        <Button type="button" onClick={openCreate}><Plus className="size-4" />Add Stage</Button>
      </div>

      {error && !editor ? <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p> : null}

      {data.stages.length ? (
        <div className="space-y-3">
          {data.stages.map((stage, index) => (
            <Card key={stage.id} className={!stage.active ? "opacity-65" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><CardTitle className="text-lg">{stage.name}</CardTitle><Badge variant={stage.active ? "secondary" : "outline"}>{stage.active ? "Available" : "Unavailable"}</Badge></div>
                    {stage.description ? <p className="mt-1 text-sm text-muted-foreground">{stage.description}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${stage.name} up`} disabled={pending || index === 0} onClick={() => run(() => moveStage({ stageId: stage.id, direction: "up" }))}><ArrowUp className="size-4" /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${stage.name} down`} disabled={pending || index === data.stages.length - 1} onClick={() => run(() => moveStage({ stageId: stage.id, direction: "down" }))}><ArrowDown className="size-4" /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${stage.name}`} disabled={pending} onClick={() => openEdit(stage)}><Pencil className="size-4" /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`${stage.active ? "Disable" : "Enable"} ${stage.name}`} disabled={pending} onClick={() => run(() => setStageActive({ stageId: stage.id, active: !stage.active }))}><Power className="size-4" /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${stage.name}`} disabled={pending} onClick={() => remove(stage)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent><p className="text-xs text-muted-foreground">Order {index + 1} · Project administrators can enable or disable this stage per project.</p></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><Layers3 className="size-10 text-muted-foreground" /><h2 className="mt-4 font-semibold">No stages have been configured.</h2><p className="mt-1 text-sm text-muted-foreground">Create the first stage to make it available for project setup.</p><Button type="button" className="mt-5" onClick={openCreate}><Plus className="size-4" />Add Stage</Button></CardContent></Card>
      )}

      <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) setEditor(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editor?.mode === "edit" ? "Edit Stage" : "Add Stage"}</DialogTitle><DialogDescription>Stages are the direct containers for project reports.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="stage-name">Stage Name</Label><Input id="stage-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Earth work Excavation" maxLength={200} /></div>
            <div className="space-y-2"><Label htmlFor="stage-description">Description</Label><textarea id="stage-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional stage description" rows={4} className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" /></div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={pending}>Cancel</Button><Button type="button" onClick={save} disabled={pending || name.trim().length < 2}>{pending ? "Saving..." : "Save Stage"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
