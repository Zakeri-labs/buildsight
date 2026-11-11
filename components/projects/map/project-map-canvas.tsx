"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { divIcon, type LatLngBoundsExpression } from "leaflet"
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"
import {
  AlertTriangle,
  Building2,
  Check,
  Circle as CircleIcon,
  ExternalLink,
  MapPin,
  Pencil,
  Pentagon,
  SlidersHorizontal,
  Trash2,
  Undo2,
  User,
  X,
} from "lucide-react"
import { DEFAULT_MAP_CENTER, MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from "@/lib/locations/config"
import {
  normalizeProjectStatus,
  PROJECT_STATUS_BADGE_CLASS,
  projectStatusLabel,
} from "@/lib/projects/project-status"
import {
  calculatePolygonAreaSquareMeters,
  validateCircleGeometry,
  validatePolygonGeometry,
} from "@/lib/zones/geometry"
import type {
  CircleZoneGeometry,
  GeoPoint,
  PolygonZoneGeometry,
  ProjectZone,
  ZoneGeometry,
} from "@/lib/zones/types"
import { clusterProjects } from "./clustering"
import { formatArea, formatDistance } from "./formatters"
import type {
  ClusterOrMarker,
  DrawingMode,
  MapCluster,
  MapProjectItem,
  ProjectMapCanvasProps,
} from "./types"
import {
  CircleDrawer,
  CircleEditor,
  PolygonDrawer,
  PolygonEditor,
} from "./zone-drawing-controllers"

/**
 * Creates a circular cluster badge DivIcon.
 */
function createClusterIcon(count: number): ReturnType<typeof divIcon> {
  const size = count < 10 ? 34 : count < 50 ? 40 : 46
  return divIcon({
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 9999px;
        background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
        color: #ffffff;
        font-weight: 700;
        font-size: ${count < 100 ? "13px" : "11px"};
        box-shadow: 0 4px 14px rgba(30, 58, 138, 0.45);
        border: 2.5px solid #ffffff;
        cursor: pointer;
        user-select: none;
        transition: transform 0.15s ease;
      ">
        ${count}
      </div>
    `,
    className: "buildsight-cluster-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * Creates a modern SVG project pin DivIcon.
 */
function createProjectPinIcon(): ReturnType<typeof divIcon> {
  return divIcon({
    html: `
      <div style="
        display: inline-block;
        transform: translate(-50%, -100%);
        cursor: pointer;
        filter: drop-shadow(0 3px 6px rgba(0,0,0,0.3));
        transition: transform 0.15s ease;
      ">
        <svg width="26" height="34" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.268 0 0 6.268 0 14C0 24.5 14 36 14 36C14 36 28 24.5 28 14C28 6.268 21.732 0 14 0Z" fill="#0f172a"/>
          <circle cx="14" cy="14" r="6" fill="#38bdf8"/>
        </svg>
      </div>
    `,
    className: "buildsight-single-pin",
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -34],
  })
}

/**
 * Controller inside MapContainer to observe zoom, bounds changes, and fit-bounds triggers.
 */
function MapController({
  projects,
  fitBoundsTrigger,
  onZoomChange,
}: {
  projects: MapProjectItem[]
  fitBoundsTrigger: number
  onZoomChange: (zoom: number) => void
}) {
  const map = useMap()
  const hasFittedInitially = useRef(false)

  const fitAll = useCallback(() => {
    if (!projects.length) {
      map.setView(
        [DEFAULT_MAP_CENTER.latitude, DEFAULT_MAP_CENTER.longitude],
        DEFAULT_MAP_CENTER.zoom,
      )
      return
    }

    if (projects.length === 1) {
      map.setView([projects[0].latitude, projects[0].longitude], 14, { animate: true })
      return
    }

    let minLat = projects[0].latitude
    let maxLat = projects[0].latitude
    let minLng = projects[0].longitude
    let maxLng = projects[0].longitude

    for (const p of projects) {
      minLat = Math.min(minLat, p.latitude)
      maxLat = Math.max(maxLat, p.latitude)
      minLng = Math.min(minLng, p.longitude)
      maxLng = Math.max(maxLng, p.longitude)
    }

    const bounds: LatLngBoundsExpression = [
      [minLat, minLng],
      [maxLat, maxLng],
    ]
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: true })
  }, [map, projects])

  // Invalidate map size to prevent gray tiles on deferred mount
  useEffect(() => {
    map.invalidateSize({ animate: false })
    const timer = window.setTimeout(() => map.invalidateSize({ animate: false }), 200)
    return () => window.clearTimeout(timer)
  }, [map])

  // Fit bounds when explicitly requested
  useEffect(() => {
    if (fitBoundsTrigger > 0) {
      fitAll()
    }
  }, [fitBoundsTrigger, fitAll])

  // Initial auto-fit once when projects arrive
  useEffect(() => {
    if (!hasFittedInitially.current && projects.length > 0) {
      hasFittedInitially.current = true
      const timer = window.setTimeout(fitAll, 120)
      return () => window.clearTimeout(timer)
    }
  }, [projects, fitAll])

  // Observe map zoom
  useMapEvents({
    zoomend(e) {
      onZoomChange(e.target.getZoom())
    },
  })

  return null
}

/**
 * Cluster click zoom handler.
 */
function ClusterMarker({
  cluster,
  interactive = true,
}: {
  cluster: MapCluster
  interactive?: boolean
}) {
  const map = useMap()
  const icon = useMemo(() => createClusterIcon(cluster.count), [cluster.count])

  const handleClick = useCallback(() => {
    if (!interactive) return
    map.fitBounds(cluster.bounds, {
      padding: [45, 45],
      maxZoom: Math.min(18, map.getZoom() + 3),
      animate: true,
    })
  }, [map, cluster.bounds, interactive])

  return (
    <Marker
      position={[cluster.latitude, cluster.longitude]}
      icon={icon}
      eventHandlers={{ click: handleClick }}
    />
  )
}

/**
 * Single project pin with interactive popup.
 */
function ProjectMarker({
  project,
  locale,
  interactive = true,
}: {
  project: MapProjectItem
  locale: string
  interactive?: boolean
}) {
  const isArabic = locale === "ar"
  const pinIcon = useMemo(() => createProjectPinIcon(), [])
  const normStatus = normalizeProjectStatus(project.status)
  const statusLabel = projectStatusLabel(normStatus, isArabic)
  const badgeClass = PROJECT_STATUS_BADGE_CLASS[normStatus]

  if (!interactive) {
    return <Marker position={[project.latitude, project.longitude]} icon={pinIcon} />
  }

  return (
    <Marker position={[project.latitude, project.longitude]} icon={pinIcon}>
      <Popup className="buildsight-map-popup" maxWidth={320} minWidth={240}>
        <div className="flex flex-col gap-2 p-0.5 text-start font-sans" dir={isArabic ? "rtl" : "ltr"}>
          {/* Header: Code & Status */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
              {project.code || "—"}
            </span>
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
              {statusLabel}
            </span>
          </div>

          {/* Title */}
          <h3 className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">
            {project.name}
          </h3>

          {/* Details */}
          <div className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
            {project.ownerClient && project.ownerClient !== "—" ? (
              <div className="flex items-center gap-1.5 truncate">
                <Building2 className="size-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{project.ownerClient}</span>
              </div>
            ) : null}

            {project.address && project.address !== "—" ? (
              <div className="flex items-center gap-1.5 truncate">
                <MapPin className="size-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{project.address}</span>
              </div>
            ) : null}

            {project.supervisorName ? (
              <div className="flex items-center gap-1.5 truncate">
                <User className="size-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{project.supervisorName}</span>
              </div>
            ) : null}
          </div>

          {/* Progress */}
          {typeof project.progress === "number" ? (
            <div className="mt-1 flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>{isArabic ? "نسبة الإنجاز" : "Progress"}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {project.progress}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }}
                />
              </div>
            </div>
          ) : null}

          {/* Action Link */}
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Link
              href={`/projects/${project.id}`}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <span>{isArabic ? "عرض تفاصيل المشروع" : "View Project Details"}</span>
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </div>
      </Popup>
    </Marker>
  )
}

export function ProjectMapCanvas({
  projects,
  zones,
  fitBoundsTrigger,
  locale,
  canManageZones = false,
  drawingMode = "idle",
  isDialogOpen = false,
  activeEditingZone = null,
  onDrawingComplete,
  onDrawingCancel,
  onStartEditZone,
  onSaveEditedGeometry,
  onRequestEditDetails,
  onRequestDeleteZone,
}: ProjectMapCanvasProps) {
  const isArabic = locale === "ar"
  const [zoom, setZoom] = useState(DEFAULT_MAP_CENTER.zoom)
  const isDrawingActive = drawingMode !== "idle"

  // Local drawing/editing state
  const [drawError, setDrawError] = useState<string | null>(null)

  // Circle drawing state
  const [drawCircleStep, setDrawCircleStep] = useState<"center" | "radius">("center")
  const [drawCircleCenter, setDrawCircleCenter] = useState<GeoPoint | null>(null)
  const [drawCircleRadius, setDrawCircleRadius] = useState<number>(100)

  // Polygon drawing state
  const [drawPolygonPoints, setDrawPolygonPoints] = useState<GeoPoint[]>([])

  // Circle editing state
  const [editCircleCenter, setEditCircleCenter] = useState<GeoPoint>({ lat: 0, lng: 0 })
  const [editCircleRadius, setEditCircleRadius] = useState<number>(100)

  // Polygon editing state
  const [editPolygonVertices, setEditPolygonVertices] = useState<GeoPoint[]>([])

  // Initialize or reset edit state when activeEditingZone changes
  useEffect(() => {
    setDrawError(null)
    if (drawingMode === "editing_circle" && activeEditingZone?.geometry.type === "circle") {
      setEditCircleCenter(activeEditingZone.geometry.center)
      setEditCircleRadius(activeEditingZone.geometry.radiusMeters)
    } else if (
      drawingMode === "editing_polygon" &&
      activeEditingZone?.geometry.type === "polygon"
    ) {
      setEditPolygonVertices([...activeEditingZone.geometry.coordinates])
    } else if (drawingMode === "drawing_circle") {
      setDrawCircleStep("center")
      setDrawCircleCenter(null)
      setDrawCircleRadius(100)
    } else if (drawingMode === "drawing_polygon") {
      setDrawPolygonPoints([])
    }
  }, [drawingMode, activeEditingZone])

  // Compute clusters dynamically on zoom change or projects change
  const clustersOrMarkers = useMemo(() => {
    return clusterProjects(projects, zoom, 55)
  }, [projects, zoom])

  // Handlers for Polygon drawing actions
  const handleUndoPolygonPoint = () => {
    setDrawError(null)
    setDrawPolygonPoints((prev) => prev.slice(0, -1))
  }

  const handleFinishPolygonDrawing = () => {
    setDrawError(null)
    const validation = validatePolygonGeometry(drawPolygonPoints)
    if (!validation.valid || !validation.normalized) {
      setDrawError(validation.error ?? "Invalid polygon geometry.")
      return
    }
    onDrawingComplete?.({
      type: "polygon",
      coordinates: validation.normalized,
    })
  }

  // Handlers for editing save actions
  const handleSaveCircleGeometry = () => {
    setDrawError(null)
    const validation = validateCircleGeometry(editCircleCenter, editCircleRadius)
    if (!validation.valid) {
      setDrawError(validation.error ?? "Invalid circle radius.")
      return
    }
    onSaveEditedGeometry?.({
      type: "circle",
      center: editCircleCenter,
      radiusMeters: editCircleRadius,
    })
  }

  const handleSavePolygonGeometry = () => {
    setDrawError(null)
    const validation = validatePolygonGeometry(editPolygonVertices)
    if (!validation.valid || !validation.normalized) {
      setDrawError(validation.error ?? "Invalid polygon geometry.")
      return
    }
    onSaveEditedGeometry?.({
      type: "polygon",
      coordinates: validation.normalized,
    })
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Floating Drawing / Editing Action Toolbar */}
      {isDrawingActive && !isDialogOpen ? (
        <div
          className="absolute top-3 left-1/2 z-[1000] flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white/95 p-2.5 shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95"
          dir={isArabic ? "rtl" : "ltr"}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Status / Instructions */}
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                {drawingMode === "drawing_circle" || drawingMode === "editing_circle" ? (
                  <CircleIcon className="size-4" />
                ) : (
                  <Pentagon className="size-4" />
                )}
              </div>
              <div className="text-xs">
                {drawingMode === "drawing_circle" ? (
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {drawCircleStep === "center"
                      ? isArabic
                        ? "انقر على الخريطة لتحديد مركز الدائرة"
                        : "Click map to set circle center"
                      : isArabic
                        ? `انقر لتحديد نصف القطر (~${formatDistance(drawCircleRadius, isArabic)})`
                        : `Click map to set radius (~${formatDistance(drawCircleRadius, isArabic)})`}
                  </span>
                ) : drawingMode === "drawing_polygon" ? (
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {isArabic
                      ? `رسم مضلع (${drawPolygonPoints.length} نقاط مسجلة)`
                      : `Draw Polygon (${drawPolygonPoints.length} vertices placed)`}
                  </span>
                ) : drawingMode === "editing_circle" ? (
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {isArabic
                      ? `تعديل الدائرة · نصف القطر: ${formatDistance(editCircleRadius, isArabic)}`
                      : `Edit Circle · Radius: ${formatDistance(editCircleRadius, isArabic)}`}
                  </span>
                ) : drawingMode === "editing_polygon" ? (
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {isArabic
                      ? `تعديل المضلع (${editPolygonVertices.length} نقاط)`
                      : `Edit Polygon (${editPolygonVertices.length} vertices)`}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1.5">
              {drawingMode === "drawing_circle" ? (
                <>
                  {drawCircleStep === "radius" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDrawCircleStep("center")
                        setDrawCircleCenter(null)
                        setDrawError(null)
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <Undo2 className="size-3" />
                      <span>{isArabic ? "إعادة" : "Redraw"}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onDrawingCancel}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <X className="size-3" />
                    <span>{isArabic ? "إلغاء" : "Cancel"}</span>
                  </button>
                </>
              ) : drawingMode === "drawing_polygon" ? (
                <>
                  <button
                    type="button"
                    onClick={handleUndoPolygonPoint}
                    disabled={drawPolygonPoints.length === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <Undo2 className="size-3" />
                    <span>{isArabic ? "تراجع" : "Undo Point"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFinishPolygonDrawing}
                    disabled={drawPolygonPoints.length < 3}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="size-3" />
                    <span>{isArabic ? "إنهاء الرسم" : "Finish Drawing"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDrawingCancel}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <X className="size-3" />
                    <span>{isArabic ? "إلغاء" : "Cancel"}</span>
                  </button>
                </>
              ) : drawingMode === "editing_circle" ? (
                <>
                  {activeEditingZone ? (
                    <button
                      type="button"
                      onClick={() => onRequestEditDetails?.(activeEditingZone)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <SlidersHorizontal className="size-3" />
                      <span>{isArabic ? "الاسم واللون" : "Name & Color"}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSaveCircleGeometry}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
                  >
                    <Check className="size-3" />
                    <span>{isArabic ? "حفظ الرسم" : "Save Shape"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDrawingCancel}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <X className="size-3" />
                    <span>{isArabic ? "إلغاء" : "Cancel"}</span>
                  </button>
                </>
              ) : drawingMode === "editing_polygon" ? (
                <>
                  {activeEditingZone ? (
                    <button
                      type="button"
                      onClick={() => onRequestEditDetails?.(activeEditingZone)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <SlidersHorizontal className="size-3" />
                      <span>{isArabic ? "الاسم واللون" : "Name & Color"}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSavePolygonGeometry}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
                  >
                    <Check className="size-3" />
                    <span>{isArabic ? "حفظ الرسم" : "Save Shape"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDrawingCancel}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <X className="size-3" />
                    <span>{isArabic ? "إلغاء" : "Cancel"}</span>
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {/* Validation Error Banner */}
          {drawError ? (
            <div className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>{drawError}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Map Container */}
      <MapContainer
        center={[DEFAULT_MAP_CENTER.latitude, DEFAULT_MAP_CENTER.longitude]}
        zoom={DEFAULT_MAP_CENTER.zoom}
        minZoom={2}
        maxZoom={19}
        scrollWheelZoom={false}
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={MAP_TILE_URL} attribution={MAP_TILE_ATTRIBUTION} maxZoom={19} />

        <MapController
          projects={projects}
          fitBoundsTrigger={fitBoundsTrigger}
          onZoomChange={setZoom}
        />

        {/* Read-Only or Static Render of Saved Zones */}
        {zones.map((zone) => {
          // If this zone is actively being edited, hide static render
          if (activeEditingZone && activeEditingZone.id === zone.id) {
            return null
          }

          if (zone.type === "circle" && zone.geometry.type === "circle") {
            return (
              <Circle
                key={`zone-${zone.id}`}
                center={[zone.geometry.center.lat, zone.geometry.center.lng]}
                radius={zone.geometry.radiusMeters}
                pathOptions={{
                  color: zone.color,
                  fillColor: zone.color,
                  fillOpacity: 0.15,
                  weight: 2,
                }}
              >
                {!isDrawingActive ? (
                  <Popup maxWidth={260}>
                    <div className="flex flex-col gap-2 p-1 text-start font-sans" dir={isArabic ? "rtl" : "ltr"}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-3 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: zone.color }}
                          />
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {zone.name}
                          </span>
                        </div>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {isArabic ? "دائرة" : "Circle"}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          {isArabic ? "نصف القطر:" : "Radius:"}{" "}
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatDistance(zone.geometry.radiusMeters, isArabic)}
                          </span>
                        </span>
                      </div>

                      {canManageZones ? (
                        <div className="mt-1 flex items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => onStartEditZone?.(zone)}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Pencil className="size-3" />
                            <span>{isArabic ? "تعديل الرسم" : "Edit Shape"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onRequestEditDetails?.(zone)}
                            className="inline-flex items-center justify-center rounded-md bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            title={isArabic ? "تعديل الاسم واللون" : "Edit Name & Color"}
                          >
                            <SlidersHorizontal className="size-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onRequestDeleteZone?.(zone)}
                            className="inline-flex items-center justify-center rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-400 dark:hover:bg-red-900/60"
                            title={isArabic ? "حذف المنطقة" : "Delete Zone"}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </Popup>
                ) : null}
              </Circle>
            )
          }

          if (zone.type === "polygon" && zone.geometry.type === "polygon") {
            const positions = zone.geometry.coordinates.map(
              (p) => [p.lat, p.lng] as [number, number],
            )
            return (
              <Polygon
                key={`zone-${zone.id}`}
                positions={positions}
                pathOptions={{
                  color: zone.color,
                  fillColor: zone.color,
                  fillOpacity: 0.15,
                  weight: 2,
                }}
              >
                {!isDrawingActive ? (
                  <Popup maxWidth={260}>
                    <div className="flex flex-col gap-2 p-1 text-start font-sans" dir={isArabic ? "rtl" : "ltr"}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-3 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: zone.color }}
                          />
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {zone.name}
                          </span>
                        </div>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {isArabic ? "مضلع" : "Polygon"}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          {zone.geometry.coordinates.length} {isArabic ? "نقاط" : "vertices"} ·{" "}
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatArea(
                              calculatePolygonAreaSquareMeters(zone.geometry.coordinates),
                              isArabic,
                            )}
                          </span>
                        </span>
                      </div>

                      {canManageZones ? (
                        <div className="mt-1 flex items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => onStartEditZone?.(zone)}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <Pencil className="size-3" />
                            <span>{isArabic ? "تعديل الرسم" : "Edit Shape"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onRequestEditDetails?.(zone)}
                            className="inline-flex items-center justify-center rounded-md bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            title={isArabic ? "تعديل الاسم واللون" : "Edit Name & Color"}
                          >
                            <SlidersHorizontal className="size-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onRequestDeleteZone?.(zone)}
                            className="inline-flex items-center justify-center rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-400 dark:hover:bg-red-900/60"
                            title={isArabic ? "حذف المنطقة" : "Delete Zone"}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </Popup>
                ) : null}
              </Polygon>
            )
          }

          return null
        })}

        {/* ACTIVE DRAWING CONTROLLERS */}
        {drawingMode === "drawing_circle" ? (
          <CircleDrawer
            step={drawCircleStep}
            setStep={setDrawCircleStep}
            center={drawCircleCenter}
            setCenter={setDrawCircleCenter}
            onRadiusChange={setDrawCircleRadius}
            onComplete={(geom) => onDrawingComplete?.(geom)}
            onCancel={onDrawingCancel ?? (() => {})}
            onError={setDrawError}
          />
        ) : null}

        {drawingMode === "drawing_polygon" ? (
          <PolygonDrawer
            points={drawPolygonPoints}
            setPoints={setDrawPolygonPoints}
            onComplete={(geom) => onDrawingComplete?.(geom)}
            onError={setDrawError}
          />
        ) : null}

        {/* ACTIVE EDITING CONTROLLERS */}
        {drawingMode === "editing_circle" &&
        activeEditingZone?.geometry.type === "circle" ? (
          <CircleEditor
            zone={activeEditingZone as ProjectZone & { geometry: CircleZoneGeometry }}
            center={editCircleCenter}
            setCenter={setEditCircleCenter}
            radiusMeters={editCircleRadius}
            setRadiusMeters={setEditCircleRadius}
            onSave={handleSaveCircleGeometry}
            onCancel={onDrawingCancel ?? (() => {})}
          />
        ) : null}

        {drawingMode === "editing_polygon" &&
        activeEditingZone?.geometry.type === "polygon" ? (
          <PolygonEditor
            zone={activeEditingZone as ProjectZone & { geometry: PolygonZoneGeometry }}
            vertices={editPolygonVertices}
            setVertices={setEditPolygonVertices}
          />
        ) : null}

        {/* Render Clustered Pins and Single Markers */}
        {clustersOrMarkers.map((item) => {
          if (item.isCluster) {
            return (
              <ClusterMarker
                key={item.id}
                cluster={item}
                interactive={!isDrawingActive}
              />
            )
          }
          return (
            <ProjectMarker
              key={item.id}
              project={item.project}
              locale={locale}
              interactive={!isDrawingActive}
            />
          )
        })}
      </MapContainer>
    </div>
  )
}
