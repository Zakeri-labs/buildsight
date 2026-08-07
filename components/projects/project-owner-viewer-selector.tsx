"use client"

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  loadProjectOwnerViewers,
  type ProjectOwnerViewerOption,
} from "@/lib/actions/project-owner-viewers"
import { cn } from "@/lib/utils"

type ViewerLoadResult = Awaited<ReturnType<typeof loadProjectOwnerViewers>>

export function ProjectOwnerViewerSelector({
  supervisingOrgId,
  selectedViewer,
  onSelectViewer,
  onManualEntry,
  disabled,
  labels,
}: {
  supervisingOrgId: string
  selectedViewer: ProjectOwnerViewerOption | null
  onSelectViewer: (viewer: ProjectOwnerViewerOption) => void
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
    pending: string
  }
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<ProjectOwnerViewerOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const inFlightRef = useRef<Promise<ViewerLoadResult> | null>(null)

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en")
    if (!normalized) return options
    return options.filter((viewer) =>
      [viewer.name, viewer.email, viewer.phone]
        .join(" ")
        .toLocaleLowerCase("en")
        .includes(normalized),
    )
  }, [options, query])

  async function refreshViewers() {
    let request = inFlightRef.current
    if (!request) {
      setLoading(true)
      setLoadError(null)
      request = loadProjectOwnerViewers({ supervisingOrgId })
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
    void refreshViewers()
  }

  return (
    <section className="rounded-2xl border bg-muted/10 p-4 sm:p-5" aria-labelledby="existing-viewer-selector-label">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label id="existing-viewer-selector-label">{labels.label}</Label>
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-between bg-transparent px-3 font-normal"
              onClick={handleTriggerClick}
              disabled={disabled}
              aria-expanded={open}
              aria-controls="existing-viewer-selector-panel"
            >
              <span className={cn("flex min-w-0 items-center gap-2 truncate text-start", !selectedViewer && "text-muted-foreground")}>
                <span className="truncate">
                  {selectedViewer
                    ? `${selectedViewer.name}${selectedViewer.email && selectedViewer.email !== selectedViewer.name ? ` — ${selectedViewer.email}` : ""}`
                    : labels.placeholder}
                </span>
                {selectedViewer?.source === "pending" ? <Badge variant="secondary">{labels.pending}</Badge> : null}
              </span>
              {loading ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <span aria-hidden="true">⌄</span>}
            </Button>

            {open ? (
              <div
                id="existing-viewer-selector-panel"
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
                    filteredOptions.map((viewer) => (
                      <button
                        key={`${viewer.source}:${viewer.id}`}
                        type="button"
                        className="w-full rounded-md px-3 py-2 text-start transition-colors hover:bg-muted"
                        onClick={() => {
                          onSelectViewer(viewer)
                          setOpen(false)
                          setQuery("")
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{viewer.name}</span>
                          {viewer.source === "pending" ? <Badge variant="secondary">{labels.pending}</Badge> : null}
                        </span>
                        {viewer.email && viewer.email !== viewer.name ? (
                          <span className="block truncate text-xs text-muted-foreground">{viewer.email}</span>
                        ) : null}
                        {viewer.phone ? (
                          <span className="block truncate text-xs text-muted-foreground/80">{viewer.phone}</span>
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
                    <Button type="button" variant="ghost" size="sm" onClick={() => void refreshViewers()} disabled={loading}>
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
            <Link href="/users?tab=members" target="_blank" rel="noopener noreferrer">
              {labels.invite}
            </Link>
          }
        />
      </div>
    </section>
  )
}
