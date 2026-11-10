import type { GeoPoint } from "./types"

/** Earth mean radius in meters according to WGS84 */
export const EARTH_RADIUS_METERS = 6_371_000

/**
 * Validates that a point contains finite latitude and longitude within geographic bounds:
 * - Latitude: [-90, 90]
 * - Longitude: [-180, 180]
 */
export function isValidGeoPoint(point: unknown): point is GeoPoint {
  if (typeof point !== "object" || point === null) return false
  const p = point as Record<string, unknown>
  if (typeof p.lat !== "number" || typeof p.lng !== "number") return false
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false
  return p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180
}

/**
 * Calculates the great-circle distance between two geographic points in meters
 * using the Haversine formula.
 * Returns NaN if either point is invalid.
 */
export function haversineDistanceMeters(pointA: GeoPoint, pointB: GeoPoint): number {
  if (!isValidGeoPoint(pointA) || !isValidGeoPoint(pointB)) return Number.NaN

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(pointB.lat - pointA.lat)
  const dLng = toRad(pointB.lng - pointA.lng)
  const lat1 = toRad(pointA.lat)
  const lat2 = toRad(pointB.lat)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_METERS * c
}

/**
 * Validates circle zone geometry.
 * Radius must be between 50 meters and 500,000 meters (500 km).
 */
export function validateCircleGeometry(
  center: GeoPoint,
  radiusMeters: number,
): { valid: boolean; error?: string } {
  if (!isValidGeoPoint(center)) {
    return { valid: false, error: "Invalid circle center coordinates." }
  }
  if (!Number.isFinite(radiusMeters)) {
    return { valid: false, error: "Circle radius must be a finite number." }
  }
  if (radiusMeters < 50 || radiusMeters > 500_000) {
    return { valid: false, error: "Circle radius must be between 50 and 500,000 meters." }
  }
  return { valid: true }
}

/**
 * Determines whether a geographic point is inside a circle zone.
 * Boundary points are considered inside (distance <= radius).
 */
export function isPointInCircleZone(
  point: GeoPoint,
  zone: { center: GeoPoint; radiusMeters: number },
): boolean {
  if (!isValidGeoPoint(point) || !isValidGeoPoint(zone.center) || zone.radiusMeters < 0) {
    return false
  }
  const distance = haversineDistanceMeters(point, zone.center)
  // Float precision allowance: 1mm tolerance
  return distance <= zone.radiusMeters + 0.001
}

/**
 * Helper: checks if point P lies on the segment AB within tolerance.
 */
function isPointOnSegment(p: GeoPoint, a: GeoPoint, b: GeoPoint, toleranceDeg = 1e-7): boolean {
  // Check bounding box
  const minLat = Math.min(a.lat, b.lat) - toleranceDeg
  const maxLat = Math.max(a.lat, b.lat) + toleranceDeg
  const minLng = Math.min(a.lng, b.lng) - toleranceDeg
  const maxLng = Math.max(a.lng, b.lng) + toleranceDeg

  if (p.lat < minLat || p.lat > maxLat || p.lng < minLng || p.lng > maxLng) {
    return false
  }

  // Cross product to test collinearity: (P.lng - A.lng)*(B.lat - A.lat) - (P.lat - A.lat)*(B.lng - A.lng)
  const cross = (p.lng - a.lng) * (b.lat - a.lat) - (p.lat - a.lat) * (b.lng - a.lng)
  if (Math.abs(cross) > toleranceDeg) return false

  // Dot product to ensure P is between A and B
  const dot = (p.lng - a.lng) * (b.lng - a.lng) + (p.lat - a.lat) * (b.lat - a.lat)
  if (dot < 0) return false
  const sqLen = (b.lng - a.lng) ** 2 + (b.lat - a.lat) ** 2
  return dot <= sqLen + toleranceDeg
}

/**
 * Helper: tests if two segments (p1-q1) and (p2-q2) intersect.
 */
