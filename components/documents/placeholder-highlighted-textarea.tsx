"use client"

import { useEffect, useRef, type ChangeEvent, type UIEvent } from "react"
import { cn } from "@/lib/utils"

export function PlaceholderHighlightedTextarea({
  id,
  value,
  maxLength = 100000,
  disabled = false,
  onChange,
  placeholder,
  className,
}: {
  id?: string
  value: string
  maxLength?: number
  disabled?: boolean
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  className?: string
}) {
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const handleScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    if (backdropRef.current) {
      backdropRef.current.scrollTop = e.currentTarget.scrollTop
      backdropRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
  }

  // Keep scroll synchronized if value changes programmatically
  useEffect(() => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [value])

  // Split text by bracketed placeholders like [claimed amount] or [date]
  const renderHighlightedBackdrop = (text: string) => {
    if (!text) return null

    // Regex matching complete bracketed tokens: [something]
    const parts = text.split(/(\[[^\]\n]+\])/g)
    const endsWithNewline = text.endsWith("\n")

    return (
      <>
        {parts.map((part, index) => {
          const isPlaceholder = part.startsWith("[") && part.endsWith("]")
          if (isPlaceholder) {
            return (
              <span
                key={index}
                className="rounded-md bg-blue-100/90 px-0.5 py-0.5 text-transparent border border-blue-300/80 dark:bg-blue-950/80 dark:border-blue-800/80 shadow-2xs"
              >
                {part}
              </span>
            )
          }
          return <span key={index}>{part}</span>
        })}
        {endsWithNewline ? "\n\u200b" : null}
      </>
    )
  }

  return (
    <div className="relative w-full min-w-0 flex flex-col">
      {/* Synchronized Mirrored Backdrop Layer for Visual Highlight */}
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden px-4 py-3 font-mono text-sm leading-6 whitespace-pre-wrap break-words text-transparent select-none z-0"
      >
        {renderHighlightedBackdrop(value)}
      </div>

      {/* Real Plain Text Textarea */}
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={onChange}
        onScroll={handleScroll}
        placeholder={placeholder}
        className={cn(
          "relative z-10 min-h-48 w-full min-w-0 resize-y bg-transparent px-4 py-3 font-mono text-sm leading-6 text-foreground outline-none transition-shadow placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-70",
          className,
        )}
      />
    </div>
  )
}
