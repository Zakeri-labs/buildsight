import { describe, expect, test } from "vitest"
import {
  calculatePolygonAreaSquareMeters,
  haversineDistanceMeters,
  isPointInCircleZone,
  isPointInPolygonZone,
  isValidGeoPoint,
  validateCircleGeometry,
  validatePolygonGeometry,
} from "./geometry"
import type { GeoPoint } from "./types"

describe("Coordinate Validation (isValidGeoPoint)", () => {
  test("accepts valid Oman coordinates", () => {
    expect(isValidGeoPoint({ lat: 23.588, lng: 58.3829 })).toBe(true) // Muscat
    expect(isValidGeoPoint({ lat: 23.610473, lng: 58.23622 })).toBe(true) // Mawelah
    expect(isValidGeoPoint({ lat: 0, lng: 0 })).toBe(true)
    expect(isValidGeoPoint({ lat: 90, lng: 180 })).toBe(true)
    expect(isValidGeoPoint({ lat: -90, lng: -180 })).toBe(true)
  })

  test("rejects latitude out of bounds", () => {
    expect(isValidGeoPoint({ lat: -90.0001, lng: 58.0 })).toBe(false)
    expect(isValidGeoPoint({ lat: 90.0001, lng: 58.0 })).toBe(false)
    expect(isValidGeoPoint({ lat: 100, lng: 58.0 })).toBe(false)
  })

  test("rejects longitude out of bounds", () => {
    expect(isValidGeoPoint({ lat: 23.0, lng: -180.0001 })).toBe(false)
    expect(isValidGeoPoint({ lat: 23.0, lng: 180.0001 })).toBe(false)
    expect(isValidGeoPoint({ lat: 23.0, lng: 200 })).toBe(false)
  })

  test("rejects NaN and Infinity", () => {
    expect(isValidGeoPoint({ lat: Number.NaN, lng: 58.0 })).toBe(false)
    expect(isValidGeoPoint({ lat: 23.0, lng: Number.NaN })).toBe(false)
    expect(isValidGeoPoint({ lat: Number.POSITIVE_INFINITY, lng: 58.0 })).toBe(false)
    expect(isValidGeoPoint({ lat: 23.0, lng: Number.NEGATIVE_INFINITY })).toBe(false)
  })

  test("rejects non-object or missing properties", () => {
    expect(isValidGeoPoint(null)).toBe(false)
    expect(isValidGeoPoint(undefined)).toBe(false)
    expect(isValidGeoPoint("23.5, 58.3")).toBe(false)
    expect(isValidGeoPoint({ lat: 23.5 })).toBe(false)
    expect(isValidGeoPoint({ lng: 58.3 })).toBe(false)
    expect(isValidGeoPoint({ lat: "23.5", lng: "58.3" })).toBe(false)
  })
})

describe("Haversine Distance (haversineDistanceMeters)", () => {
  test("returns 0 for identical points", () => {
    const p = { lat: 23.588, lng: 58.3829 }
    expect(haversineDistanceMeters(p, p)).toBe(0)
  })

  test("calculates accurate geographic distance between Muscat and Seeb Airport", () => {
    const muscat = { lat: 23.588, lng: 58.3829 }
    const seebAirport = { lat: 23.5933, lng: 58.2844 }
    const dist = haversineDistanceMeters(muscat, seebAirport)
    // Distance is approximately 10.05 km (10,050 meters)
    expect(dist).toBeGreaterThan(9_900)
    expect(dist).toBeLessThan(10_200)
  })

  test("returns NaN for invalid coordinates", () => {
    expect(haversineDistanceMeters({ lat: 23.5, lng: 58.0 }, { lat: 95, lng: 58.0 })).toBeNaN()
    expect(haversineDistanceMeters({ lat: Number.NaN, lng: 58.0 }, { lat: 23.5, lng: 58.0 })).toBeNaN()
  })
})

