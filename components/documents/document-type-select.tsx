"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import {
  DOCUMENT_TYPES,
  getDocumentTypeDefinition,
  type DocumentTypeValue,
} from "@/lib/documents/document-types"
import { cn } from "@/lib/utils"

export function DocumentTypeSelect({
  id,
  value,
  onValueChange,
  disabled = false,
  required = false,
  invalid = false,
  placeholder = "Select a letter type",
  allowClear = false,
  clearLabel = "All letter types",
  className,
}: {
  id?: string
  value: DocumentTypeValue | ""
  onValueChange: (value: DocumentTypeValue | "") => void
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  placeholder?: string
  allowClear?: boolean
  clearLabel?: string
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)

  const options = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return DOCUMENT_TYPES
    return DOCUMENT_TYPES.filter((type) =>
      `${type.label} ${type.shortLabel} ${type.value.replaceAll("_", " ")}`.toLowerCase().includes(normalized),
    )
  }, [query])

  const selected = value ? getDocumentTypeDefinition(value) : null

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [])

  useEffect(() => {
    if (!open) return
    setActiveIndex(0)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (activeIndex < options.length) return
    setActiveIndex(Math.max(0, options.length - 1))
  }, [activeIndex, options.length])

  const choose = (nextValue: DocumentTypeValue | "") => {
    onValueChange(nextValue)
    setQuery("")
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 py-2 rounded-lg border border-input bg-transparent px-3 text-start text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] focus:border-ring focus:ring-3 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          invalid && "border-destructive focus:border-destructive focus:ring-destructive/20",
        )}
      >
        <span className={cn("min-w-0 leading-snug", !selected && "text-muted-foreground")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-full min-w-0 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl sm:min-w-[420px]">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveIndex(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault()
                    setOpen(false)
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault()
                    setActiveIndex((current) => Math.min(current + 1, Math.max(0, options.length - 1)))
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault()
                    setActiveIndex((current) => Math.max(current - 1, 0))
                  } else if (event.key === "Enter" && options[activeIndex]) {
                    event.preventDefault()
                    choose(options[activeIndex].value)
                  }
                }}
                placeholder="Search letter types..."
                className="h-10 w-full rounded-lg border border-input bg-background ps-9 pe-9 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    inputRef.current?.focus()
                  }}
                  aria-label="Clear search"
                  className="absolute end-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <div role="listbox" aria-label="Letter types" className="max-h-72 overflow-y-auto p-1.5">
            {allowClear && !query ? (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => choose("")}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm hover:bg-muted"
              >
                <span>{clearLabel}</span>
                {!value ? <Check className="size-4 text-primary" /> : null}
              </button>
            ) : null}

            {options.length ? options.map((type, index) => (
              <button
                key={type.value}
                type="button"
                role="option"
                aria-selected={value === type.value}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(type.value)}
                className={cn(
                  "flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm",
                  activeIndex === index ? "bg-muted" : "hover:bg-muted/70",
                )}
              >
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{type.label}</span>
                  <span className="mt-0.5 block text-xs capitalize text-muted-foreground">{type.group}</span>
                </span>
                {value === type.value ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : null}
              </button>
            )) : (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">No letter types found.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
