"use client"

import { useEffect, useRef } from "react"
import { Eye, Pin, X } from "lucide-react"
import type { FieldPreviewContext } from "@/lib/documents/field-preview-helper"
import { cn } from "@/lib/utils"

export function FieldContextPreview({
  fieldLabel,
  context,
  isPinned,
  onClose,
}: {
  fieldLabel: string
  context: FieldPreviewContext
  isPinned: boolean
  onClose: () => void
}) {
  const targetRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll target highlighted paragraph into view when preview opens
  useEffect(() => {
    if (targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [context.targetParagraph])

  return (
    <div
      className={cn(
        "fixed bottom-20 inset-x-3 z-40 mx-auto max-w-lg rounded-2xl border border-amber-200 bg-background/95 p-3.5 shadow-2xl backdrop-blur transition-all dark:border-amber-900/60 dark:bg-slate-950/95 animate-in fade-in slide-in-from-bottom-4",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <Eye className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-foreground truncate">
                Preview in Letter — <span className="text-amber-600 dark:text-amber-400">{fieldLabel}</span>
              </h4>
              {isPinned ? (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                  <Pin className="size-2.5" /> Pinned
                </span>
              ) : null}
            </div>
            {context.isManuallyEdited ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-400">Generated Preview</p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Close Preview"
          aria-label="Close Preview"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Excerpt Body */}
      <div className="max-h-[38vh] overflow-y-auto space-y-2 px-1 text-xs leading-relaxed">
        {context.prevParagraph ? (
          <p className="text-muted-foreground/75 opacity-80 text-[11px] leading-snug italic">
            {context.prevParagraph}
          </p>
        ) : null}

        {/* Highlighted Target Paragraph */}
        <div
          ref={targetRef}
          className="rounded-xl border-s-4 border-amber-500 bg-amber-50/90 p-3 dark:bg-amber-950/40 dark:border-amber-400 shadow-xs"
        >
          <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            This Field ({fieldLabel})
          </span>
          <p className="text-xs font-medium text-amber-950 dark:text-amber-100 leading-relaxed whitespace-pre-wrap">
            {context.targetParagraph}
          </p>
        </div>

        {context.nextParagraph ? (
          <p className="text-muted-foreground/75 opacity-80 text-[11px] leading-snug italic">
            {context.nextParagraph}
          </p>
        ) : null}
      </div>
    </div>
  )
}
