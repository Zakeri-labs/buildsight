"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  loadProjectOwnerVisitors,
  type ProjectOwnerVisitorOption,
} from "@/lib/actions/project-owner-visitors"
import { cn } from "@/lib/utils"

type VisitorLoadResult = Awaited<ReturnType<typeof loadProjectOwnerVisitors>>

export function ProjectOwnerVisitorSelector({
  supervisingOrgId,
  selectedVisitor,
  onSelectVisitor,
  onManualEntry,
  disabled,
  labels,
}: {
  supervisingOrgId: string
  selectedVisitor: ProjectOwnerVisitorOption | null
  onSelectVisitor: (visitor: ProjectOwnerVisitorOption) => void
  onManualEntry: () => void
  disabled?: boolean
  labels: {
    label: string
    placeholder: string
    manual: string
    invite: string
    search: string
    loading: string
    empty: string
    retry: string
  }
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<ProjectOwnerVisitorOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const inFlightRef = useRef<Promise<VisitorLoadResult> | null>(null)

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en")
    if (!normalized) return options
    return options.filter((visitor) =>
      [visitor.name, visitor.email, visitor.phone, visitor.organizationName]
        .join(" ")
        .toLocaleLowerCase("en")
        .includes(normalized),
    )
  }, [options, query])

  async function refreshVisitors() {
    let request = inFlightRef.current
    if (!request) {
      setLoading(true)
      setLoadError(null)
      request = loadProjectOwnerVisitors({ supervisingOrgId })
      inFlightRef.current = request
    }

    try {
      const result = await request
      if (result.ok) {
        setOptions(result.data)
        setLoadError(null)
      } else {
        setLoadError(result.error)
      }
    } finally {
      if (inFlightRef.current === request) {
        inFlightRef.current = null
        setLoading(false)
      }
    }
  }

  function handleTriggerClick() {
    if (disabled) return
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    void refreshVisitors()
  }

  return (
    <section className="rounded-2xl border bg-muted/10 p-4 sm:p-5" aria-labelledby="existing-visitor-selector-label">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label id="existing-visitor-selector-label">{labels.label}</Label>
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-between bg-transparent px-3 font-normal"
              onClick={handleTriggerClick}
              disabled={disabled}
              aria-expanded={open}
              aria-controls="existing-visitor-selector-panel"
            >
              <span className={cn("min-w-0 truncate text-start", !selectedVisitor && "text-muted-foreground")}>
                {selectedVisitor
                  ? `${selectedVisitor.name}${selectedVisitor.email ? ` — ${selectedVisitor.email}` : ""}`
                  : labels.placeholder}
              </span>
              {loading ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <span aria-hidden="true">⌄</span>}
            </Button>

            {open ? (
              <div
                id="existing-visitor-selector-panel"
                className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
              >
                <div className="border-b p-2">
                  <Input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={labels.search}
                    disabled={disabled}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setOpen(false)
                    }}
                  />
                </div>

                <div className="max-h-64 overflow-y-auto overscroll-contain p-1.5">
                  <button
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-start text-sm font-medium transition-colors hover:bg-muted"
                    onClick={() => {
                      onManualEntry()
                      setOpen(false)
                      setQuery("")
                    }}
                  >
                    {labels.manual}
                  </button>

                  {loading && options.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-5 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      {labels.loading}
                    </div>
                  ) : filteredOptions.length > 0 ? (
                    filteredOptions.map((visitor) => (
                      <button
                        key={visitor.id}
                        type="button"
                        className="w-full rounded-md px-3 py-2 text-start transition-colors hover:bg-muted"
                        onClick={() => {
                          onSelectVisitor(visitor)
                          setOpen(false)
                          setQuery("")
                        }}
                      >
                        <span className="block truncate text-sm font-medium">{visitor.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[visitor.email, visitor.phone].filter(Boolean).join(" · ") || visitor.organizationName}
                        </span>
                        {visitor.organizationName ? (
                          <span className="block truncate text-xs text-muted-foreground/80">{visitor.organizationName}</span>
                        ) : null}
                      </button>
                    ))
                  ) : !loading ? (
                    <p className="px-3 py-5 text-center text-sm text-muted-foreground">{labels.empty}</p>
                  ) : null}
                </div>

                {loadError ? (
                  <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
                    <p className="min-w-0 text-xs text-destructive">{loadError}</p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void refreshVisitors()} disabled={loading}>
                      {labels.retry}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <Button
          variant="outline"
          className="h-10 bg-transparent"
          disabled={disabled}
          render={
            <Link href="/users?tab=organizations" target="_blank" rel="noopener noreferrer">
              {labels.invite}
            </Link>
          }
        />
      </div>
    </section>
  )
}
