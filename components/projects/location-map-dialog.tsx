"use client"

import dynamic from "next/dynamic"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Crosshair, Loader2, LocateFixed, MapPin, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LocationCombobox } from "@/components/projects/location-combobox"
import { useI18n } from "@/lib/i18n"
import {
  DEFAULT_MAP_CENTER,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL,
} from "@/lib/locations/config"
import { getLocationLabels } from "@/lib/locations/labels"
import {
  coordinateLabel,
  hasCoordinates,
  type LocationSuggestion,
  type ProjectLocationValue,
} from "@/lib/locations/types"
import type { MapCenterRequest, MapPoint } from "@/components/projects/location-map-canvas"

const DynamicLocationMapCanvas = dynamic(
  () => import("@/components/projects/location-map-canvas").then((module) => module.LocationMapCanvas),
  { ssr: false, loading: () => null },
)

type MapErrorBoundaryProps = {
  resetKey: number
  onError: () => void
  children: React.ReactNode
}

type MapErrorBoundaryState = {
  failed: boolean
}

class MapErrorBoundary extends React.Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  componentDidUpdate(previousProps: MapErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false })
    }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function fallbackAddress(latitude: number, longitude: number) {
  return coordinateLabel(latitude, longitude)
}

export function LocationMapDialog({
  open,
  onOpenChange,
  value,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: ProjectLocationValue
  onConfirm: (value: ProjectLocationValue) => void
}) {
  const { locale } = useI18n()
  const labels = getLocationLabels(locale)
  const currentValueRef = useRef(value)
  const openRef = useRef(open)
  const reverseSequence = useRef(0)
  const reverseControllerRef = useRef<AbortController | null>(null)
  const centerRequestId = useRef(0)
  const [mapAttempt, setMapAttempt] = useState(0)
  const [mapSession, setMapSession] = useState(0)
  const [searchValue, setSearchValue] = useState("")
  const [draft, setDraft] = useState<ProjectLocationValue>(value)
  const [centerRequest, setCenterRequest] = useState<MapCenterRequest | null>(null)
  const [mapState, setMapState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [reverseState, setReverseState] = useState<"idle" | "loading" | "error">("idle")
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    currentValueRef.current = value
  }, [value])

  useEffect(() => {
    openRef.current = open
    reverseSequence.current += 1
    reverseControllerRef.current?.abort()
    reverseControllerRef.current = null

    if (!open) {
      setMapState("idle")
      setCenterRequest(null)
      return
    }

    setDraft(value)
    setSearchValue("")
    setMessage(null)
    setReverseState("idle")
    setLocating(false)
    setMapState("loading")
    setMapSession((session) => session + 1)
  }, [open, value])

  useEffect(() => {
    if (!open || mapState !== "loading") return
    const timeout = window.setTimeout(() => {
      setMapState((current) => (current === "loading" ? "error" : current))
    }, 10_000)
    return () => window.clearTimeout(timeout)
  }, [mapSession, mapState, open])

  const reverseGeocode = useCallback(
    async (latitude: number, longitude: number, source: ProjectLocationValue["source"]) => {
      const sequence = ++reverseSequence.current
      reverseControllerRef.current?.abort()
      const controller = new AbortController()
      reverseControllerRef.current = controller

      setReverseState("loading")
      setMessage(null)
      setDraft((current) => ({
        ...current,
        latitude,
        longitude,
        address: fallbackAddress(latitude, longitude),
        verified: true,
        source,
      }))

      try {
        const response = await fetch(
          `/api/locations?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&lang=${locale}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
        )
        if (!response.ok) throw new Error("Reverse geocoding failed")
        const payload = (await response.json()) as { results?: LocationSuggestion[] }
        if (controller.signal.aborted || sequence !== reverseSequence.current || !openRef.current) return

        const match = payload.results?.[0]
        setDraft((current) => ({
          ...current,
          latitude,
          longitude,
          address: match?.label || fallbackAddress(latitude, longitude),
          verified: true,
          source,
        }))
        setReverseState(match ? "idle" : "error")
        if (!match) setMessage(labels.addressUnavailable)
      } catch {
        if (controller.signal.aborted || sequence !== reverseSequence.current || !openRef.current) return
        setReverseState("error")
        setMessage(labels.reverseGeocodeError)
      }
    },
    [labels.addressUnavailable, labels.reverseGeocodeError, locale],
  )

  const placeMarker = useCallback(
    (
      latitude: number,
      longitude: number,
      options?: { center?: boolean; reverse?: boolean; source?: ProjectLocationValue["source"] },
    ) => {
      const source = options?.source ?? "map"
      const shouldCenter = options?.center !== false
      const shouldReverse = options?.reverse !== false

      setDraft((current) => ({
        ...current,
        latitude,
        longitude,
        verified: true,
        source,
      }))

      if (shouldCenter) {
        centerRequestId.current += 1
        setCenterRequest({ latitude, longitude, requestId: centerRequestId.current })
      }

      if (shouldReverse) void reverseGeocode(latitude, longitude, source)
      else {
        reverseSequence.current += 1
        setReverseState("idle")
      }
    },
    [reverseGeocode],
  )

  const initialMapView = useMemo(() => {
    const initialValue = currentValueRef.current
    return hasCoordinates(initialValue)
      ? {
          center: { latitude: initialValue.latitude, longitude: initialValue.longitude },
          zoom: 15,
        }
      : {
          center: {
            latitude: DEFAULT_MAP_CENTER.latitude,
            longitude: DEFAULT_MAP_CENTER.longitude,
          },
          zoom: DEFAULT_MAP_CENTER.zoom,
        }
  }, [mapSession])

  const markerPoint = useMemo<MapPoint | null>(
    () =>
      hasCoordinates(draft)
        ? { latitude: draft.latitude, longitude: draft.longitude }
        : null,
    [draft],
  )

  const handleMapReady = useCallback(() => {
    if (openRef.current) setMapState("ready")
  }, [])

  const handleMapError = useCallback(() => {
    if (openRef.current) setMapState("error")
  }, [])

  const handleTileError = useCallback(() => {
    if (openRef.current) setMessage((current) => current ?? labels.mapError)
  }, [labels.mapError])

  const handleMapSelect = useCallback(
    (point: MapPoint) => {
      placeMarker(point.latitude, point.longitude, { center: true, source: "map" })
    },
    [placeMarker],
  )

  const handleMarkerMove = useCallback(
    (point: MapPoint) => {
      placeMarker(point.latitude, point.longitude, { center: false, source: "map" })
    },
    [placeMarker],
  )

  function selectSearchResult(suggestion: LocationSuggestion) {
    setSearchValue(suggestion.label)
    setDraft({
      address: suggestion.label,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      verified: true,
      source: "map",
    })
    placeMarker(suggestion.latitude, suggestion.longitude, { reverse: false, source: "map" })
  }

  function useCurrentLocation() {
    setMessage(null)
    if (!navigator.geolocation) {
      setMessage(labels.geolocationDenied)
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!openRef.current) return
        setLocating(false)
        placeMarker(position.coords.latitude, position.coords.longitude, { source: "current-location" })
      },
      () => {
        if (!openRef.current) return
        setLocating(false)
        setMessage(labels.geolocationDenied)
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  }

  function retryMap() {
    setMessage(null)
    setMapState("loading")
    if (hasCoordinates(draft)) {
      centerRequestId.current += 1
      setCenterRequest({
        latitude: draft.latitude,
        longitude: draft.longitude,
        requestId: centerRequestId.current,
      })
    }
    setMapAttempt((attempt) => attempt + 1)
    setMapSession((session) => session + 1)
  }

  const canConfirm = hasCoordinates(draft)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[1000] bg-black/35"
        className="z-[1001] flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden p-4 sm:h-[min(92dvh,52rem)] sm:p-5"
        style={{ width: "min(94vw, 68rem)", maxWidth: "68rem" }}
      >
        <DialogHeader className="shrink-0 pe-8">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            {labels.mapTitle}
          </DialogTitle>
          <DialogDescription>{labels.mapDescription}</DialogDescription>
        </DialogHeader>

        <div className="grid shrink-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <LocationCombobox
            id="map-location-search"
            value={searchValue}
            onValueChange={setSearchValue}
            onSelect={selectSearchResult}
            placeholder={labels.mapSearchPlaceholder}
            ariaLabel={labels.mapSearchPlaceholder}
          />
          <Button type="button" variant="outline" className="h-10" onClick={useCurrentLocation} disabled={locating}>
            {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
            {locating ? labels.locating : labels.useCurrentLocation}
          </Button>
        </div>

        <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pe-1 sm:gap-4">
          <div
            role="region"
            aria-label={labels.mapTitle}
            tabIndex={0}
            className="relative isolate h-[18rem] min-h-[18rem] w-full min-w-0 shrink-0 overflow-hidden rounded-xl border bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-[22rem] sm:min-h-[22rem] lg:h-[26rem] lg:min-h-[26rem]"
          >
            {open && (
              <MapErrorBoundary key={`boundary-${mapSession}-${mapAttempt}`} resetKey={mapSession + mapAttempt} onError={handleMapError}>
                <DynamicLocationMapCanvas
                  key={`map-${mapSession}-${mapAttempt}`}
                  initialCenter={initialMapView.center}
                  initialZoom={initialMapView.zoom}
                  marker={markerPoint}
                  centerRequest={centerRequest}
                  tileUrl={MAP_TILE_URL}
                  tileAttribution={MAP_TILE_ATTRIBUTION}
                  markerTitle={labels.selectedLocation}
                  onSelect={handleMapSelect}
                  onMarkerMove={handleMarkerMove}
                  onReady={handleMapReady}
                  onTileError={handleTileError}
                />
              </MapErrorBoundary>
            )}
            {mapState !== "ready" && (
              <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-background/92 p-6 text-center">
                {mapState === "error" ? (
                  <div className="max-w-md space-y-3">
                    <MapPin className="mx-auto size-7 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground text-pretty">{labels.mapError}</p>
                    <Button type="button" variant="outline" size="sm" onClick={retryMap}>
                      <RefreshCw className="size-4" />
                      {locale === "ar" ? "إعادة المحاولة" : "Try again"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {labels.mapLoading}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-3">
            <div className="grid shrink-0 gap-3 rounded-xl border bg-muted/30 p-4 md:grid-cols-[minmax(0,1fr)_18rem] md:items-center">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{labels.selectedLocation}</p>
                <p className="mt-1.5 text-sm font-medium text-pretty">
                  {draft.address || (canConfirm ? fallbackAddress(draft.latitude, draft.longitude) : labels.markerHelp)}
                </p>
                {reverseState === "loading" && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    {labels.resolving}
                  </p>
                )}
                {message && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{message}</p>}
              </div>
              {canConfirm && (
                <div className="rounded-lg bg-background px-3 py-2.5 text-xs tabular-nums shadow-xs" dir="ltr">
                  <span className="block text-muted-foreground">{labels.latitude}: {draft.latitude.toFixed(6)}</span>
                  <span className="mt-1 block text-muted-foreground">{labels.longitude}: {draft.longitude.toFixed(6)}</span>
                </div>
              )}
            </div>

            <p className="flex shrink-0 items-start gap-2 rounded-xl border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
              <Crosshair className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{labels.markerHelp}</span>
            </p>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!hasCoordinates(draft)) return
              onConfirm({
                ...draft,
                address: draft.address || fallbackAddress(draft.latitude, draft.longitude),
                verified: true,
              })
              onOpenChange(false)
            }}
          >
            <MapPin className="size-4" />
            {labels.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
