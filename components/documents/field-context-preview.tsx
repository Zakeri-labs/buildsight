"use client"

import { useEffect, useRef } from "react"
import { Eye, Pin, X } from "lucide-react"
import type { FieldPreviewContext } from "@/lib/documents/field-preview-helper"
import { cn } from "@/lib/utils"

function RenderParagraphWithHighlight({
  text,
  userValue,
}: {
  text: string
  userValue: string | null
}) {
  if (!userValue || userValue.trim().length === 0) {
    return <span>{text}</span>
  }

  const trimmed = userValue.trim()
  const lowerText = text.toLowerCase()
  const lowerValue = trimmed.toLowerCase()
  const matchIndex = lowerText.indexOf(lowerValue)

  if (matchIndex === -1) {
    return <span>{text}</span>
  }

  const before = text.slice(0, matchIndex)
  const matched = text.slice(matchIndex, matchIndex + trimmed.length)
  const after = text.slice(matchIndex + trimmed.length)

  return (
    <span>
      {before}
      <mark className="rounded bg-amber-200/90 px-1 py-0.5 font-semibold text-amber-950 shadow-xs dark:bg-amber-900/80 dark:text-amber-100">
        {matched}
      </mark>
      {after}
    </span>
  )
}

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

  // Auto-scroll target paragraph into view when preview opens
  useEffect(() => {
    if (targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [context.targetParagraph])

  return (
    <div
      className={cn(
        "fixed bottom-20 inset-x-3 z-40 mx-auto max-w-lg rounded-2xl border border-border/80 bg-background/95 p-3 shadow-2xl backdrop-blur transition-all dark:bg-slate-950/95 animate-in fade-in slide-in-from-bottom-4",
      )}
    >
      {/* Minimal Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-1.5 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Eye className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Letter Preview</span>
          {isPinned ? (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              <Pin className="size-2.5" /> Pinned
            </span>
          ) : null}
          {context.isManuallyEdited ? (
            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
              (Generated)
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Close Preview"
          aria-label="Close Preview"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Document Excerpt Snippet */}
      <div className="max-h-[38vh] overflow-y-auto space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 font-sans text-xs leading-relaxed text-foreground dark:border-slate-800 dark:bg-slate-900/80">
        <div className="text-[10px] font-mono text-muted-foreground/60 select-none pb-0.5">...</div>

        {context.prevParagraph ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground/70 italic">
            {context.prevParagraph}
          </p>
        ) : null}

        {/* Active Target Paragraph with Inline Highlighted User Value */}
        <div
          ref={targetRef}
          className="py-1 text-xs font-normal leading-relaxed text-foreground whitespace-pre-wrap"
        >
          <RenderParagraphWithHighlight
            text={context.targetParagraph}
            userValue={context.userEnteredValue}
          />
        </div>

        {context.nextParagraph ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground/70 italic">
            {context.nextParagraph}
          </p>
        ) : null}

        <div className="text-[10px] font-mono text-muted-foreground/60 select-none pt-0.5">...</div>
      </div>
    </div>
  )
}