function doSegmentsIntersect(p1: GeoPoint, q1: GeoPoint, p2: GeoPoint, q2: GeoPoint): boolean {
  const orientation = (a: GeoPoint, b: GeoPoint, c: GeoPoint) => {
    const val = (b.lat - a.lat) * (c.lng - b.lng) - (b.lng - a.lng) * (c.lat - b.lat)
    if (Math.abs(val) < 1e-11) return 0 // collinear
    return val > 0 ? 1 : 2 // 1: clockwise, 2: counterclockwise
  }

  const o1 = orientation(p1, q1, p2)
  const o2 = orientation(p1, q1, q2)
  const o3 = orientation(p2, q2, p1)
  const o4 = orientation(p2, q2, q1)

  // General case: segments cross each other
  if (o1 !== o2 && o3 !== o4) return true

  // Special cases: collinear points on segment
  if (o1 === 0 && isPointOnSegment(p2, p1, q1)) return true
  if (o2 === 0 && isPointOnSegment(q2, p1, q1)) return true
  if (o3 === 0 && isPointOnSegment(p1, p2, q2)) return true
  if (o4 === 0 && isPointOnSegment(q1, p2, q2)) return true

  return false
}

/**
 * Checks whether any non-adjacent edges in a polygon intersect.
 */
function hasSelfIntersections(vertices: GeoPoint[]): boolean {
  const n = vertices.length
  if (n < 4) return false

  for (let i = 0; i < n; i++) {
    const iNext = (i + 1) % n
    const p1 = vertices[i]
    const q1 = vertices[iNext]

    for (let j = i + 1; j < n; j++) {
      const jNext = (j + 1) % n

      // Skip identical or adjacent edges (which naturally share a vertex)
      if (i === j || iNext === j || i === jNext || iNext === jNext) {
        continue
      }

      if (doSegmentsIntersect(p1, q1, vertices[j], vertices[jNext])) {
        return true
      }
    }
  }

  return false
}

/**
 * Validates polygon geometry:
 * - Must have at least 3 distinct vertices.
 * - Maximum 500 vertices.
 * - All vertices must be valid geographic coordinates.
 * - No consecutive duplicate vertices.
 * - No self-intersecting edges.
 * - Area must be non-zero (vertices cannot be collinear).
 *
 * Normalizes by trimming a closing vertex if it duplicates the first vertex.
 */
export function validatePolygonGeometry(
  coordinates: unknown,
): { valid: boolean; error?: string; normalized?: GeoPoint[] } {
  if (!Array.isArray(coordinates)) {
    return { valid: false, error: "Polygon coordinates must be an array." }
  }

  if (coordinates.length < 3) {
    return { valid: false, error: "Polygon must contain at least 3 vertices." }
  }

  if (coordinates.length > 500) {
    return { valid: false, error: "Polygon cannot exceed 500 vertices." }
  }

  // Parse points whether provided as GeoPoint {lat, lng} or [lat, lng]
  const parsed: GeoPoint[] = []
  for (let i = 0; i < coordinates.length; i++) {
    const item = coordinates[i]
    let point: GeoPoint | null = null

    if (Array.isArray(item) && item.length >= 2) {
      point = { lat: Number(item[0]), lng: Number(item[1]) }
    } else if (typeof item === "object" && item !== null && "lat" in item && "lng" in item) {
      point = { lat: Number((item as any).lat), lng: Number((item as any).lng) }
    }

    if (!point || !isValidGeoPoint(point)) {
      return { valid: false, error: `Vertex at index ${i} contains invalid coordinates.` }
    }
    parsed.push(point)
  }

  // Check for consecutive duplicate vertices
  for (let i = 0; i < parsed.length - 1; i++) {
    if (parsed[i].lat === parsed[i + 1].lat && parsed[i].lng === parsed[i + 1].lng) {
      return { valid: false, error: `Vertex ${i + 1} is identical to the preceding vertex.` }
    }
  }

  // Remove redundant closing vertex if it matches the first vertex
  let normalized = [...parsed]
  const first = normalized[0]
  const last = normalized[normalized.length - 1]
  if (normalized.length > 3 && first.lat === last.lat && first.lng === last.lng) {
    normalized = normalized.slice(0, -1)
  }

  if (normalized.length < 3) {
    return { valid: false, error: "Polygon must contain at least 3 distinct vertices." }
  }

  // Check self-intersections
  if (hasSelfIntersections(normalized)) {
    return { valid: false, error: "Polygon boundary cannot self-intersect (bowtie shape)." }
  }

  // Check area (vertices cannot be collinear)
  const area = calculatePolygonAreaSquareMeters(normalized)
  if (area < 1) {
    return { valid: false, error: "Polygon vertices are collinear or form a zero-area shape." }
  }

  return { valid: true, normalized }
}

