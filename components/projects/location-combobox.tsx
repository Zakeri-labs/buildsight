"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Loader2, MapPin, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"
import {
  LOCATION_SEARCH_DEBOUNCE_MS,
  LOCATION_SEARCH_MIN_CHARACTERS,
} from "@/lib/locations/config"
import { getLocationLabels } from "@/lib/locations/labels"
import type { LocationSuggestion } from "@/lib/locations/types"
import { cn } from "@/lib/utils"

type SearchState = "idle" | "loading" | "success" | "empty" | "error"

type LocationComboboxProps = {
  id?: string
  value: string
  onValueChange: (value: string) => void
  onSelect: (suggestion: LocationSuggestion) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  autoFocus?: boolean
  describedBy?: string
  ariaLabel?: string
  suppressSearch?: boolean
}

const queryCache = new Map<string, LocationSuggestion[]>()

export function LocationCombobox({
  id,
  value,
  onValueChange,
  onSelect,
  placeholder,
  disabled,
  className,
  autoFocus,
  describedBy,
  ariaLabel,
  suppressSearch = false,
}: LocationComboboxProps) {
  const generatedId = useId()
  const inputId = id ?? `location-search-${generatedId}`
  const listboxId = `${inputId}-results`
  const { locale } = useI18n()
  const labels = getLocationLabels(locale)
  const [results, setResults] = useState<LocationSuggestion[]>([])
  const [state, setState] = useState<SearchState>("idle")
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const selectedLabelRef = useRef("")
  const requestSequence = useRef(0)

  useEffect(() => {
    const query = value.trim()
    const sequence = ++requestSequence.current

    if (suppressSearch) {
      selectedLabelRef.current = query
      setResults([])
      setOpen(false)
      setState("idle")
      setActiveIndex(-1)
      return
    }

    if (query === selectedLabelRef.current) {
      setOpen(false)
      setState("idle")
      return
    }

    if (query.length < LOCATION_SEARCH_MIN_CHARACTERS) {
      setResults([])
      setState("idle")
      setOpen(false)
      setActiveIndex(-1)
      return
    }

    const cacheKey = `${locale}:${query.toLocaleLowerCase()}`
    const cached = queryCache.get(cacheKey)
    if (cached) {
      setResults(cached)
      setState(cached.length ? "success" : "empty")
      setOpen(true)
      setActiveIndex(cached.length ? 0 : -1)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setState("loading")
      setOpen(true)
      try {
        const response = await fetch(`/api/locations?q=${encodeURIComponent(query)}&lang=${locale}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        })
        if (!response.ok) throw new Error("Search failed")
        const payload = (await response.json()) as { results?: LocationSuggestion[] }
        if (sequence !== requestSequence.current) return
        const nextResults = payload.results ?? []
        if (queryCache.size >= 100) {
          const oldest = queryCache.keys().next().value
          if (oldest) queryCache.delete(oldest)
        }
        queryCache.set(cacheKey, nextResults)
        setResults(nextResults)
        setState(nextResults.length ? "success" : "empty")
        setActiveIndex(nextResults.length ? 0 : -1)
      } catch (error) {
        if (controller.signal.aborted || sequence !== requestSequence.current) return
        setResults([])
        setState("error")
        setActiveIndex(-1)
      }
    }, LOCATION_SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [locale, suppressSearch, value])

  function choose(suggestion: LocationSuggestion) {
    selectedLabelRef.current = suggestion.label
    onValueChange(suggestion.label)
    onSelect(suggestion)
    setOpen(false)
    setState("idle")
    setActiveIndex(-1)
  }

  function handleInput(nextValue: string) {
    if (nextValue !== selectedLabelRef.current) selectedLabelRef.current = ""
    onValueChange(nextValue)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (!open && value.trim().length >= LOCATION_SEARCH_MIN_CHARACTERS) setOpen(true)
      if (results.length) {
        event.preventDefault()
        setActiveIndex((current) => (current + 1) % results.length)
      }
      return
    }
    if (event.key === "ArrowUp" && results.length) {
      event.preventDefault()
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1))
      return
    }
    if (event.key === "Enter" && open && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault()
      choose(results[activeIndex])
      return
    }
    if (event.key === "Escape") {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  const showDropdown = open && value.trim().length >= LOCATION_SEARCH_MIN_CHARACTERS

  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute inset-inline-start-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={inputId}
        value={value}
        onChange={(event) => handleInput(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value.trim().length >= LOCATION_SEARCH_MIN_CHARACTERS && state !== "idle") setOpen(true)
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={
          showDropdown && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        aria-busy={state === "loading"}
        placeholder={placeholder ?? labels.placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="h-10 ps-9 pe-9"
      />
      {state === "loading" && (
        <Loader2
          aria-hidden="true"
          className="pointer-events-none absolute inset-inline-end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      )}

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          aria-live="polite"
          className="absolute z-[80] mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          {state === "loading" && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {labels.searchLoading}
            </div>
          )}
          {state === "empty" && (
            <p className="px-3 py-3 text-sm text-muted-foreground">{labels.searchEmpty}</p>
          )}
          {state === "error" && (
            <p className="px-3 py-3 text-sm text-destructive text-pretty">{labels.searchError}</p>
          )}
          {state === "success" &&
            results.map((result, index) => (
              <button
                key={result.id}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(result)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-start transition-colors",
                  activeIndex === index ? "bg-muted" : "hover:bg-muted/70",
                )}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-5 text-pretty">{result.label}</span>
                  <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                    {result.kind.replaceAll("_", " ")}
                  </span>
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
