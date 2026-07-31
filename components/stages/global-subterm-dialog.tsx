"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck } from "lucide-react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { createStageSubterm, updateStageSubterm } from "@/lib/actions/stages"
import type { StageTermRecord } from "@/lib/db/stages"
import { SUBTERM_RESPONSE_TYPES, type SubtermResponseType } from "@/lib/stages/execution"
import type { StageTermStatus } from "@/lib/stages/config"

export type GlobalSubtermDialogState =
  | { mode: "create"; parent: StageTermRecord; subterm: null }
  | { mode: "edit"; parent: StageTermRecord; subterm: StageTermRecord }

export function GlobalSubtermDialog({
  state,
  onClose,
}: {
  state: GlobalSubtermDialogState | null
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [required, setRequired] = useState(true)
  const [approvalRequired, setApprovalRequired] = useState(false)
  const [responseType, setResponseType] = useState<SubtermResponseType>("combined")
  const [instructions, setInstructions] = useState("")
  const [status, setStatus] = useState<StageTermStatus>("active")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!state) return
    const source = state.subterm
    setName(source?.reportName ?? "")
    setRequired(source?.required ?? true)
    setApprovalRequired(source?.approvalRequired ?? false)
    setResponseType(source?.responseType ?? "combined")
    setInstructions(source?.instructions ?? "")
    setStatus(source?.status ?? "active")
    setError(null)
  }, [state])

  function submit() {
    if (!state) return
    const trimmed = name.trim().replace(/\s+/g, " ")
    if (!trimmed) {
      setError("Sub-term name is required.")
      return
    }
    setError(null)
    startTransition(async () => {
      const values = {
        name: trimmed,
        required,
        approvalRequired,
        responseType,
        instructions: instructions.trim(),
        status,
      }
      const result = state.mode === "create"
        ? await createStageSubterm({ ...values, parentTermId: state.parent.id })
        : await updateStageSubterm({ ...values, subtermId: state.subterm.id })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={state != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[34rem]">
        <DialogHeader>
          <DialogTitle>{state?.mode === "edit" ? "Edit Sub-term" : "Add Sub-term"}</DialogTitle>
          <DialogDescription>
            {state?.parent.reportName} — Define a reusable Sub-term for all projects.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="global-subterm-name">Sub-term Name</Label>
            <Input
              id="global-subterm-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              autoFocus
              placeholder="Enter sub-term name"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Required / Optional</Label>
            <Select value={required ? "required" : "optional"} onValueChange={(value) => setRequired(value === "required")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="required">Required</SelectItem>
                <SelectItem value="optional">Optional</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Approval Required</Label>
            <Select value={approvalRequired ? "yes" : "no"} onValueChange={(value) => setApprovalRequired(value === "yes")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Response Type</Label>
            <Select value={responseType} onValueChange={(value) => setResponseType(value as SubtermResponseType)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUBTERM_RESPONSE_TYPES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="global-subterm-instructions">Description / Instructions</Label>
            <textarea
              id="global-subterm-instructions"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Explain what the user must inspect, answer, or upload"
              className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex min-h-20 items-center justify-between gap-4 rounded-xl border p-3 sm:col-span-2">
            <div className="flex min-w-0 items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
              <div><p className="text-sm font-medium">Library status</p><p className="text-xs text-muted-foreground">{status === "active" ? "Active" : "Disabled"}</p></div>
            </div>
            <Switch checked={status === "active"} onCheckedChange={(checked) => setStatus(checked ? "active" : "disabled")} aria-label="Active Sub-term" />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending}>{pending ? "Saving…" : state?.mode === "edit" ? "Save changes" : "Add Sub-term"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
