"use client"

import { useEffect, useMemo } from "react"
import { Icon, type LeafletEvent, type Marker as LeafletMarker } from "leaflet"
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet"

export type MapPoint = {
  latitude: number
  longitude: number
}

export type MapCenterRequest = MapPoint & {
  requestId: number
}

const MARKER_ICON = new Icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

function MapLifecycle({
  centerRequest,
  resizeRequest,
  onReady,
}: {
  centerRequest: MapCenterRequest | null
  resizeRequest: number
  onReady: () => void
}) {
  const map = useMap()

  useEffect(() => {
    let disposed = false
    const timers: number[] = []
    let resizeObserver: ResizeObserver | null = null

    const refresh = () => {
      if (disposed) return
      map.invalidateSize({ animate: false })
    }

    const announceReady = () => {
      refresh()
      if (!disposed) onReady()
    }

    const frame = window.requestAnimationFrame(announceReady)
    timers.push(window.setTimeout(refresh, 80))
    timers.push(window.setTimeout(refresh, 220))
    timers.push(window.setTimeout(refresh, 500))

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(refresh))
      resizeObserver.observe(map.getContainer())
    }

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      timers.forEach((timer) => window.clearTimeout(timer))
      resizeObserver?.disconnect()
    }
  }, [map, onReady])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false }))
    const first = window.setTimeout(() => map.invalidateSize({ animate: false }), 100)
    const second = window.setTimeout(() => map.invalidateSize({ animate: false }), 320)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(first)
      window.clearTimeout(second)
    }
  }, [map, resizeRequest])

  useEffect(() => {
    if (!centerRequest) return
    map.setView(
      [centerRequest.latitude, centerRequest.longitude],
      Math.max(map.getZoom(), 15),
      { animate: false },
    )
    window.requestAnimationFrame(() => map.invalidateSize({ animate: false }))
  }, [centerRequest, map])

  return null
}

function MapClickHandler({ onSelect }: { onSelect: (point: MapPoint) => void }) {
  useMapEvents({
    click(event) {
      onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng })
    },
  })
  return null
}

export function LocationMapCanvas({
  initialCenter,
  initialZoom,
  marker,
  centerRequest,
  resizeRequest = 0,
  tileUrl,
  tileAttribution,
  markerTitle,
  onSelect,
  onMarkerMove,
  onReady,
  onTileError,
  readOnly = false,
}: {
  initialCenter: MapPoint
  initialZoom: number
  marker: MapPoint | null
  centerRequest: MapCenterRequest | null
  resizeRequest?: number
  tileUrl: string
  tileAttribution: string
  markerTitle: string
  onSelect?: (point: MapPoint) => void
  onMarkerMove?: (point: MapPoint) => void
  onReady: () => void
  onTileError: () => void
  readOnly?: boolean
}) {
  const markerHandlers = useMemo(
    () => ({
      dragend(event: LeafletEvent) {
        if (!onMarkerMove) return
        const draggedMarker = event.target as LeafletMarker
        const position = draggedMarker.getLatLng()
        onMarkerMove({ latitude: position.lat, longitude: position.lng })
      },
    }),
    [onMarkerMove],
  )

  const tileHandlers = useMemo(
    () => ({
      tileerror: () => onTileError(),
    }),
    [onTileError],
  )

  return (
    <MapContainer
      center={[initialCenter.latitude, initialCenter.longitude]}
      zoom={initialZoom}
      minZoom={2}
      maxZoom={19}
      scrollWheelZoom
      className="h-full min-h-full w-full"
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url={tileUrl}
        attribution={tileAttribution}
        maxZoom={19}
        eventHandlers={tileHandlers}
      />
      {!readOnly && onSelect ? <MapClickHandler onSelect={onSelect} /> : null}
      <MapLifecycle centerRequest={centerRequest} resizeRequest={resizeRequest} onReady={onReady} />
      {marker && (
        <Marker
          position={[marker.latitude, marker.longitude]}
          draggable={!readOnly && Boolean(onMarkerMove)}
          icon={MARKER_ICON}
          title={markerTitle}
          eventHandlers={markerHandlers}
        />
      )}
    </MapContainer>
  )
}
