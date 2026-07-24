"use client"

import { useState } from "react"
import { Check, Copy, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export type InviteResult = {
  email: string
  token: string
  userExists: boolean
}

export function InviteLinkDialog({
  result,
  onClose,
}: {
  result: InviteResult | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const link = result ? `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${result.token}` : ""

  async function copy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Dialog open={result != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitation sent</DialogTitle>
          <DialogDescription className="text-pretty">
            {result?.userExists
              ? `${result.email} already has a Provision account. They'll see this invitation after signing in — you can also share the link directly.`
              : `We've created an invitation for ${result?.email}. Share this secure link so they can register and join.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input readOnly value={link} className="ps-9 text-xs" onFocus={(e) => e.currentTarget.select()} />
          </div>
          <Button type="button" variant="outline" onClick={copy} className="shrink-0 bg-transparent">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
