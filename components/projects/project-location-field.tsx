"use client"

import { useId, useState } from "react"
import { CheckCircle2, Map, MapPin, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { LocationCombobox } from "@/components/projects/location-combobox"
import { LocationMapDialog } from "@/components/projects/location-map-dialog"
import { useI18n } from "@/lib/i18n"
import { LOCATION_SEARCH_MIN_CHARACTERS } from "@/lib/locations/config"
import { getLocationLabels } from "@/lib/locations/labels"
import {
  EMPTY_PROJECT_LOCATION,
  hasCoordinates,
  type LocationSuggestion,
  type ProjectLocationValue,
} from "@/lib/locations/types"

export function ProjectLocationField({
  value,
  onChange,
  id,
  disabled,
}: {
  value: ProjectLocationValue
  onChange: (value: ProjectLocationValue) => void
  id?: string
  disabled?: boolean
}) {
  const generatedId = useId()
  const inputId = id ?? `project-location-${generatedId}`
  const helpId = `${inputId}-help`
  const { locale } = useI18n()
  const labels = getLocationLabels(locale)
  const [mapOpen, setMapOpen] = useState(false)

  function handleManualValue(address: string) {
    onChange({
      address,
      latitude: null,
      longitude: null,
      verified: false,
      source: "manual",
    })
  }

  function handleSuggestion(suggestion: LocationSuggestion) {
    onChange({
      address: suggestion.label,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      verified: true,
      source: "autocomplete",
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={inputId}>{labels.location}</Label>
        {(value.address || hasCoordinates(value)) && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_PROJECT_LOCATION)}
            disabled={disabled}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="size-3" aria-hidden="true" />
            {labels.clearLocation}
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <LocationCombobox
          id={inputId}
          value={value.address}
          onValueChange={handleManualValue}
          onSelect={handleSuggestion}
          disabled={disabled}
          describedBy={helpId}
          suppressSearch={value.verified}
        />
        <Button
          type="button"
          variant="outline"
          className="h-10 bg-transparent"
          onClick={() => setMapOpen(true)}
          disabled={disabled}
        >
          <Map className="size-4" aria-hidden="true" />
          {labels.selectOnMap}
        </Button>
      </div>

      <div id={helpId} className="space-y-1">
        {value.verified && hasCoordinates(value) ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/20">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              {labels.verified}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground" dir="ltr">
              <MapPin className="size-3.5" aria-hidden="true" />
              {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
            </span>
          </div>
        ) : !value.address ? (
          <p className="text-xs text-muted-foreground">
            {labels.searchHint.replace("{count}", String(LOCATION_SEARCH_MIN_CHARACTERS))}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <MapPin className="size-3.5" aria-hidden="true" />
            {labels.unverified}
          </p>
        )}
      </div>

      <LocationMapDialog
        open={mapOpen}
        onOpenChange={setMapOpen}
        value={value}
        onConfirm={onChange}
      />
    </div>
  )
}
