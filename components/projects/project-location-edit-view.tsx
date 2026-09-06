"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import React, { useCallback, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Crosshair,
  Loader2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LocationCombobox } from "@/components/projects/location-combobox"
import type { MapCenterRequest, MapPoint } from "@/components/projects/location-map-canvas"
import { updateProjectLocationAction } from "@/lib/actions/projects"
import { useI18n } from "@/lib/i18n"
import {
  DEFAULT_MAP_CENTER,
  MAP_TILE_ATTRIBUTION,
  MAP_TILE_URL,
} from "@/lib/locations/config"
import { getLocationLabels } from "@/lib/locations/labels"
import { coordinateLabel, type LocationSuggestion } from "@/lib/locations/types"

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

export type ProjectLocationEditData = {
  id: string
  name: string
  code: string | null
  location: string | null
  region: string | null
  latitude: number | null
  longitude: number | null
}

export function ProjectLocationEditView({
  project,
}: {
  project: ProjectLocationEditData
}) {
  const router = useRouter()
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const labels = getLocationLabels(locale)

  const [address, setAddress] = useState(project.location || "")
  const [areaDistrict, setAreaDistrict] = useState(project.region || "")
  const [latitude, setLatitude] = useState<number | null>(project.latitude)
  const [longitude, setLongitude] = useState<number | null>(project.longitude)

  const [searchValue, setSearchValue] = useState("")
  const [centerRequest, setCenterRequest] = useState<MapCenterRequest | null>(null)
  const centerRequestId = useRef(0)
  const [mapState, setMapState] = useState<"idle" | "loading" | "ready" | "error">("loading")
  const [mapSession, setMapSession] = useState(1)
  const [mapAttempt, setMapAttempt] = useState(0)
  const [locating, setLocating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const hasCoords = typeof latitude === "number" && !Number.isNaN(latitude) && typeof longitude === "number" && !Number.isNaN(longitude)

  const initialCenter = useMemo<MapPoint>(() => {
    if (hasCoords && latitude !== null && longitude !== null) {
      return { latitude, longitude }
    }
    return {
      latitude: DEFAULT_MAP_CENTER.latitude,
      longitude: DEFAULT_MAP_CENTER.longitude,
    }
  }, []) // Initial mount center

  const markerPoint = useMemo<MapPoint | null>(() => {
    if (hasCoords && latitude !== null && longitude !== null) {
      return { latitude, longitude }
    }
    return null
  }, [hasCoords, latitude, longitude])

  const setCoordinates = useCallback((lat: number, lng: number, shouldCenter = false) => {
    setLatitude(lat)
    setLongitude(lng)
    if (shouldCenter) {
      centerRequestId.current += 1
      setCenterRequest({
        latitude: lat,
        longitude: lng,
        requestId: centerRequestId.current,
      })
    }
  }, [])

  const handleMapSelect = useCallback(
    (point: MapPoint) => {
      setCoordinates(point.latitude, point.longitude, false)
      if (!address.trim()) {
        setAddress(coordinateLabel(point.latitude, point.longitude))
      }
    },
    [address, setCoordinates],
  )

  const handleMarkerMove = useCallback(
    (point: MapPoint) => {
      setCoordinates(point.latitude, point.longitude, false)
    },
    [setCoordinates],
  )

  function selectSearchResult(suggestion: LocationSuggestion) {
    setSearchValue(suggestion.label)
    setAddress(suggestion.label)
    setCoordinates(suggestion.latitude, suggestion.longitude, true)
  }

  function useCurrentLocation() {
    setErrorMessage(null)
    if (!navigator.geolocation) {
      setErrorMessage(labels.geolocationDenied)
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setCoordinates(lat, lng, true)
        if (!address.trim()) {
          setAddress(coordinateLabel(lat, lng))
        }
      },
      () => {
        setLocating(false)
        setErrorMessage(labels.geolocationDenied)
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  }

  function retryMap() {
    setErrorMessage(null)
    setMapState("loading")
    if (hasCoords && latitude !== null && longitude !== null) {
      centerRequestId.current += 1
      setCenterRequest({
        latitude,
        longitude,
        requestId: centerRequestId.current,
      })
    }
    setMapAttempt((a) => a + 1)
    setMapSession((s) => s + 1)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setIsSaving(true)

    try {
      const result = await updateProjectLocationAction({
        projectId: project.id,
        address,
        areaDistrict,
        latitude,
        longitude,
      })

      if (!result.ok) {
        setErrorMessage(result.error || (isArabic ? "فشل حفظ الموقع." : "Failed to update project location."))
        setIsSaving(false)
        return
      }

      setSuccessMessage(isArabic ? "تم تحديث موقع المشروع بنجاح." : "Project location updated successfully.")
      setTimeout(() => {
        router.push(`/projects/${project.id}`)
        router.refresh()
      }, 500)
    } catch {
      setErrorMessage(isArabic ? "حدث خطأ غير متوقع أثناء الحفظ." : "An unexpected error occurred while saving.")
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {/* Navigation Header */}
      <div className="flex flex-col gap-2">
        <Link
          href={`/projects/${project.id}`}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {isArabic ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
          <span>{isArabic ? "العودة إلى المشروع" : "Back to Project"}</span>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {isArabic ? "تعديل موقع المشروع" : "Edit Project Location"}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
              <Building2 className="size-3.5" />
              <span className="font-medium text-foreground/80">{project.name}</span>
              {project.code && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                  {project.code}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs font-medium text-destructive sm:text-sm">
          <AlertCircle className="size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 sm:text-sm">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Edit Form */}
      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* Location Text Inputs Card */}
        <Card className="shadow-xs">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">
              {isArabic ? "تفاصيل العنوان والمنطقة" : "Address & Area Details"}
            </CardTitle>
            <CardDescription className="text-xs">
              {isArabic
                ? "أدخل العنوان والمنطقة الإدارية للمشروع لتسهيل الوصول والتوجيه."
                : "Enter the project address and district area for navigation and reporting."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="address-input" className="text-xs font-semibold">
                {isArabic ? "عنوان المشروع" : "Project Address"}
              </Label>
              <Input
                id="address-input"
                type="text"
                placeholder={isArabic ? "مثال: شارع السلطان قابوس، السيب" : "e.g. Sultan Qaboos Street, Seeb"}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="area-input" className="text-xs font-semibold">
                {isArabic ? "المنطقة / الحي" : "Area / District"}
              </Label>
              <Input
                id="area-input"
                type="text"
                placeholder={isArabic ? "مثال: مسقط / الخوض" : "e.g. Muscat / Al Khoudh"}
                value={areaDistrict}
                onChange={(e) => setAreaDistrict(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Map & Coordinates Card */}
        <Card className="shadow-xs">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <MapPin className="size-4 text-primary" />
                  {isArabic ? "الخريطة التفاعلية وتحديد الموقع" : "Interactive Map & Coordinates"}
                </CardTitle>
                <CardDescription className="text-xs">
                  {labels.markerHelp}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Search and GPS controls */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <LocationCombobox
                id="edit-location-search"
                value={searchValue}
                onValueChange={setSearchValue}
                onSelect={selectSearchResult}
                placeholder={labels.mapSearchPlaceholder}
                ariaLabel={labels.mapSearchPlaceholder}
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 text-xs"
                onClick={useCurrentLocation}
                disabled={locating}
              >
                {locating ? <Loader2 className="size-3.5 animate-spin" /> : <LocateFixed className="size-3.5" />}
                <span>{locating ? labels.locating : labels.useCurrentLocation}</span>
              </Button>
            </div>

            {/* Interactive Leaflet Map Canvas */}
            <div
              role="region"
              aria-label={labels.mapTitle}
              tabIndex={0}
              className="relative isolate h-[320px] w-full overflow-hidden rounded-xl border bg-muted/30 sm:h-[400px]"
            >
              <MapErrorBoundary
                key={`boundary-${mapSession}-${mapAttempt}`}
                resetKey={mapSession + mapAttempt}
                onError={() => setMapState("error")}
              >
                <DynamicLocationMapCanvas
                  key={`map-${mapSession}-${mapAttempt}`}
                  initialCenter={initialCenter}
                  initialZoom={hasCoords ? 15 : DEFAULT_MAP_CENTER.zoom}
                  marker={markerPoint}
                  centerRequest={centerRequest}
                  tileUrl={MAP_TILE_URL}
                  tileAttribution={MAP_TILE_ATTRIBUTION}
                  markerTitle={project.name}
                  onSelect={handleMapSelect}
                  onMarkerMove={handleMarkerMove}
                  onReady={() => setMapState("ready")}
                  onTileError={() => setMapState("error")}
                />
              </MapErrorBoundary>

              {mapState !== "ready" && (
                <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-background/90 p-6 text-center">
                  {mapState === "error" ? (
                    <div className="max-w-md space-y-3">
                      <MapPin className="mx-auto size-7 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">{labels.mapError}</p>
                      <Button type="button" variant="outline" size="sm" onClick={retryMap}>
                        <RefreshCw className="size-3.5" />
                        <span>{isArabic ? "إعادة المحاولة" : "Try again"}</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>{labels.mapLoading}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Coordinates Display */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3.5">
              <div className="flex items-center gap-2">
                <Crosshair className="size-4 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {isArabic ? "الإحداثيات الجغرافية المحددة" : "Selected GPS Coordinates"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {hasCoords
                      ? isArabic
                        ? "يتم تحديث الإحداثيات تلقائياً عند النقر على الخريطة أو سحب العلامة."
                        : "Coordinates update in real-time when clicking the map or dragging the pin."
                      : isArabic
                        ? "لم يتم تحديد إحداثيات بعد. انقر على الخريطة لتحديد الموقع."
                        : "No coordinates selected yet. Click the map to place a pin."}
                  </p>
                </div>
              </div>

              {hasCoords && latitude !== null && longitude !== null ? (
                <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-1.5 font-mono text-xs tabular-nums shadow-xs" dir="ltr">
                  <div>
                    <span className="text-muted-foreground">Lat: </span>
                    <span className="font-semibold text-foreground">{latitude.toFixed(6)}</span>
                  </div>
                  <div className="h-3 w-px bg-border" />
                  <div>
                    <span className="text-muted-foreground">Lng: </span>
                    <span className="font-semibold text-foreground">{longitude.toFixed(6)}</span>
                  </div>
                </div>
              ) : (
                <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {isArabic ? "غير محدد" : "Not Set"}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/projects/${project.id}`)}
            disabled={isSaving}
          >
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="submit" disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            <span>{isSaving ? (isArabic ? "جارٍ الحفظ..." : "Saving...") : isArabic ? "حفظ موقع المشروع" : "Save Location"}</span>
          </Button>
        </div>
      </form>
    </div>
  )
}