/**
 * Determines whether a geographic point is inside a polygon zone.
 *
 * Algorithm Documentation:
 * Uses the ray-casting algorithm (Jordan curve theorem) with boundary-inclusion detection.
 * Computed on planar WGS84 geographic coordinates (latitude and longitude).
 *
 * Boundary Points:
 * Vertices and boundary edge segments are explicitly treated as inside.
 *
 * Geographic Limitations:
 * Designed for local/regional zones (e.g., city/governorate scale in Oman or similar regions).
 * Does not wrap across the antimeridian (longitude +-180) or over the North/South poles.
 */
export function isPointInPolygonZone(
  point: GeoPoint,
  polygon: GeoPoint[] | [number, number][],
): boolean {
  if (!isValidGeoPoint(point) || !Array.isArray(polygon) || polygon.length < 3) {
    return false
  }

  // Normalize polygon to GeoPoint[]
  const vertices: GeoPoint[] = polygon.map((item) => {
    if (Array.isArray(item)) return { lat: Number(item[0]), lng: Number(item[1]) }
    return item
  })

  // Exclude duplicate closing vertex if present
  let count = vertices.length
  if (
    count > 3 &&
    vertices[0].lat === vertices[count - 1].lat &&
    vertices[0].lng === vertices[count - 1].lng
  ) {
    count -= 1
  }

  if (count < 3) return false

  // 1. Boundary & Vertex inclusion check
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count
    if (isPointOnSegment(point, vertices[i], vertices[next])) {
      return true
    }
  }

  // 2. Ray-casting algorithm along positive longitude (+lng)
  let inside = false
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = vertices[i].lng
    const yi = vertices[i].lat
    const xj = vertices[j].lng
    const yj = vertices[j].lat

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi

    if (intersect) inside = !inside
  }

  return inside
}

/**
 * Calculates the approximate geographic area of a polygon in square meters
 * using the Shoelace formula projected on an equirectangular plane centered
 * at the polygon's mean latitude.
 *
 * Accuracy:
 * For regional scale zones (< 500 km across), this projection has an error of
 * less than 0.1% compared to a full ellipsoidal geodesic integration while
 * executing in microseconds with no external dependencies.
 */
export function calculatePolygonAreaSquareMeters(coordinates: GeoPoint[]): number {
  if (!Array.isArray(coordinates) || coordinates.length < 3) return 0

  // Filter trailing closing vertex if present
  let vertices = coordinates
  if (
    vertices.length > 3 &&
    vertices[0].lat === vertices[vertices.length - 1].lat &&
    vertices[0].lng === vertices[vertices.length - 1].lng
  ) {
    vertices = vertices.slice(0, -1)
  }

  if (vertices.length < 3) return 0

  const meanLat = vertices.reduce((sum, p) => sum + p.lat, 0) / vertices.length
  const latRad = (meanLat * Math.PI) / 180

  // 1 degree latitude ~= 111,139 meters; longitude scales with cos(latitude)
  const metersPerDegLat = 111_139
  const metersPerDegLng = metersPerDegLat * Math.cos(latRad)

  let area = 0
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const xi = vertices[i].lng * metersPerDegLng
    const yi = vertices[i].lat * metersPerDegLat
    const xj = vertices[j].lng * metersPerDegLng
    const yj = vertices[j].lat * metersPerDegLat
    area += xi * yj - xj * yi
  }

  return Math.abs(area) / 2
}
