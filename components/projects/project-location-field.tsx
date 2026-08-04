"use client"

import dynamic from "next/dynamic"
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import {
  CheckCircle2,
  Loader2,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LocationCombobox } from "@/components/projects/location-combobox"
import type { MapCenterRequest, MapPoint } from "@/components/projects/location-map-canvas"
import { useI18n } from "@/lib/i18n"
import {
  DEFAULT_MAP_CENTER,
  LOCATION_SEARCH_MIN_CHARACTERS,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL,
} from "@/lib/locations/config"
import { getLocationLabels } from "@/lib/locations/labels"
import {
  coordinateLabel,
  EMPTY_PROJECT_LOCATION,
  hasCoordinates,
  locationAreaName,
  type LocationSuggestion,
  type ProjectLocationValue,
} from "@/lib/locations/types"
import { cn } from "@/lib/utils"

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

function samePoint(
  value: ProjectLocationValue,
  latitude: number,
  longitude: number,
) {
  return (
    hasCoordinates(value) &&
    Math.abs(value.latitude - latitude) < 0.0000001 &&
    Math.abs(value.longitude - longitude) < 0.0000001
  )
}

export function ProjectLocationField({
  value,
  onChange,
  id,
  disabled,
  children,
  areaField,
  contentAfterAreaField,
}: {
  value: ProjectLocationValue
  onChange: (value: ProjectLocationValue) => void
  id?: string
  disabled?: boolean
  children?: React.ReactNode
  areaField?: {
    value: string
    onChange: (value: string) => void
    label: string
    placeholder?: string
  }
  contentAfterAreaField?: React.ReactNode
}) {
  const generatedId = useId()
  const inputId = id ?? `project-location-${generatedId}`
  const helpId = `${inputId}-help`
  const { locale } = useI18n()
  const labels = getLocationLabels(locale)
  const valueRef = useRef(value)
  const mapShellRef = useRef<HTMLDivElement | null>(null)
  const reverseSequence = useRef(0)
  const reverseControllerRef = useRef<AbortController | null>(null)
  const centerRequestId = useRef(0)
  const previousPointRef = useRef<string | null>(null)
  const [centerRequest, setCenterRequest] = useState<MapCenterRequest | null>(null)
  const [mapAttempt, setMapAttempt] = useState(0)
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading")
  const [reverseState, setReverseState] = useState<"idle" | "loading" | "error">("idle")
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false)
  const [resizeRequest, setResizeRequest] = useState(0)
  const isFullscreen = nativeFullscreen || fallbackFullscreen

  const requestMapResize = useCallback(() => {
    setResizeRequest((request) => request + 1)
  }, [])

  const commitValue = useCallback(
    (nextValue: ProjectLocationValue) => {
      valueRef.current = nextValue
      onChange(nextValue)
    },
    [onChange],
  )

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    if (!hasCoordinates(value)) {
      previousPointRef.current = null
      return
    }

    const pointKey = `${value.latitude.toFixed(7)}:${value.longitude.toFixed(7)}`
    if (pointKey === previousPointRef.current) return
    previousPointRef.current = pointKey
    centerRequestId.current += 1
    setCenterRequest({
      latitude: value.latitude,
      longitude: value.longitude,
      requestId: centerRequestId.current,
    })
  }, [value.latitude, value.longitude])

  useEffect(() => {
    if (mapState !== "loading") return
    const timeout = window.setTimeout(() => {
      setMapState((current) => (current === "loading" ? "error" : current))
    }, 10_000)
    return () => window.clearTimeout(timeout)
  }, [mapAttempt, mapState])

  useEffect(
    () => () => {
      reverseSequence.current += 1
      reverseControllerRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    function handleFullscreenChange() {
      setNativeFullscreen(document.fullscreenElement === mapShellRef.current)
      window.requestAnimationFrame(requestMapResize)
      window.setTimeout(requestMapResize, 120)
      window.setTimeout(requestMapResize, 360)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [requestMapResize])

  useEffect(() => {
    if (!fallbackFullscreen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setFallbackFullscreen(false)
      window.requestAnimationFrame(requestMapResize)
    }

    window.addEventListener("keydown", handleEscape, true)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleEscape, true)
    }
  }, [fallbackFullscreen, requestMapResize])

  useEffect(() => {
    if (!isFullscreen) return
    window.requestAnimationFrame(requestMapResize)
    const first = window.setTimeout(requestMapResize, 120)
    const second = window.setTimeout(requestMapResize, 360)
    return () => {
      window.clearTimeout(first)
      window.clearTimeout(second)
    }
  }, [isFullscreen, requestMapResize])

  const initialMapView = useMemo(() => {
    if (hasCoordinates(value)) {
      return {
        center: { latitude: value.latitude, longitude: value.longitude },
        zoom: 15,
      }
    }

    return {
      center: {
        latitude: DEFAULT_MAP_CENTER.latitude,
        longitude: DEFAULT_MAP_CENTER.longitude,
      },
      zoom: DEFAULT_MAP_CENTER.zoom,
    }
    // The Leaflet map reads this only when its keyed instance is created.
    // Current value changes are handled through centerRequest above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapAttempt])

  const markerPoint = useMemo<MapPoint | null>(
    () =>
      hasCoordinates(value)
        ? { latitude: value.latitude, longitude: value.longitude }
        : null,
    [value],
  )

  const requestCenter = useCallback((latitude: number, longitude: number) => {
    centerRequestId.current += 1
    setCenterRequest({ latitude, longitude, requestId: centerRequestId.current })
  }, [])

  const cancelReverseLookup = useCallback(() => {
    reverseSequence.current += 1
    reverseControllerRef.current?.abort()
    reverseControllerRef.current = null
    setReverseState("idle")
    setMessage(null)
  }, [])

  const reverseGeocode = useCallback(
    async (latitude: number, longitude: number, source: ProjectLocationValue["source"]) => {
      const sequence = ++reverseSequence.current
      reverseControllerRef.current?.abort()
      const controller = new AbortController()
      reverseControllerRef.current = controller
      const fallback = coordinateLabel(latitude, longitude)

      setReverseState("loading")
      setMessage(null)
      areaField?.onChange("")
      commitValue({
        address: fallback,
        latitude,
        longitude,
        verified: true,
        source,
      })

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
        if (controller.signal.aborted || sequence !== reverseSequence.current) return
        if (!samePoint(valueRef.current, latitude, longitude)) return

        const match = payload.results?.[0]
        areaField?.onChange(locationAreaName(match))
        commitValue({
          address: match?.label || fallback,
          latitude,
          longitude,
          verified: true,
          source,
        })
        setReverseState(match ? "idle" : "error")
        setMessage(match ? null : labels.addressUnavailable)
      } catch {
        if (controller.signal.aborted || sequence !== reverseSequence.current) return
        if (!samePoint(valueRef.current, latitude, longitude)) return
        setReverseState("error")
        setMessage(labels.reverseGeocodeError)
      }
    },
    [areaField, commitValue, labels.addressUnavailable, labels.reverseGeocodeError, locale],
  )

  const placeMarker = useCallback(
    (
      latitude: number,
      longitude: number,
      options?: { center?: boolean; source?: ProjectLocationValue["source"] },
    ) => {
      if (disabled) return
      if (options?.center !== false) requestCenter(latitude, longitude)
      void reverseGeocode(latitude, longitude, options?.source ?? "map")
    },
    [disabled, requestCenter, reverseGeocode],
  )

  function handleManualValue(address: string) {
    cancelReverseLookup()
    commitValue({
      address,
      latitude: null,
      longitude: null,
      verified: false,
      source: "manual",
    })
  }

  function handleSuggestion(suggestion: LocationSuggestion) {
    cancelReverseLookup()
    areaField?.onChange(locationAreaName(suggestion))
    commitValue({
      address: suggestion.label,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      verified: true,
      source: "autocomplete",
    })
    requestCenter(suggestion.latitude, suggestion.longitude)
  }

  function clearLocation() {
    cancelReverseLookup()
    areaField?.onChange("")
    commitValue(EMPTY_PROJECT_LOCATION)
    requestCenter(DEFAULT_MAP_CENTER.latitude, DEFAULT_MAP_CENTER.longitude)
  }

  function useCurrentLocation() {
    if (disabled) return
    setMessage(null)
    if (!navigator.geolocation) {
      setMessage(labels.geolocationDenied)
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        placeMarker(position.coords.latitude, position.coords.longitude, {
          source: "current-location",
        })
      },
      () => {
        setLocating(false)
        setMessage(labels.geolocationDenied)
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  }

  function retryMap() {
    setMessage(null)
    setMapState("loading")
    setMapAttempt((attempt) => attempt + 1)
  }

  async function toggleFullscreen() {
    if (nativeFullscreen && document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined)
      return
    }

    if (fallbackFullscreen) {
      setFallbackFullscreen(false)
      window.requestAnimationFrame(requestMapResize)
      return
    }

    const shell = mapShellRef.current
    if (shell?.requestFullscreen) {
      try {
        await shell.requestFullscreen()
        return
      } catch {
        // Fall through to the CSS fullscreen mode when the browser rejects the native API.
      }
    }

    setFallbackFullscreen(true)
    window.requestAnimationFrame(requestMapResize)
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(28rem,1.05fr)] lg:items-stretch xl:gap-6">
      <div className="min-w-0">
        {children ? <div className="h-full min-h-0">{children}</div> : null}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor={inputId}>{labels.location}</Label>
            {(value.address || hasCoordinates(value)) && (
              <button
                type="button"
                onClick={clearLocation}
                disabled={disabled}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
              >
                <X className="size-3" aria-hidden="true" />
                {labels.clearLocation}
              </button>
            )}
          </div>

          <LocationCombobox
            id={inputId}
            value={value.address}
            onValueChange={handleManualValue}
            onSelect={handleSuggestion}
            disabled={disabled}
            describedBy={helpId}
            suppressSearch={value.verified}
          />

          {areaField ? (
            <div className="space-y-2.5">
              <Label htmlFor={`${inputId}-area`}>{areaField.label}</Label>
              <Input
                id={`${inputId}-area`}
                value={areaField.value}
                onChange={(event) => areaField.onChange(event.target.value)}
                placeholder={areaField.placeholder}
                disabled={disabled}
                className="h-10"
              />
            </div>
          ) : null}

          {contentAfterAreaField}

          <div id={helpId} className="space-y-1.5">
            {value.verified && hasCoordinates(value) ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/20">
                <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                  {reverseState === "loading" ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  )}
                  {reverseState === "loading" ? labels.resolving : labels.verified}
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground" dir="ltr">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
                </span>
              </div>
            ) : !value.address ? (
              <p className="text-xs text-muted-foreground">
                {labels.searchHint.replace("{count}", String(LOCATION_SEARCH_MIN_CHARACTERS))} {labels.markerHelp}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <MapPin className="size-3.5" aria-hidden="true" />
                {labels.unverified}
              </p>
            )}
            {message && <p className="text-xs text-amber-700 dark:text-amber-400">{message}</p>}
          </div>
        </div>

        <div
          ref={mapShellRef}
          role="region"
          aria-label={labels.mapTitle}
          className={cn(
            "relative isolate w-full min-w-0 overflow-hidden border bg-muted/30 shadow-sm",
            isFullscreen
              ? "fixed inset-0 z-[1200] h-screen max-h-none max-w-none rounded-none border-0 bg-background"
              : "h-[24rem] rounded-2xl sm:h-[32rem] lg:h-auto lg:aspect-square lg:max-h-[42rem] lg:min-h-[30rem]",
          )}
        >
          <div className={cn("absolute overflow-hidden", isFullscreen ? "inset-3 rounded-xl border sm:inset-4" : "inset-0")}>
            <MapErrorBoundary
              key={`boundary-${mapAttempt}`}
              resetKey={mapAttempt}
              onError={() => setMapState("error")}
            >
              <DynamicLocationMapCanvas
                key={`map-${mapAttempt}`}
                initialCenter={initialMapView.center}
                initialZoom={initialMapView.zoom}
                marker={markerPoint}
                centerRequest={centerRequest}
                resizeRequest={resizeRequest}
                tileUrl={MAP_TILE_URL}
                tileAttribution={MAP_TILE_ATTRIBUTION}
                markerTitle={labels.selectedLocation}
                onSelect={(point) => placeMarker(point.latitude, point.longitude, { source: "map" })}
                onMarkerMove={(point) =>
                  placeMarker(point.latitude, point.longitude, { center: false, source: "map" })
                }
                onReady={() => setMapState("ready")}
                onTileError={() => setMessage((current) => current ?? labels.mapError)}
              />
            </MapErrorBoundary>

            {disabled && <div className="absolute inset-0 z-[750] cursor-not-allowed bg-background/20" />}

            {mapState !== "ready" && (
              <div className="absolute inset-0 z-[800] flex items-center justify-center bg-background/92 p-6 text-center">
                {mapState === "error" ? (
                  <div className="max-w-sm space-y-3">
                    <MapPin className="mx-auto size-7 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground text-pretty">{labels.mapError}</p>
                    <Button type="button" variant="outline" size="sm" onClick={retryMap} disabled={disabled}>
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

          <div className={cn("absolute end-3 top-3 z-[900] flex items-center gap-2", isFullscreen && "end-6 top-6")}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 bg-background/95 shadow-md backdrop-blur-sm hover:bg-background"
              onClick={useCurrentLocation}
              disabled={disabled || locating}
            >
              {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
              <span className="hidden sm:inline">{locating ? labels.locating : labels.useCurrentLocation}</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="size-9 bg-background/95 shadow-md backdrop-blur-sm hover:bg-background"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? labels.exitFullscreen : labels.enterFullscreen}
              title={isFullscreen ? labels.exitFullscreen : labels.enterFullscreen}
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
