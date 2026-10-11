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
            You only have {remainingCredits} Report Credits remaining. Please recharge your Report Credits soon to avoid interruption.
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
