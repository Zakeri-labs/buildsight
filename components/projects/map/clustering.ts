import type { ClusterOrMarker, MapCluster, MapProjectItem, MapSingleMarker } from "./types"

/**
 * Projects a geographic (lat, lng) to Web Mercator pixel coordinates at a given zoom level.
 */
export function projectToPixels(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const sinY = Math.sin((lat * Math.PI) / 180)
  // Clamp to avoid Infinity at polar extremes
  const clampedSinY = Math.min(Math.max(sinY, -0.9999), 0.9999)
  const scale = 256 * 2 ** zoom

  const x = scale * (lng / 360 + 0.5)
  const y = scale * (0.5 - Math.log((1 + clampedSinY) / (1 - clampedSinY)) / (4 * Math.PI))
  return { x, y }
}

/**
 * Clusters an array of map projects into groups or single markers based on current zoom level.
 *
 * Behavior:
 * - At zoom < 16: groups markers within `radiusPixels` (default 55px) into clusters.
 * - At zoom >= 16: only clusters projects sharing nearly identical coordinates (< 15px) so coincident pins don't overlap blindly.
 * - Pure TypeScript algorithm executing in < 1ms for hundreds of points with 0 external dependencies.
 */
export function clusterProjects(
  projects: MapProjectItem[],
  zoom: number,
  radiusPixels = 55,
): ClusterOrMarker[] {
  if (!projects.length) return []

  // Dynamic cluster distance: tighter threshold at close zoom levels
  const effectiveRadius = zoom >= 16 ? 15 : radiusPixels
  const pixelPositions = projects.map((project) => ({
    project,
    pixel: projectToPixels(project.latitude, project.longitude, zoom),
  }))

  const clusters: Array<{
    projects: MapProjectItem[]
    pixelX: number
    pixelY: number
    minLat: number
    maxLat: number
    minLng: number
    maxLng: number
  }> = []

  for (const { project, pixel } of pixelPositions) {
    let matched = false

    for (const cluster of clusters) {
      const dx = cluster.pixelX - pixel.x
      const dy = cluster.pixelY - pixel.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= effectiveRadius) {
        cluster.projects.push(project)
        // Recompute center of mass
        const count = cluster.projects.length
        cluster.pixelX = (cluster.pixelX * (count - 1) + pixel.x) / count
        cluster.pixelY = (cluster.pixelY * (count - 1) + pixel.y) / count

        cluster.minLat = Math.min(cluster.minLat, project.latitude)
        cluster.maxLat = Math.max(cluster.maxLat, project.latitude)
        cluster.minLng = Math.min(cluster.minLng, project.longitude)
        cluster.maxLng = Math.max(cluster.maxLng, project.longitude)

        matched = true
        break
      }
    }

    if (!matched) {
      clusters.push({
        projects: [project],
        pixelX: pixel.x,
        pixelY: pixel.y,
        minLat: project.latitude,
        maxLat: project.latitude,
        minLng: project.longitude,
        maxLng: project.longitude,
      })
    }
  }

  // Convert clusters to output format
  return clusters.map((c, index): ClusterOrMarker => {
    if (c.projects.length === 1) {
      const single = c.projects[0]
      const marker: MapSingleMarker = {
        id: `single-${single.id}`,
        isCluster: false,
        project: single,
        latitude: single.latitude,
        longitude: single.longitude,
      }
      return marker
    }

    const avgLat = c.projects.reduce((sum, p) => sum + p.latitude, 0) / c.projects.length
    const avgLng = c.projects.reduce((sum, p) => sum + p.longitude, 0) / c.projects.length

    // Add small buffer to bounds if all points are at identical coordinates
    const latSpan = Math.max(c.maxLat - c.minLat, 0.002)
    const lngSpan = Math.max(c.maxLng - c.minLng, 0.002)

    const cluster: MapCluster = {
      id: `cluster-${zoom}-${index}-${c.projects.length}`,
      isCluster: true,
      latitude: avgLat,
      longitude: avgLng,
      count: c.projects.length,
      projects: c.projects,
      bounds: [
        [avgLat - latSpan / 2, avgLng - lngSpan / 2],
        [avgLat + latSpan / 2, avgLng + lngSpan / 2],
      ],
    }
    return cluster
  })
}