describe("Circle Validation (validateCircleGeometry)", () => {
  test("accepts valid circle center and radius", () => {
    const res = validateCircleGeometry({ lat: 23.588, lng: 58.3829 }, 5_000)
    expect(res.valid).toBe(true)
    expect(res.error).toBeUndefined()
  })

  test("rejects invalid center coordinates", () => {
    const res = validateCircleGeometry({ lat: 95, lng: 58.3829 }, 5_000)
    expect(res.valid).toBe(false)
    expect(res.error).toContain("Invalid circle center")
  })

  test("rejects radius below minimum (50m)", () => {
    const res = validateCircleGeometry({ lat: 23.588, lng: 58.3829 }, 49)
    expect(res.valid).toBe(false)
    expect(res.error).toContain("between 50 and 500,000 meters")
  })

  test("rejects radius above maximum (500km)", () => {
    const res = validateCircleGeometry({ lat: 23.588, lng: 58.3829 }, 500_001)
    expect(res.valid).toBe(false)
    expect(res.error).toContain("between 50 and 500,000 meters")
  })

  test("rejects non-finite radius", () => {
    expect(validateCircleGeometry({ lat: 23.588, lng: 58.3829 }, Number.NaN).valid).toBe(false)
    expect(validateCircleGeometry({ lat: 23.588, lng: 58.3829 }, Number.POSITIVE_INFINITY).valid).toBe(false)
  })
})

describe("Circle Matching (isPointInCircleZone)", () => {
  const center: GeoPoint = { lat: 23.600, lng: 58.400 }
  const radiusMeters = 1_000
  const zone = { center, radiusMeters }

  test("point at circle center is inside", () => {
    expect(isPointInCircleZone(center, zone)).toBe(true)
  })

  test("point clearly inside is inside", () => {
    // Offset ~200 meters north (1 deg lat ~= 111,139m -> 0.002 deg ~= 222m)
    const insidePoint: GeoPoint = { lat: 23.602, lng: 58.400 }
    expect(isPointInCircleZone(insidePoint, zone)).toBe(true)
  })

  test("point clearly outside is outside", () => {
    // Offset ~3,300 meters north
    const outsidePoint: GeoPoint = { lat: 23.630, lng: 58.400 }
    expect(isPointInCircleZone(outsidePoint, zone)).toBe(false)
  })

  test("point exactly on radius boundary is considered inside", () => {
    // Distance along latitude: dLat in degrees = radius / 6371000 * 180 / PI
    const dLat = (radiusMeters / 6_371_000) * (180 / Math.PI)
    const boundaryPoint: GeoPoint = { lat: center.lat + dLat, lng: center.lng }

    const dist = haversineDistanceMeters(boundaryPoint, center)
    expect(Math.abs(dist - radiusMeters)).toBeLessThan(0.01)
    expect(isPointInCircleZone(boundaryPoint, zone)).toBe(true)
  })

  test("returns false for invalid inputs", () => {
    expect(isPointInCircleZone({ lat: Number.NaN, lng: 58.0 }, zone)).toBe(false)
    expect(isPointInCircleZone({ lat: 23.6, lng: 58.4 }, { center: { lat: 100, lng: 58 }, radiusMeters: 500 })).toBe(false)
    expect(isPointInCircleZone({ lat: 23.6, lng: 58.4 }, { center, radiusMeters: -10 })).toBe(false)
  })
})

