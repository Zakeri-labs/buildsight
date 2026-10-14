"use client"

import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface CriticalCreditsModalProps {
  remainingCredits: number
}

export function CriticalCreditsModal({ remainingCredits }: CriticalCreditsModalProps) {
  const [open, setOpen] = useState(true)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={true} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0 text-red-600 dark:text-red-400" />
            <DialogTitle className="text-base font-semibold text-foreground">
              Critical: Low Report Credits
            </DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-sm text-muted-foreground">
            Your organization has {remainingCredits} Report Credits remaining. When your credits reach zero, members will no longer be able to create new reports. Please recharge before your credits are exhausted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton={false}>
          <Button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full sm:w-auto"
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
