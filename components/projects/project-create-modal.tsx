"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

export function ProjectCreateModal({ children }: { children: ReactNode }) {
  const router = useRouter()

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.replace("/projects")
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[min(96vw,80rem)] max-w-none overflow-y-auto p-4 sm:max-w-none sm:p-6"
        overlayClassName="bg-black/35"
      >
        <DialogTitle className="sr-only">Add Project</DialogTitle>
        <DialogDescription className="sr-only">
          Complete the guided project creation wizard without leaving the Projects page.
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  )
}
