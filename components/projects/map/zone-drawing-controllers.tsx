"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { divIcon, type LatLng } from "leaflet"
import { Circle, Marker, Polygon, Polyline, useMap, useMapEvents } from "react-leaflet"
import {
  haversineDistanceMeters,
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

// --- Custom DivIcons for Drag Handles & Markers ---

export const centerHandleIcon = divIcon({
  html: `
    <div style="
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background: #ffffff;
      border: 3px solid #2563eb;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      cursor: move;
    "></div>
  `,
  className: "zone-handle-center",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

export const radiusHandleIcon = divIcon({
  html: `
    <div style="
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background: #38bdf8;
      border: 3px solid #0284c7;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      cursor: ew-resize;
    "></div>
  `,
  className: "zone-handle-radius",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

export const vertexHandleIcon = divIcon({
  html: `
    <div style="
      width: 14px;
      height: 14px;
      border-radius: 9999px;
      background: #ffffff;
      border: 3px solid #10b981;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      cursor: move;
    "></div>
  `,
  className: "zone-handle-vertex",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

export const midpointHandleIcon = divIcon({
  html: `
    <div style="
      width: 10px;
      height: 10px;
      border-radius: 9999px;
      background: #10b981;
      border: 2px solid #ffffff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      cursor: pointer;
    "></div>
  `,
  className: "zone-handle-midpoint",
  iconSize: [10, 10],
  iconAnchor: [5, 5],
})

// --- CIRCLE DRAWER CONTROLLER ---

export type CircleDrawerProps = {
  onComplete: (geometry: CircleZoneGeometry) => void
  onCancel: () => void
  onError: (msg: string | null) => void
  onRadiusChange?: (radiusMeters: number) => void
  step: "center" | "radius"
  setStep: (step: "center" | "radius") => void
  center: GeoPoint | null
  setCenter: (p: GeoPoint | null) => void
}

export function CircleDrawer({
  onComplete,
  onError,
  onRadiusChange,
  step,
  setStep,
  center,
  setCenter,
}: CircleDrawerProps) {
  const map = useMap()
  const [tempRadius, setTempRadius] = useState(100)

  // Temporarily disable double-click zoom to prevent conflicts during click placement
  useEffect(() => {
    map.doubleClickZoom.disable()
    const container = map.getContainer()
    container.style.cursor = "crosshair"

    return () => {
      map.doubleClickZoom.enable()
      container.style.cursor = ""
    }
  }, [map])

  useMapEvents({
    click(e) {
      onError(null)
      if (step === "center" || !center) {
        const pt = { lat: e.latlng.lat, lng: e.latlng.lng }
        setCenter(pt)
        setStep("radius")
        setTempRadius(100)
        if (onRadiusChange) onRadiusChange(100)
      } else if (step === "radius" && center) {
        const radius = Math.round(
          haversineDistanceMeters(center, { lat: e.latlng.lat, lng: e.latlng.lng }),
        )
        const validation = validateCircleGeometry(center, radius)
        if (validation.valid) {
          onComplete({
            type: "circle",
            center,
            radiusMeters: radius,
          })
        } else {
          onError(validation.error ?? "Invalid circle radius. Must be between 50m and 500km.")
        }
      }
    },
    mousemove(e) {
      if (step === "radius" && center) {
        const r = Math.round(
          haversineDistanceMeters(center, { lat: e.latlng.lat, lng: e.latlng.lng }),
        )
        const clamped = Math.max(10, Math.min(500000, r))
        setTempRadius(clamped)
        if (onRadiusChange) onRadiusChange(clamped)
      }
    },
  })

  if (!center) return null

  return (
    <>
      <Marker position={[center.lat, center.lng]} icon={centerHandleIcon} />
      <Circle
        center={[center.lat, center.lng]}
        radius={tempRadius}
        pathOptions={{
          color: "#2563eb",
          fillColor: "#2563eb",
          fillOpacity: 0.2,
          dashArray: "6, 6",
          weight: 2,
        }}
      />
    </>
  )
}

// --- POLYGON DRAWER CONTROLLER ---

export type PolygonDrawerProps = {
  points: GeoPoint[]
  setPoints: React.Dispatch<React.SetStateAction<GeoPoint[]>>
  onComplete: (geometry: PolygonZoneGeometry) => void
  onError: (msg: string | null) => void
}

export function PolygonDrawer({
  points,
  setPoints,
  onError,
}: PolygonDrawerProps) {
  const map = useMap()
  const [cursorPoint, setCursorPoint] = useState<GeoPoint | null>(null)

  useEffect(() => {
    map.doubleClickZoom.disable()
    const container = map.getContainer()
    container.style.cursor = "crosshair"

    return () => {
      map.doubleClickZoom.enable()
      container.style.cursor = ""
    }
  }, [map])

  useMapEvents({
    click(e) {
      onError(null)
      const pt: GeoPoint = { lat: e.latlng.lat, lng: e.latlng.lng }
      setPoints((prev) => [...prev, pt])
    },
    mousemove(e) {
      setCursorPoint({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })

  const polylineCoords = useMemo(
    () => points.map((p) => [p.lat, p.lng] as [number, number]),
    [points],
  )

  const cursorLineCoords = useMemo(() => {
    if (!cursorPoint || points.length === 0) return null
    const last = points[points.length - 1]
    return [
      [last.lat, last.lng] as [number, number],
      [cursorPoint.lat, cursorPoint.lng] as [number, number],
    ]
  }, [points, cursorPoint])

  return (
    <>
      {/* Vertex Markers */}
      {points.map((p, idx) => (
        <Marker key={`draw-poly-pt-${idx}`} position={[p.lat, p.lng]} icon={vertexHandleIcon} />
      ))}

      {/* Connected Placed Lines */}
      {points.length >= 2 ? (
        <Polyline positions={polylineCoords} pathOptions={{ color: "#10b981", weight: 3 }} />
      ) : null}

      {/* Live Pointer Segment */}
      {cursorLineCoords ? (
        <Polyline
          positions={cursorLineCoords}
          pathOptions={{ color: "#10b981", weight: 2, dashArray: "4, 4" }}
        />
      ) : null}

      {/* Preview Closed Polygon when >= 3 points */}
      {points.length >= 3 ? (
        <Polygon
          positions={polylineCoords}
          pathOptions={{
            color: "#10b981",
            fillColor: "#10b981",
            fillOpacity: 0.15,
            dashArray: "4, 4",
            weight: 2,
          }}
        />
      ) : null}
    </>
  )
}

// --- CIRCLE EDITOR CONTROLLER ---

export type CircleEditorProps = {
  zone: ProjectZone & { geometry: CircleZoneGeometry }
  center: GeoPoint
  setCenter: (c: GeoPoint) => void
  radiusMeters: number
  setRadiusMeters: (r: number) => void
  onSave: () => void
  onCancel: () => void
}

export function CircleEditor({
  zone,
  center,
  setCenter,
  radiusMeters,
  setRadiusMeters,
}: CircleEditorProps) {
  const map = useMap()

  // Calculate Eastern boundary position for draggable radius handle
  const radiusHandlePos = useMemo(() => {
    const latRad = (center.lat * Math.PI) / 180
    const metersPerDegLng = 111_139 * Math.cos(latRad)
    const lngOffset = metersPerDegLng > 0 ? radiusMeters / metersPerDegLng : 0.001
    return [center.lat, center.lng + lngOffset] as [number, number]
  }, [center, radiusMeters])

  useEffect(() => {
    map.doubleClickZoom.disable()
    return () => {
      map.doubleClickZoom.enable()
    }
  }, [map])

  const handleCenterDragEnd = (e: { target: { getLatLng: () => LatLng } }) => {
    const latlng = e.target.getLatLng()
    setCenter({ lat: latlng.lat, lng: latlng.lng })
  }

  const handleRadiusDrag = (e: { target: { getLatLng: () => LatLng } }) => {
    const latlng = e.target.getLatLng()
    const dist = Math.round(haversineDistanceMeters(center, { lat: latlng.lat, lng: latlng.lng }))
    const clamped = Math.max(50, Math.min(500000, dist))
    setRadiusMeters(clamped)
  }

  return (
    <>
      <Circle
        center={[center.lat, center.lng]}
        radius={radiusMeters}
        pathOptions={{
          color: zone.color,
          fillColor: zone.color,
          fillOpacity: 0.25,
          weight: 2,
        }}
      />
      {/* Center Draggable Marker */}
      <Marker
        position={[center.lat, center.lng]}
        draggable={true}
        eventHandlers={{ dragend: handleCenterDragEnd }}
        icon={centerHandleIcon}
      />
      {/* Radius Draggable Boundary Handle */}
      <Marker
        position={radiusHandlePos}
        draggable={true}
        eventHandlers={{ drag: handleRadiusDrag, dragend: handleRadiusDrag }}
        icon={radiusHandleIcon}
      />
    </>
  )
}

// --- POLYGON EDITOR CONTROLLER ---

export type PolygonEditorProps = {
  zone: ProjectZone & { geometry: PolygonZoneGeometry }
  vertices: GeoPoint[]
  setVertices: React.Dispatch<React.SetStateAction<GeoPoint[]>>
}

export function PolygonEditor({
  zone,
  vertices,
  setVertices,
}: PolygonEditorProps) {
  const map = useMap()

  useEffect(() => {
    map.doubleClickZoom.disable()
    return () => {
      map.doubleClickZoom.enable()
    }
  }, [map])

  const handleVertexDragEnd = (index: number, latlng: LatLng) => {
    setVertices((prev) => {
      const next = [...prev]
      next[index] = { lat: latlng.lat, lng: latlng.lng }
      return next
    })
  }

  const handleRemoveVertex = (index: number) => {
    if (vertices.length <= 3) return
    setVertices((prev) => prev.filter((_, i) => i !== index))
  }

  const handleInsertVertex = (afterIndex: number, midpoint: GeoPoint) => {
    setVertices((prev) => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, midpoint)
      return next
    })
  }

  const positions = useMemo(
    () => vertices.map((p) => [p.lat, p.lng] as [number, number]),
    [vertices],
  )

  // Midpoints between adjacent vertices for insertion
  const midpoints = useMemo(() => {
    const list: { afterIndex: number; point: GeoPoint }[] = []
    const n = vertices.length
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n
      const p1 = vertices[i]
      const p2 = vertices[next]
      list.push({
        afterIndex: i,
        point: {
          lat: (p1.lat + p2.lat) / 2,
          lng: (p1.lng + p2.lng) / 2,
        },
      })
    }
    return list
  }, [vertices])

  return (
    <>
      <Polygon
        positions={positions}
        pathOptions={{
          color: zone.color,
          fillColor: zone.color,
          fillOpacity: 0.25,
          weight: 2,
        }}
      />

      {/* Draggable Vertex Handles */}
      {vertices.map((v, idx) => (
        <Marker
          key={`edit-vtx-${idx}`}
          position={[v.lat, v.lng]}
          draggable={true}
          eventHandlers={{
            dragend: (e) => handleVertexDragEnd(idx, e.target.getLatLng()),
            click: (e) => {
              // If clicked directly and we have > 3 vertices, prompt or allow removal
              if (vertices.length > 3 && e.originalEvent.altKey) {
                handleRemoveVertex(idx)
              }
            },
          }}
          icon={vertexHandleIcon}
        />
      ))}

      {/* Midpoint Insertion Handles */}
      {midpoints.map((m, idx) => (
        <Marker
          key={`edit-mid-${idx}`}
          position={[m.point.lat, m.point.lng]}
          eventHandlers={{
            click: () => handleInsertVertex(m.afterIndex, m.point),
          }}
          icon={midpointHandleIcon}
        />
      ))}
    </>
  )
}
