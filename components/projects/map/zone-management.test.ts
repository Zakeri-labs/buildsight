import { describe, expect, test } from "vitest"
import {
  calculatePolygonAreaSquareMeters,
  checkZonesOverlap,
  haversineDistanceMeters,
  validateCircleGeometry,
  validatePolygonGeometry,
} from "@/lib/zones/geometry"
import type { CircleZoneGeometry, PolygonZoneGeometry } from "@/lib/zones/types"
import { formatArea, formatDistance } from "./formatters"

describe("Phase 3: Zone Management & Geometry Logic", () => {
  describe("Test A: Circle Zone Creation & Radius Calculation", () => {
    test("calculates radius correctly using Haversine distance", () => {
      const center = { lat: 23.588, lng: 58.3829 } // Muscat
      const boundary = { lat: 23.597, lng: 58.3829 } // ~1 km North

      const distance = haversineDistanceMeters(center, boundary)
      expect(distance).toBeGreaterThan(950)
      expect(distance).toBeLessThan(1050)

      const validation = validateCircleGeometry(center, distance)
      expect(validation.valid).toBe(true)
    })

    test("formats distance correctly in English and Arabic", () => {
      expect(formatDistance(450, false)).toBe("450 m")
      expect(formatDistance(450, true)).toBe("450 م")
      expect(formatDistance(2500, false)).toBe("2.50 km")
      expect(formatDistance(2500, true)).toBe("2.50 كم")
    })
  })

  describe("Test B: Polygon Zone Creation & Area Calculation", () => {
    test("validates polygon with 4 vertices and computes approximate area", () => {
      const coords = [
        { lat: 23.58, lng: 58.38 },
        { lat: 23.60, lng: 58.38 },
        { lat: 23.60, lng: 58.40 },
        { lat: 23.58, lng: 58.40 },
      ]

      const validation = validatePolygonGeometry(coords)
      expect(validation.valid).toBe(true)
      expect(validation.normalized).toHaveLength(4)

      const area = calculatePolygonAreaSquareMeters(coords)
      expect(area).toBeGreaterThan(4_000_000) // ~4.3 km²
      expect(formatArea(area, false)).toContain("km²")
      expect(formatArea(area, true)).toContain("كم²")
    })
  })

  describe("Test C: Invalid Geometry Rejection", () => {
    test("rejects circles smaller than 50 meters", () => {
      const center = { lat: 23.588, lng: 58.3829 }
      const validation = validateCircleGeometry(center, 49)
      expect(validation.valid).toBe(false)
      expect(validation.error).toContain("between 50 and 500,000 meters")
    })

    test("rejects circles larger than 500,000 meters", () => {
      const center = { lat: 23.588, lng: 58.3829 }
      const validation = validateCircleGeometry(center, 500_001)
      expect(validation.valid).toBe(false)
    })

    test("rejects polygons with fewer than 3 vertices", () => {
      const coords = [
        { lat: 23.58, lng: 58.38 },
        { lat: 23.60, lng: 58.38 },
      ]
      const validation = validatePolygonGeometry(coords)
      expect(validation.valid).toBe(false)
      expect(validation.error).toContain("at least 3 vertices")
    })

    test("rejects self-intersecting (bowtie) polygons", () => {
      const bowtie = [
        { lat: 23.0, lng: 58.0 },
        { lat: 23.0, lng: 59.0 },
        { lat: 22.0, lng: 58.0 },
        { lat: 22.0, lng: 59.0 },
      ]
      const validation = validatePolygonGeometry(bowtie)
      expect(validation.valid).toBe(false)
      expect(validation.error).toContain("self-intersect")
    })

    test("rejects collinear zero-area polygons", () => {
      const collinear = [
        { lat: 23.0, lng: 58.0 },
        { lat: 23.1, lng: 58.1 },
        { lat: 23.2, lng: 58.2 },
      ]
      const validation = validatePolygonGeometry(collinear)
      expect(validation.valid).toBe(false)
      expect(validation.error).toContain("zero-area")
    })
  })

  describe("Test D & G: Overlap Detection Logic", () => {
    test("detects overlapping circle zones and non-overlapping circle zones", () => {
      const circleA: CircleZoneGeometry = {
        type: "circle",
        center: { lat: 23.588, lng: 58.3829 },
        radiusMeters: 2000,
      }
      const circleB_overlapping: CircleZoneGeometry = {
        type: "circle",
        center: { lat: 23.595, lng: 58.39 },
        radiusMeters: 1000,
      }
      const circleC_disjoint: CircleZoneGeometry = {
        type: "circle",
        center: { lat: 24.5, lng: 59.5 },
        radiusMeters: 500,
      }

      expect(checkZonesOverlap(circleA, circleB_overlapping)).toBe(true)
      expect(checkZonesOverlap(circleA, circleC_disjoint)).toBe(false)
    })

    test("detects overlapping polygon and circle zones", () => {
      const circle: CircleZoneGeometry = {
        type: "circle",
        center: { lat: 23.59, lng: 58.39 },
        radiusMeters: 1500,
      }
      const polygon: PolygonZoneGeometry = {
        type: "polygon",
        coordinates: [
          { lat: 23.58, lng: 58.38 },
          { lat: 23.60, lng: 58.38 },
          { lat: 23.60, lng: 58.40 },
          { lat: 23.58, lng: 58.40 },
        ],
      }
      expect(checkZonesOverlap(circle, polygon)).toBe(true)
    })
  })

  describe("Test F: Role-based Authorization Logic", () => {
    function canManageZones(role: string | null): boolean {
      return role === "org_admin" || role === "org_manager"
    }

    function isRoleForbidden(role: string | null): boolean {
      return role === "architect_administrator"
    }

    test("grants zone management only to org_admin and org_manager", () => {
      expect(canManageZones("org_admin")).toBe(true)
      expect(canManageZones("org_manager")).toBe(true)
      expect(canManageZones("org_member")).toBe(false)
      expect(canManageZones("viewer")).toBe(false)
      expect(canManageZones("architect_administrator")).toBe(false)
      expect(canManageZones(null)).toBe(false)
    })

    test("completely forbids architect_administrator", () => {
      expect(isRoleForbidden("architect_administrator")).toBe(true)
      expect(isRoleForbidden("org_admin")).toBe(false)
      expect(isRoleForbidden("org_manager")).toBe(false)
      expect(isRoleForbidden("org_member")).toBe(false)
      expect(isRoleForbidden("viewer")).toBe(false)
    })
  })
})
