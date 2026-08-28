"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronDown, ChevronRight, Copy, Trash2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  readDiagnosticEvents,
  clearDiagnosticEvents,
  formatDiagnosticLogAsText,
  DEBUG_TIMELINE_EVENT,
  type DiagnosticEvent,
} from "@/lib/stage-translations/debug-timeline"

export function DebugTimelinePanel({ responseId }: { responseId: string | null | undefined }) {
  const [isOpen, setIsOpen] = useState(false)
  const [events, setEvents] = useState<DiagnosticEvent[]>([])
  const [copied, setCopied] = useState(false)

  const reloadEvents = useCallback(() => {
    if (!responseId) return
    setEvents(readDiagnosticEvents(responseId))
  }, [responseId])

  useEffect(() => {
    reloadEvents()
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.responseId || detail.responseId === responseId) {
        reloadEvents()
      }
    }
    window.addEventListener(DEBUG_TIMELINE_EVENT, handleUpdate)
    return () => {
      window.removeEventListener(DEBUG_TIMELINE_EVENT, handleUpdate)
    }
  }, [responseId, reloadEvents])

  if (!responseId) return null

  const handleCopy = async () => {
    const text = formatDiagnosticLogAsText(responseId)
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Fallback ignore
    }
  }

  const handleClear = () => {
    clearDiagnosticEvents(responseId)
    setEvents([])
  }

  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-2 text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between font-mono text-[11px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <span>Translation / PDF Debug Timeline</span>
          <span className="rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-[10px]">
            {events.length}
          </span>
        </span>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between border-b border-border/40 pb-1.5 pt-1">
            <span className="text-[10px] text-muted-foreground">Session Log (No secrets logged)</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1"
                onClick={handleCopy}
              >
                {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                <span>{copied ? "Copied!" : "Copy Debug Log"}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1 text-destructive hover:text-destructive"
                onClick={handleClear}
              >
                <Trash2 className="size-3" />
                <span>Clear</span>
              </Button>
            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto space-y-1 rounded bg-black/80 p-2 font-mono text-[11px] text-emerald-400 dark:bg-black/90">
            {events.length === 0 ? (
              <div className="py-2 text-center text-muted-foreground">No timeline events recorded yet.</div>
            ) : (
              events.map((e, idx) => (
                <div key={`${e.num}-${idx}`} className="flex flex-col border-b border-white/10 pb-1 pt-0.5 last:border-b-0">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <span className="text-amber-400">{e.num}</span>
                    <span className="text-muted-foreground">{e.time}</span>
                    <span className="font-bold text-white">{e.name}</span>
                  </div>
                  <div className="pl-4 text-[10px] text-emerald-200/80 break-all">
                    {Object.entries(e.details)
                      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                      .join(" ")}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