describe("Polygon Validation (validatePolygonGeometry)", () => {
  const square: GeoPoint[] = [
    { lat: 23.60, lng: 58.40 },
    { lat: 23.62, lng: 58.40 },
    { lat: 23.62, lng: 58.42 },
    { lat: 23.60, lng: 58.42 },
  ]

  test("accepts valid square polygon", () => {
    const res = validatePolygonGeometry(square)
    expect(res.valid).toBe(true)
    expect(res.normalized?.length).toBe(4)
  })

  test("normalizes polygon with repeated closing vertex", () => {
    const closedSquare = [...square, { lat: 23.60, lng: 58.40 }]
    const res = validatePolygonGeometry(closedSquare)
    expect(res.valid).toBe(true)
    // Redundant closing vertex is trimmed to canonical 4 vertices
    expect(res.normalized?.length).toBe(4)
  })

  test("rejects polygon with fewer than 3 vertices", () => {
    const res = validatePolygonGeometry([
      { lat: 23.60, lng: 58.40 },
      { lat: 23.62, lng: 58.40 },
    ])
    expect(res.valid).toBe(false)
    expect(res.error).toContain("at least 3 vertices")
  })

  test("rejects polygon with consecutive duplicate vertices", () => {
    const res = validatePolygonGeometry([
      { lat: 23.60, lng: 58.40 },
      { lat: 23.60, lng: 58.40 }, // duplicate
      { lat: 23.62, lng: 58.40 },
      { lat: 23.62, lng: 58.42 },
    ])
    expect(res.valid).toBe(false)
    expect(res.error).toContain("identical to the preceding vertex")
  })

  test("rejects collinear zero-area polygon", () => {
    const res = validatePolygonGeometry([
      { lat: 23.60, lng: 58.40 },
      { lat: 23.61, lng: 58.40 },
      { lat: 23.62, lng: 58.40 },
    ])
    expect(res.valid).toBe(false)
    expect(res.error).toContain("collinear")
  })

  test("rejects self-intersecting bowtie polygon", () => {
    // Vertices cross over each other: (0,0) -> (1,1) -> (0,1) -> (1,0)
    const bowtie: GeoPoint[] = [
      { lat: 23.60, lng: 58.40 },
      { lat: 23.62, lng: 58.42 },
      { lat: 23.62, lng: 58.40 },
      { lat: 23.60, lng: 58.42 },
    ]
    const res = validatePolygonGeometry(bowtie)
    expect(res.valid).toBe(false)
    expect(res.error).toContain("cannot self-intersect")
  })

  test("rejects excessive vertex count (> 500)", () => {
    const many: GeoPoint[] = []
    for (let i = 0; i < 505; i++) {
      const angle = (i * 2 * Math.PI) / 505
      many.push({ lat: 23.6 + 0.01 * Math.sin(angle), lng: 58.4 + 0.01 * Math.cos(angle) })
    }
    const res = validatePolygonGeometry(many)
    expect(res.valid).toBe(false)
    expect(res.error).toContain("cannot exceed 500 vertices")
  })
})

describe("Polygon Matching (isPointInPolygonZone)", () => {
  const square: GeoPoint[] = [
    { lat: 23.60, lng: 58.40 },
    { lat: 23.62, lng: 58.40 },
    { lat: 23.62, lng: 58.42 },
    { lat: 23.60, lng: 58.42 },
  ]

  test("point clearly inside square is inside", () => {
    expect(isPointInPolygonZone({ lat: 23.61, lng: 58.41 }, square)).toBe(true)
  })

  test("point outside square is outside", () => {
    expect(isPointInPolygonZone({ lat: 23.59, lng: 58.41 }, square)).toBe(false) // south
    expect(isPointInPolygonZone({ lat: 23.63, lng: 58.41 }, square)).toBe(false) // north
    expect(isPointInPolygonZone({ lat: 23.61, lng: 58.39 }, square)).toBe(false) // west
    expect(isPointInPolygonZone({ lat: 23.61, lng: 58.43 }, square)).toBe(false) // east
  })

  test("point exactly on vertex is considered inside", () => {
    expect(isPointInPolygonZone(square[0], square)).toBe(true)
    expect(isPointInPolygonZone(square[1], square)).toBe(true)
    expect(isPointInPolygonZone(square[2], square)).toBe(true)
    expect(isPointInPolygonZone(square[3], square)).toBe(true)
  })

  test("point on vertical or horizontal boundary edge is inside", () => {
    // Midpoint of west vertical edge (lng = 58.40, lat = 23.61)
    expect(isPointInPolygonZone({ lat: 23.61, lng: 58.40 }, square)).toBe(true)
    // Midpoint of south horizontal edge (lat = 23.60, lng = 58.41)
    expect(isPointInPolygonZone({ lat: 23.60, lng: 58.41 }, square)).toBe(true)
  })

  test("handles concave L-shaped polygon", () => {
    // L-shape with an inner notch
    const lShape: GeoPoint[] = [
      { lat: 0, lng: 0 },
      { lat: 3, lng: 0 },
      { lat: 3, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 3 },
      { lat: 0, lng: 3 },
    ]

    expect(isPointInPolygonZone({ lat: 0.5, lng: 0.5 }, lShape)).toBe(true) // in base
    expect(isPointInPolygonZone({ lat: 2.0, lng: 0.5 }, lShape)).toBe(true) // in upright arm
    expect(isPointInPolygonZone({ lat: 0.5, lng: 2.0 }, lShape)).toBe(true) // in horizontal arm
    expect(isPointInPolygonZone({ lat: 2.0, lng: 2.0 }, lShape)).toBe(false) // in cutout void
  })

  test("accepts polygon coordinates as [lat, lng] array format", () => {
    const rawCoords: [number, number][] = [
      [23.60, 58.40],
      [23.62, 58.40],
      [23.62, 58.42],
      [23.60, 58.42],
    ]
    expect(isPointInPolygonZone({ lat: 23.61, lng: 58.41 }, rawCoords)).toBe(true)
    expect(isPointInPolygonZone({ lat: 23.50, lng: 58.41 }, rawCoords)).toBe(false)
  })
})

