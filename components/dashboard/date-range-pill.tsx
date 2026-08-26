"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Calendar, Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { DashboardDateRangePreset } from "@/lib/dashboard/date-range"

type DateRangePillProps = {
  preset: DashboardDateRangePreset
  label: string
  startDate: string | null
  endDate: string | null
  ariaLabel?: string
  dialogDescription?: string
  showAllTime?: boolean
}

const DEFAULT_PRESET_OPTIONS: { value: Exclude<DashboardDateRangePreset, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "all", label: "All Time" },
]

export function DateRangePill({
  preset,
  label,
  startDate,
  endDate,
  ariaLabel = `Dashboard date range: ${label}`,
  dialogDescription = "Choose inclusive calendar dates for Dashboard activity.",
  showAllTime = true,
}: DateRangePillProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [customOpen, setCustomOpen] = useState(false)
  const [from, setFrom] = useState(startDate ?? "")
  const [to, setTo] = useState(endDate ?? "")
  const [customError, setCustomError] = useState<string | null>(null)

  const presetOptions = showAllTime
    ? DEFAULT_PRESET_OPTIONS
    : DEFAULT_PRESET_OPTIONS.filter((option) => option.value !== "all")

  useEffect(() => {
    if (preset === "custom") {
      setFrom(startDate ?? "")
      setTo(endDate ?? "")
    }
  }, [preset, startDate, endDate])

  function navigateToRange(nextPreset: Exclude<DashboardDateRangePreset, "custom">) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("range", nextPreset)
    params.delete("from")
    params.delete("to")
    params.delete("page")
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function openCustomRange() {
    setCustomError(null)
    setFrom(startDate ?? "")
    setTo(endDate ?? "")
    setCustomOpen(true)
  }

  function applyCustomRange() {
    if (!from || !to) {
      setCustomError("Choose both From and To dates.")
      return
    }
    if (from > to) {
      setCustomError("From date must be on or before To date.")
      return
    }

    const params = new URLSearchParams(searchParams.toString())
    params.set("range", "custom")
    params.set("from", from)
    params.set("to", to)
    params.delete("page")
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    setCustomOpen(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={ariaLabel}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Calendar className="size-4 text-muted-foreground" />
              <span>{label}</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          {presetOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => navigateToRange(option.value)}
              className="justify-between"
            >
              <span>{option.label}</span>
              {preset === option.value ? <Check className="size-4 text-primary" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={openCustomRange} className="justify-between">
            <span>Custom Range</span>
            {preset === "custom" ? <Check className="size-4 text-primary" /> : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom Range</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="dashboard-range-from">From</Label>
              <Input
                id="dashboard-range-from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value)
                  setCustomError(null)
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dashboard-range-to">To</Label>
              <Input
                id="dashboard-range-to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value)
                  setCustomError(null)
                }}
              />
            </div>
          </div>

          {customError ? <p className="text-sm text-destructive">{customError}</p> : null}

          <DialogFooter className="sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyCustomRange}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
