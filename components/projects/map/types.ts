import type { ProjectZone, ZoneGeometry } from "@/lib/zones/types"

export type MapProjectItem = {
  id: string
  name: string
  code: string | null
  latitude: number
  longitude: number
  status: string
  ownerClient: string | null
  address: string | null
  areaDistrict: string | null
  supervisorName: string | null
  progress: number | null
  imageUrl: string | null
}

export type MapCluster = {
  id: string
  isCluster: true
  latitude: number
  longitude: number
  count: number
  projects: MapProjectItem[]
  bounds: [[number, number], [number, number]] // [southWest, northEast]
}

export type MapSingleMarker = {
  id: string
  isCluster: false
  project: MapProjectItem
  latitude: number
  longitude: number
}

export type ClusterOrMarker = MapCluster | MapSingleMarker

export type DrawingMode =
  | "idle"
  | "drawing_circle"
  | "drawing_polygon"
  | "editing_circle"
  | "editing_polygon"

export type ProjectMapCanvasProps = {
  projects: MapProjectItem[]
  zones: ProjectZone[]
  fitBoundsTrigger: number
  locale: string
  canManageZones?: boolean
  drawingMode?: DrawingMode
  activeEditingZone?: ProjectZone | null
  activeDraftGeometry?: ZoneGeometry | null
  onDrawingComplete?: (geometry: ZoneGeometry) => void
  onDrawingCancel?: () => void
  onStartEditZone?: (zone: ProjectZone) => void
  onSaveEditedGeometry?: (geometry: ZoneGeometry) => void
  onRequestEditDetails?: (zone: ProjectZone) => void
  onRequestDeleteZone?: (zone: ProjectZone) => void
}
