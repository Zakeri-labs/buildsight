"use client"

import dynamic from "next/dynamic"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { ExternalLink, Loader2, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useI18n } from "@/lib/i18n"
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from "@/lib/locations/config"
import type { MapPoint } from "@/components/projects/location-map-canvas"

const DynamicLocationMapCanvas = dynamic(
  () => import("@/components/projects/location-map-canvas").then((module) => module.LocationMapCanvas),
  { ssr: false, loading: () => null },
)

type LocationPreviewProject = {
  id: string
  name: string
  address: string
  latitude?: number | null
  longitude?: number | null
}

type MapErrorBoundaryProps = {
  resetKey: string
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

function validCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Number(latitude) >= -90 &&
    Number(latitude) <= 90 &&
    Number(longitude) >= -180 &&
    Number(longitude) <= 180
  )
}

function displayAddress(address: string) {
  const normalized = address.replace(/\s+/g, " ").trim()
  return normalized && normalized !== "—" ? normalized : ""
}

export function ProjectLocationPreviewDialog({
  project,
  onOpenChange,
}: {
  project: LocationPreviewProject
  onOpenChange: (open: boolean) => void
}) {
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const address = displayAddress(project.address)
  const hasCoordinates = validCoordinates(project.latitude, project.longitude)
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">(
    hasCoordinates ? "loading" : "error",
  )

  useEffect(() => {
    setMapState(hasCoordinates ? "loading" : "error")
    if (!hasCoordinates) return

    const timeout = window.setTimeout(() => {
      setMapState((current) => (current === "loading" ? "error" : current))
    }, 10_000)

    return () => window.clearTimeout(timeout)
  }, [hasCoordinates, project.id])

  const point = useMemo<MapPoint | null>(() => {
    if (!hasCoordinates) return null
    return {
      latitude: Number(project.latitude),
      longitude: Number(project.longitude),
    }
  }, [hasCoordinates, project.latitude, project.longitude])

  const handleMapReady = useCallback(() => setMapState("ready"), [])
  const handleMapError = useCallback(() => setMapState("error"), [])

  const googleMapsUrl = point
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`
    : null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl overflow-hidden p-0 sm:w-full">
        <DialogHeader className="border-b border-slate-200 px-5 pb-4 pt-5 pe-12 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-blue-600" aria-hidden="true" />
            {isArabic ? "موقع المشروع" : "Project Location"}
          </DialogTitle>
          <DialogDescription className="break-words text-start font-medium text-slate-700 dark:text-slate-300">
            {project.name}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(100dvh-10rem)] space-y-4 overflow-y-auto px-5 py-4">
          <div className="relative h-[17rem] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 sm:h-[21rem]">
            {point ? (
              <MapErrorBoundary resetKey={project.id} onError={handleMapError}>
                <DynamicLocationMapCanvas
                  key={project.id}
                  initialCenter={point}
                  initialZoom={15}
                  marker={point}
                  centerRequest={null}
                  tileUrl={MAP_TILE_URL}
                  tileAttribution={MAP_TILE_ATTRIBUTION}
                  markerTitle={project.name}
                  onReady={handleMapReady}
                  onTileError={handleMapError}
                  readOnly
                />
              </MapErrorBoundary>
            ) : null}

            {mapState === "loading" ? (
              <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-slate-100/85 text-sm text-slate-600 backdrop-blur-[1px] dark:bg-slate-950/80 dark:text-slate-300">
                <Loader2 className="me-2 size-4 animate-spin" />
                {isArabic ? "جارٍ تحميل الخريطة..." : "Loading map..."}
              </div>
            ) : null}

            {mapState === "error" ? (
              <div className="absolute inset-0 z-[501] flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
                <MapPin className="size-7 text-slate-400" aria-hidden="true" />
                <span>{isArabic ? "موقع الخريطة غير متاح." : "Map location is not available."}</span>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2">
            <div className="min-w-0 space-y-1 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {isArabic ? "العنوان" : "Address"}
              </p>
              <p className="break-words text-sm font-medium leading-6 text-slate-800 dark:text-slate-200">
                {address || (isArabic ? "لا يوجد عنوان محفوظ." : "No saved address.")}
              </p>
            </div>

            {point ? (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {isArabic ? "خط العرض" : "Latitude"}
                  </p>
                  <p className="font-mono text-sm text-slate-800 dark:text-slate-200">
                    {point.latitude.toFixed(6)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {isArabic ? "خط الطول" : "Longitude"}
                  </p>
                  <p className="font-mono text-sm text-slate-800 dark:text-slate-200">
                    {point.longitude.toFixed(6)}
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isArabic ? "إغلاق" : "Close"}
          </Button>
          {googleMapsUrl ? (
            <Button
              render={
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" />
              }
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {isArabic ? "فتح في خرائط Google" : "Open in Google Maps"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
