"use client"

import { useEffect, useRef, useState } from "react"
import { Languages, Loader2, Mic, Redo2, Sparkles, Undo2 } from "lucide-react"
import { cn } from "@/lib/utils"

export const CONSTRUCTION_SPEECH_LANGUAGES = [
  { code: "ar-SA", label: "العربية" },
  { code: "en-US", label: "English" },
  { code: "fa-IR", label: "فارسی" },
  { code: "ur-PK", label: "اردو" },
  { code: "hi-IN", label: "हिंदी" },
  { code: "tl-PH", label: "Tagalog" },
  { code: "ml-IN", label: "മലയാളം" },
  { code: "bn-BD", label: "বাংলা" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ps-AF", label: "پشتو" },
]

export function CompactFieldToolbar({
  value,
  onChange,
  disabled = false,
  fieldName = "Field",
}: {
  value: string
  onChange: (newValue: string) => void
  disabled?: boolean
  fieldName?: string
}) {
  const recognitionRef = useRef<any>(null)
  const baseContentRef = useRef<string>("")
  const accumulatedFinalRef = useRef<string>("")
  const countdownTimerRef = useRef<any>(null)

  const [speechLang, setSpeechLang] = useState<string>("ar-SA")
  const [isRecording, setIsRecording] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [aiLoading, setAiLoading] = useState<"translate_en" | "enhance_style" | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Undo / Redo history stack for this specific field
  const [history, setHistory] = useState<string[]>([value])
  const [historyIndex, setHistoryIndex] = useState<number>(0)
  const isUpdatingFromHistory = useRef(false)

  // Load preferred speech language from localStorage (defaults to ar-SA)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("buildsight_preferred_speech_lang_v2")
      if (saved && CONSTRUCTION_SPEECH_LANGUAGES.some((l) => l.code === saved)) {
        setSpeechLang(saved)
      }
    } catch {}
  }, [])

  // Keep history synced with external value changes when not coming from undo/redo
  useEffect(() => {
    if (isUpdatingFromHistory.current) {
      isUpdatingFromHistory.current = false
      return
    }
    setHistory((prev) => {
      if (prev[historyIndex] === value) return prev
      const updated = [...prev.slice(0, historyIndex + 1), value]
      if (updated.length > 30) updated.shift()
      setHistoryIndex(updated.length - 1)
      return updated
    })
  }, [value])

  const handleSpeechLangChange = (newLang: string) => {
    setSpeechLang(newLang)
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("buildsight_preferred_speech_lang_v2", newLang)
      } catch {}
    }
  }

  const pushValue = (newVal: string) => {
    onChange(newVal)
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevVal = history[historyIndex - 1]
      isUpdatingFromHistory.current = true
      setHistoryIndex(historyIndex - 1)
      onChange(prevVal)
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextVal = history[historyIndex + 1]
      isUpdatingFromHistory.current = true
      setHistoryIndex(historyIndex + 1)
      onChange(nextVal)
    }
  }

  const startActualRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = speechLang

        baseContentRef.current = value || ""
        accumulatedFinalRef.current = ""

        recognition.onresult = (event: any) => {
          let interimTranscript = ""
          let newFinalChunk = ""

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const chunk = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              newFinalChunk += chunk + " "
            } else {
              interimTranscript += chunk
            }
          }

          if (newFinalChunk) {
            accumulatedFinalRef.current += newFinalChunk
          }

          const spokenText = (accumulatedFinalRef.current + interimTranscript).trim()
          if (spokenText) {
            const base = baseContentRef.current.trim()
            const updatedText = base ? `${base} ${spokenText}` : spokenText
            pushValue(updatedText)
          }
        }

        recognition.onerror = (event: any) => {
          if (event.error !== "no-speech") {
            setIsRecording(false)
          }
        }

        recognition.onend = () => {
          setIsRecording(false)
        }

        recognitionRef.current = recognition
        recognition.start()
        setIsRecording(true)
        setErrorMsg(null)
        return
      } catch (err) {
        console.warn("SpeechRecognition init error:", err)
      }
    }

    setErrorMsg("Real-time voice input requires Chrome, Edge, or Safari.")
  }

  const toggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {}
        recognitionRef.current = null
      }
      setIsRecording(false)
      return
    }

    if (countdown !== null) {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      setCountdown(null)
      return
    }

    let currentCount = 3
    setCountdown(3)

    countdownTimerRef.current = setInterval(() => {
      currentCount -= 1
      if (currentCount > 0) {
        setCountdown(currentCount)
      } else {
        clearInterval(countdownTimerRef.current)
        setCountdown(null)
        startActualRecording()
      }
    }, 750)
  }

  const handleAiAction = async (action: "translate_en" | "enhance_style") => {
    if (!value.trim()) {
      setErrorMsg(action === "translate_en" ? "Enter text first to translate." : "Enter text first to enhance.")
      return
    }

    setErrorMsg(null)
    setAiLoading(action)
    try {
      const res = await fetch("/api/ai/enhance-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: value, text: value, action }),
      })
      const data = await res.json()
      if (!res.ok || !data.resultText) {
        throw new Error(data.error || "AI generation failed.")
      }
      const cleanResult = data.resultText
        .replace(/<p[^>]*>/gi, "")
        .replace(/<\/p>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li[^>]*>/gi, "• ")
        .replace(/<\/li>/gi, "\n")
        .replace(/<h[1-6][^>]*>/gi, "")
        .replace(/<\/h[1-6]>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
      pushValue(cleanResult)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred during AI processing.")
    } finally {
      setAiLoading(null)
    }
  }

  // Cleanup timer and recognition on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {}
      }
    }
  }, [])

  return (
    <div className="flex flex-col gap-1 w-full min-w-0">
      <div className="flex flex-nowrap items-center justify-start gap-0.5 sm:gap-1 rounded-t-lg border border-b-0 bg-muted/40 px-1.5 py-1 text-xs w-full min-w-0 overflow-hidden">
        {/* Voice Input */}
        <button
          type="button"
          onClick={toggleRecording}
          disabled={disabled}
          title={
            isRecording
              ? "Recording and transcribing live (click to stop)..."
              : countdown !== null
                ? `Get ready: ${countdown} ...`
                : `Voice Input for ${fieldName}`
          }
          aria-label={`Voice Input for ${fieldName}`}
          className={cn(
            "inline-flex h-7 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50",
            isRecording && "bg-rose-600 text-white hover:bg-rose-700 animate-pulse",
            countdown !== null && "bg-amber-500 text-white hover:bg-amber-600 animate-bounce",
          )}
        >
          {countdown !== null ? (
            <span className="font-bold tabular-nums text-xs">{countdown}</span>
          ) : (
            <Mic className={cn("size-3.5", isRecording ? "text-white" : "text-rose-600 dark:text-rose-400")} />
          )}
        </button>

        {/* Compact Language Selector */}
        <select
          value={speechLang}
          onChange={(e) => handleSpeechLangChange(e.target.value)}
          disabled={disabled || isRecording || countdown !== null}
          title="Speech language for voice input"
          aria-label="Speech Language"
          className="h-7 w-[68px] sm:w-[85px] shrink-0 rounded-md border border-input bg-background px-1 text-[11px] font-semibold text-foreground outline-none hover:bg-accent cursor-pointer truncate"
        >
          {CONSTRUCTION_SPEECH_LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>

        {/* AI Construction English */}
        <button
          type="button"
          onClick={() => void handleAiAction("translate_en")}
          disabled={disabled || aiLoading !== null}
          title={`AI Construction English for ${fieldName}`}
          aria-label={`AI Construction English for ${fieldName}`}
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-1.5 hover:bg-accent disabled:opacity-50"
        >
          {aiLoading === "translate_en" ? (
            <Loader2 className="size-3.5 animate-spin text-blue-600" />
          ) : (
            <Languages className="size-3.5 text-blue-600 dark:text-blue-400" />
          )}
        </button>

        {/* AI Enhance Notes */}
        <button
          type="button"
          onClick={() => void handleAiAction("enhance_style")}
          disabled={disabled || aiLoading !== null}
          title={`AI Enhance Notes for ${fieldName}`}
          aria-label={`AI Enhance Notes for ${fieldName}`}
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-1.5 hover:bg-accent disabled:opacity-50"
        >
          {aiLoading === "enhance_style" ? (
            <Loader2 className="size-3.5 animate-spin text-purple-600" />
          ) : (
            <Sparkles className="size-3.5 text-purple-600 dark:text-purple-400" />
          )}
        </button>

        <span className="mx-0.5 h-3.5 w-px shrink-0 bg-border" />

        {/* Undo */}
        <button
          type="button"
          onClick={handleUndo}
          disabled={disabled || historyIndex <= 0}
          title="Undo"
          aria-label="Undo"
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-1.5 hover:bg-accent disabled:opacity-40"
        >
          <Undo2 className="size-3.5" />
        </button>

        {/* Redo */}
        <button
          type="button"
          onClick={handleRedo}
          disabled={disabled || historyIndex >= history.length - 1}
          title="Redo"
          aria-label="Redo"
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-1.5 hover:bg-accent disabled:opacity-40"
        >
          <Redo2 className="size-3.5" />
        </button>
      </div>

      {countdown !== null ? (
        <div className="relative z-30 my-1 flex flex-col items-center justify-center rounded-xl bg-background/90 p-4 backdrop-blur-xs border border-rose-200/80 shadow-md dark:border-rose-900/50 animate-in fade-in zoom-in-95">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-xl shadow-rose-600/30 animate-pulse">
              <span className="text-2xl font-black tabular-nums">{countdown}</span>
            </div>
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
              Get ready... Speak now!
            </p>
          </div>
        </div>
      ) : null}

      {errorMsg ? (
        <div className="bg-rose-50 px-2.5 py-1 text-[11px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {errorMsg}
        </div>
      ) : null}
    </div>
  )
}
