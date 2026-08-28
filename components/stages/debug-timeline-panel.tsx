"use client"

import { useEffect, useState } from "react"
import { Check, Copy, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  clearDiagnosticEvents,
  DEBUG_TIMELINE_EVENT,
  formatDiagnosticLogAsText,
  readDiagnosticEvents,
  type DiagnosticEvent,
} from "@/lib/stage-translations/debug-timeline"

export function DebugTimelinePanel({ responseId }: { responseId: string | null | undefined }) {
  const [events, setEvents] = useState<DiagnosticEvent[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!responseId) return
    setEvents(readDiagnosticEvents(responseId))

    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ responseId?: string }>
      if (!custom.detail?.responseId || custom.detail.responseId === responseId) {
        setEvents(readDiagnosticEvents(responseId))
      }
    }

    window.addEventListener(DEBUG_TIMELINE_EVENT, handleUpdate)
    return () => window.removeEventListener(DEBUG_TIMELINE_EVENT, handleUpdate)
  }, [responseId])

  if (!responseId) return null

  const handleCopy = async () => {
    try {
      const text = formatDiagnosticLogAsText(responseId)
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn("Failed to copy debug log", err)
    }
  }

  const handleClear = () => {
    clearDiagnosticEvents(responseId)
    setEvents([])
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 font-mono text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <span>
            Translation / PDF Debug Timeline ({events.length})
          </span>
        </button>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!events.length}
            className="h-7 text-xs gap-1"
          >
            {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
            <span>{copied ? "Copied" : "Copy Debug Log"}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={!events.length}
            className="h-7 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
          >
            <Trash2 className="size-3" />
            <span>Clear Log</span>
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 max-h-[300px] overflow-y-auto rounded border border-slate-200 bg-slate-950 p-2.5 font-mono text-[11px] leading-relaxed text-slate-200 dark:border-slate-800">
          {!events.length ? (
            <div className="text-slate-500 italic">No diagnostic events recorded yet.</div>
          ) : (
            events.map((e) => {
              const detailsStr = Object.entries(e.details)
                .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                .join(" ")
              return (
                <div key={`${e.num}-${e.time}`} className="py-0.5 whitespace-pre-wrap break-all">
                  <span className="text-emerald-400 font-bold">{e.num}</span>{" "}
                  <span className="text-slate-400">{e.time}</span>{" "}
                  <span className="text-sky-400 font-semibold">{e.name}</span>{" "}
                  <span className="text-slate-300">{detailsStr}</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
