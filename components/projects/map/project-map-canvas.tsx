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
import { ExternalLink, MapPin, User, Building2, CheckCircle2 } from "lucide-react"
import { DEFAULT_MAP_CENTER, MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from "@/lib/locations/config"
import {
  normalizeProjectStatus,
  PROJECT_STATUS_BADGE_CLASS,
  projectStatusLabel,
} from "@/lib/projects/project-status"
import { clusterProjects } from "./clustering"
import type { MapCluster, MapProjectItem, ProjectMapCanvasProps } from "./types"

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
      map.setView([DEFAULT_MAP_CENTER.latitude, DEFAULT_MAP_CENTER.longitude], DEFAULT_MAP_CENTER.zoom)
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
}: {
  cluster: MapCluster
}) {
  const map = useMap()
  const icon = useMemo(() => createClusterIcon(cluster.count), [cluster.count])

  const handleClick = useCallback(() => {
    map.fitBounds(cluster.bounds, {
      padding: [45, 45],
      maxZoom: Math.min(18, map.getZoom() + 3),
      animate: true,
    })
  }, [map, cluster.bounds])

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
}: {
  project: MapProjectItem
  locale: string
}) {
  const isArabic = locale === "ar"
  const pinIcon = useMemo(() => createProjectPinIcon(), [])
  const normStatus = normalizeProjectStatus(project.status)
  const statusLabel = projectStatusLabel(normStatus, isArabic)
  const badgeClass = PROJECT_STATUS_BADGE_CLASS[normStatus]

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

          {/* Progress if available */}
          {typeof project.progress === "number" ? (
            <div className="mt-1 flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>{isArabic ? "نسبة الإنجاز" : "Progress"}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{project.progress}%</span>
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
}: ProjectMapCanvasProps) {
  const isArabic = locale === "ar"
  const [zoom, setZoom] = useState(DEFAULT_MAP_CENTER.zoom)

  // Compute clusters dynamically on zoom change or projects change
  const clustersOrMarkers = useMemo(() => {
    return clusterProjects(projects, zoom, 55)
  }, [projects, zoom])

  return (
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

      {/* Read-Only Render of Saved Zones */}
      {zones.map((zone) => {
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
              <Popup maxWidth={240}>
                <div className="p-1 text-start" dir={isArabic ? "rtl" : "ltr"}>
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                    <span className="font-semibold text-sm text-slate-900">{zone.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {isArabic ? "منطقة دائرية" : "Circle Zone"} · {Math.round(zone.geometry.radiusMeters)}{" "}
                    {isArabic ? "متر" : "m"}
                  </div>
                </div>
              </Popup>
            </Circle>
          )
        }

        if (zone.type === "polygon" && zone.geometry.type === "polygon") {
          const positions = zone.geometry.coordinates.map((p) => [p.lat, p.lng] as [number, number])
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
              <Popup maxWidth={240}>
                <div className="p-1 text-start" dir={isArabic ? "rtl" : "ltr"}>
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                    <span className="font-semibold text-sm text-slate-900">{zone.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {isArabic ? "منطقة مضلعة" : "Polygon Zone"} · {zone.geometry.coordinates.length}{" "}
                    {isArabic ? "نقاط" : "vertices"}
                  </div>
                </div>
              </Popup>
            </Polygon>
          )
        }

        return null
      })}

      {/* Render Clustered Pins and Single Markers */}
      {clustersOrMarkers.map((item) => {
        if (item.isCluster) {
          return <ClusterMarker key={item.id} cluster={item} />
        }
        return <ProjectMarker key={item.id} project={item.project} locale={locale} />
      })}
    </MapContainer>
  )
}
