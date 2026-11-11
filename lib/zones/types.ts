export type ProjectZoneType = "circle" | "polygon"

export type GeoPoint = {
  lat: number
  lng: number
}

export type CircleZoneGeometry = {
  type: "circle"
  center: GeoPoint
  radiusMeters: number
}

export type PolygonZoneGeometry = {
  type: "polygon"
  coordinates: GeoPoint[]
}

export type ZoneGeometry = CircleZoneGeometry | PolygonZoneGeometry

export type ProjectZone = {
  id: string
  organizationId: string
  name: string
  type: ProjectZoneType
  color: string
  geometry: ZoneGeometry
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type ProjectZoneRow = {
  id: string
  organization_id: string
  name: string
  zone_type: ProjectZoneType
  color: string
  circle_center_lat: number | null
  circle_center_lng: number | null
  circle_radius_meters: number | null
  polygon_coordinates: unknown
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CreateCircleZoneInput = {
  name: string
  type: "circle"
  color: string
  geometry: {
    center: GeoPoint
    radiusMeters: number
  }
}

export type CreatePolygonZoneInput = {
  name: string
  type: "polygon"
  color: string
  geometry: {
    coordinates: GeoPoint[]
  }
}

export type CreateZoneInput = CreateCircleZoneInput | CreatePolygonZoneInput

export type UpdateCircleZoneInput = {
  id: string
  name?: string
  type: "circle"
  color?: string
  geometry?: {
    center: GeoPoint
    radiusMeters: number
  }
}

export type UpdatePolygonZoneInput = {
  id: string
  name?: string
  type: "polygon"
  color?: string
  geometry?: {
    coordinates: GeoPoint[]
  }
}

export type UpdateZoneInput = UpdateCircleZoneInput | UpdatePolygonZoneInput

export type ZoneActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }

/**
 * Converts a database row to a strongly-typed domain ProjectZone.
 */
export function toDomainZone(row: ProjectZoneRow): ProjectZone {
  if (row.zone_type === "circle") {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      type: "circle",
      color: row.color,
      geometry: {
        type: "circle",
        center: {
          lat: Number(row.circle_center_lat),
          lng: Number(row.circle_center_lng),
        },
        radiusMeters: Number(row.circle_radius_meters),
      },
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  // Polygon coordinates can be stored as array of [lat, lng] or array of { lat, lng }
  let coordinates: GeoPoint[] = []
  if (Array.isArray(row.polygon_coordinates)) {
    coordinates = row.polygon_coordinates.map((item: unknown) => {
      if (Array.isArray(item) && item.length >= 2) {
        return { lat: Number(item[0]), lng: Number(item[1]) }
      }
      if (typeof item === "object" && item !== null && "lat" in item && "lng" in item) {
        return { lat: Number((item as any).lat), lng: Number((item as any).lng) }
      }
      return { lat: 0, lng: 0 }
    })
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    type: "polygon",
    color: row.color,
    geometry: {
      type: "polygon",
      coordinates,
    },
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
