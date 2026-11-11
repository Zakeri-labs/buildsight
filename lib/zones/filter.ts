import type { ProjectZone } from "./types"
import { isPointInCircleZone, isPointInPolygonZone } from "./geometry"

export interface LocatableProject {
  latitude?: number | null
  longitude?: number | null
}

/**
 * Checks whether a project's coordinates lie inside a specific geographic zone.
 */
export function isProjectInZone(
  project: LocatableProject,
  zone: ProjectZone
): boolean {
  const { latitude, longitude } = project
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return false
  }

  const pt = { lat: latitude, lng: longitude }

  if (zone.type === "circle" && zone.geometry.type === "circle") {
    return isPointInCircleZone(pt, zone.geometry)
  }

  if (zone.type === "polygon" && zone.geometry.type === "polygon") {
    return isPointInPolygonZone(pt, zone.geometry.coordinates)
  }

  return false
}

/**
 * Filters a project based on the selected zone filter:
 * - "all": Matches every project
 * - "__unassigned__": Matches projects with no coordinates OR projects outside all defined zones
 * - "<zone-id>": Matches projects located strictly inside the target zone
 */
export function filterProjectByZone(
  project: LocatableProject,
  selectedZone: string,
  zones: ProjectZone[]
): boolean {
  if (selectedZone === "all") return true

  const { latitude, longitude } = project
  const hasValidCoords =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180

  if (selectedZone === "__unassigned__") {
    if (!hasValidCoords) {
      return true
    }
    return !zones.some((z) => isProjectInZone(project, z))
  }

  if (!hasValidCoords) return false

  const targetZone = zones.find((z) => z.id === selectedZone)
  if (!targetZone) return false

  return isProjectInZone(project, targetZone)
}
