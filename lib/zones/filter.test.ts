import { describe, expect, it } from "vitest"
import { filterProjectByZone, isProjectInZone } from "./filter"
import type { ProjectZone } from "./types"

const mockCircleZone: ProjectZone = {
  id: "zone-circle-1",
  organizationId: "org-1",
  name: "Muscat Central",
  type: "circle",
  color: "#3b82f6",
  geometry: {
    type: "circle",
    center: { lat: 23.588, lng: 58.3829 },
    radiusMeters: 5000,
  },
  createdBy: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
}

const mockPolygonZone: ProjectZone = {
  id: "zone-poly-1",
  organizationId: "org-1",
  name: "Barka District",
  type: "polygon",
  color: "#10b981",
  geometry: {
    type: "polygon",
    coordinates: [
      { lat: 23.6, lng: 57.8 },
      { lat: 23.8, lng: 57.8 },
      { lat: 23.8, lng: 58.0 },
      { lat: 23.6, lng: 58.0 },
      { lat: 23.6, lng: 57.8 },
    ],
  },
  createdBy: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
}

const zones = [mockCircleZone, mockPolygonZone]

describe("filterProjectByZone", () => {
  it("returns true for any project when selectedZone is 'all'", () => {
    expect(filterProjectByZone({ latitude: 23.588, longitude: 58.3829 }, "all", zones)).toBe(true)
    expect(filterProjectByZone({ latitude: null, longitude: null }, "all", zones)).toBe(true)
    expect(filterProjectByZone({}, "all", zones)).toBe(true)
  })

  it("matches a project inside a circle zone", () => {
    // Project right at the center of Muscat circle zone
    const insideProject = { latitude: 23.588, longitude: 58.3829 }
    expect(isProjectInZone(insideProject, mockCircleZone)).toBe(true)
    expect(filterProjectByZone(insideProject, mockCircleZone.id, zones)).toBe(true)

    // Project far outside
    const outsideProject = { latitude: 24.5, longitude: 59.0 }
    expect(isProjectInZone(outsideProject, mockCircleZone)).toBe(false)
    expect(filterProjectByZone(outsideProject, mockCircleZone.id, zones)).toBe(false)
  })

  it("matches a project inside a polygon zone", () => {
    // Project inside Barka polygon (23.7, 57.9)
    const insidePoly = { latitude: 23.7, longitude: 57.9 }
    expect(isProjectInZone(insidePoly, mockPolygonZone)).toBe(true)
    expect(filterProjectByZone(insidePoly, mockPolygonZone.id, zones)).toBe(true)

    // Project outside Barka polygon
    const outsidePoly = { latitude: 23.5, longitude: 57.5 }
    expect(isProjectInZone(outsidePoly, mockPolygonZone)).toBe(false)
    expect(filterProjectByZone(outsidePoly, mockPolygonZone.id, zones)).toBe(false)
  })

  it("handles '__unassigned__' (outside zones) correctly", () => {
    // Unmapped projects count as outside any zone
    expect(filterProjectByZone({ latitude: null, longitude: null }, "__unassigned__", zones)).toBe(true)
    expect(filterProjectByZone({ latitude: undefined, longitude: undefined }, "__unassigned__", zones)).toBe(true)
    expect(filterProjectByZone({}, "__unassigned__", zones)).toBe(true)

    // Project far away outside both zones
    const remoteProject = { latitude: 22.0, longitude: 56.0 }
    expect(filterProjectByZone(remoteProject, "__unassigned__", zones)).toBe(true)

    // Project inside Muscat circle zone -> NOT unassigned
    const insideCircle = { latitude: 23.588, longitude: 58.3829 }
    expect(filterProjectByZone(insideCircle, "__unassigned__", zones)).toBe(false)

    // Project inside Barka polygon -> NOT unassigned
    const insidePoly = { latitude: 23.7, longitude: 57.9 }
    expect(filterProjectByZone(insidePoly, "__unassigned__", zones)).toBe(false)
  })

  it("returns false for projects without coordinates when a specific zone is selected", () => {
    expect(filterProjectByZone({ latitude: null, longitude: null }, mockCircleZone.id, zones)).toBe(false)
    expect(filterProjectByZone({}, mockPolygonZone.id, zones)).toBe(false)
  })

  it("returns false if a non-existent zone ID is passed", () => {
    expect(filterProjectByZone({ latitude: 23.588, longitude: 58.3829 }, "non-existent-zone", zones)).toBe(false)
  })
})