describe("Polygon Area (calculatePolygonAreaSquareMeters)", () => {
  test("computes approximately correct area for a 1km x 1km square", () => {
    // ~1km = ~0.00899 deg latitude
    const dLat = 1_000 / 111_139
    const dLng = 1_000 / (111_139 * Math.cos((23.6 * Math.PI) / 180))

    const square: GeoPoint[] = [
      { lat: 23.60, lng: 58.40 },
      { lat: 23.60 + dLat, lng: 58.40 },
      { lat: 23.60 + dLat, lng: 58.40 + dLng },
      { lat: 23.60, lng: 58.40 + dLng },
    ]

    const area = calculatePolygonAreaSquareMeters(square)
    // 1 km² = 1,000,000 m². Allow 1% projection variance.
    expect(area).toBeGreaterThan(990_000)
    expect(area).toBeLessThan(1_010_000)
  })

  test("returns 0 for degenerate polygons", () => {
    expect(calculatePolygonAreaSquareMeters([])).toBe(0)
    expect(calculatePolygonAreaSquareMeters([{ lat: 23, lng: 58 }])).toBe(0)
  })
})

describe("Performance & Scale Benchmark (Deterministic)", () => {
  test("evaluates 352 projects against 20 mixed zones instantaneously", () => {
    // Generate 352 synthetic project coordinates across Muscat
    const projects: GeoPoint[] = []
    for (let i = 0; i < 352; i++) {
      projects.push({
        lat: 23.55 + (i % 25) * 0.005,
        lng: 58.20 + Math.floor(i / 25) * 0.015,
      })
    }

    // Generate 10 circle zones and 10 polygon zones
    const circleZones = Array.from({ length: 10 }, (_, i) => ({
      center: { lat: 23.58 + i * 0.01, lng: 58.30 + i * 0.01 },
      radiusMeters: 3_000 + i * 500,
    }))

    const polygonZones = Array.from({ length: 10 }, (_, i) => [
      { lat: 23.56 + i * 0.008, lng: 58.25 + i * 0.008 },
      { lat: 23.60 + i * 0.008, lng: 58.25 + i * 0.008 },
      { lat: 23.60 + i * 0.008, lng: 58.32 + i * 0.008 },
      { lat: 23.56 + i * 0.008, lng: 58.32 + i * 0.008 },
    ])

    const start = performance.now()
    let matchCount = 0

    for (const project of projects) {
      for (const circle of circleZones) {
        if (isPointInCircleZone(project, circle)) matchCount++
      }
      for (const poly of polygonZones) {
        if (isPointInPolygonZone(project, poly)) matchCount++
      }
    }

    const elapsedMs = performance.now() - start

    // Total operations = 352 * 20 = 7,040 evaluations
    expect(matchCount).toBeGreaterThan(0)
    // Must complete comfortably under 100ms in JavaScript (typically ~2-5ms)
    expect(elapsedMs).toBeLessThan(100)
  })
})
