import { describe, expect, test } from "vitest"
import { clusterProjects, projectToPixels } from "./clustering"
import type { MapProjectItem } from "./types"

const sampleProjects: MapProjectItem[] = [
  {
    id: "p1",
    name: "Muscat Villa A",
    code: "PRJ-001",
    latitude: 23.588,
    longitude: 58.382,
    status: "active",
    ownerClient: "Client A",
    address: "Al Khuwair",
    areaDistrict: "Muscat",
    supervisorName: "Eng. Ali",
    progress: 45,
    imageUrl: null,
  },
  {
    id: "p2",
    name: "Muscat Villa B",
    code: "PRJ-002",
    latitude: 23.589, // very close to p1 (~100m)
    longitude: 58.383,
    status: "active",
    ownerClient: "Client B",
    address: "Al Khuwair",
    areaDistrict: "Muscat",
    supervisorName: "Eng. Ahmed",
    progress: 75,
    imageUrl: null,
  },
  {
    id: "p3",
    name: "Sohar Commercial",
    code: "PRJ-003",
    latitude: 24.363, // far away in Sohar (~200km)
    longitude: 56.746,
    status: "completed",
    ownerClient: "Client C",
    address: "Sohar Port",
    areaDistrict: "Sohar",
    supervisorName: "Eng. Said",
    progress: 100,
    imageUrl: null,
  },
]

describe("projectToPixels", () => {
  test("projects coordinates deterministically", () => {
    const px1 = projectToPixels(23.588, 58.382, 10)
    const px2 = projectToPixels(23.588, 58.382, 10)
    expect(px1.x).toBe(px2.x)
    expect(px1.y).toBe(px2.y)
    expect(Number.isFinite(px1.x)).toBe(true)
    expect(Number.isFinite(px1.y)).toBe(true)
  })
})

describe("clusterProjects", () => {
  test("returns empty array when projects list is empty", () => {
    expect(clusterProjects([], 10)).toEqual([])
  })

  test("clusters nearby projects at low zoom levels", () => {
    // At zoom 10, Muscat Villa A and B are within pixels of each other
    const result = clusterProjects(sampleProjects, 10)
    expect(result.length).toBe(2)

    const cluster = result.find((item) => item.isCluster)
    const single = result.find((item) => !item.isCluster)

    expect(cluster).toBeDefined()
    expect(cluster?.isCluster).toBe(true)
    if (cluster?.isCluster) {
      expect(cluster.count).toBe(2)
      expect(cluster.projects.map((p) => p.id)).toEqual(["p1", "p2"])
    }

    expect(single).toBeDefined()
    expect(single?.isCluster).toBe(false)
    if (single && !single.isCluster) {
      expect(single.project.id).toBe("p3")
    }
  })

  test("unclusters projects at high zoom levels", () => {
    // At zoom 18, 100 meters is hundreds of pixels apart
    const result = clusterProjects(sampleProjects, 18)
    // All 3 should be individual markers
    expect(result.length).toBe(3)
    expect(result.every((item) => !item.isCluster)).toBe(true)
  })

  test("clusters identical coordinates even at high zoom level", () => {
    const duplicateCoords: MapProjectItem[] = [
      sampleProjects[0],
      { ...sampleProjects[1], latitude: sampleProjects[0].latitude, longitude: sampleProjects[0].longitude },
    ]
    const result = clusterProjects(duplicateCoords, 18)
    expect(result.length).toBe(1)
    expect(result[0].isCluster).toBe(true)
    if (result[0].isCluster) {
      expect(result[0].count).toBe(2)
    }
  })
})
