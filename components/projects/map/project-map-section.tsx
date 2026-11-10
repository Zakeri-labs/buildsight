"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import { LocateFixed, Map, MapPin, SlidersHorizontal, Loader2 } from "lucide-react"
import { getOrganizationZonesAction } from "@/lib/actions/zones"
import type { ProjectZone } from "@/lib/zones/types"
import type { MapProjectItem } from "./types"
import type { ProjectRow } from "@/components/projects/projects-list"

// Dynamically import Leaflet canvas with SSR disabled
const DynamicProjectMapCanvas = dynamic(
  () => import("./project-map-canvas").then((mod) => mod.ProjectMapCanvas),
  {
    ssr: false,
    loading: () => <MapLoadingSkeleton />,
  },
)

function MapLoadingSkeleton() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950/40">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Loader2 className="size-5 animate-spin text-blue-600" />
        <span className="text-sm font-medium">Loading map...</span>
      </div>
    </div>
  )
}

function hasValidCoordinates(project: ProjectRow): project is ProjectRow & { latitude: number; longitude: number } {
  return (
    typeof project.latitude === "number" &&
    typeof project.longitude === "number" &&
    Number.isFinite(project.latitude) &&
    Number.isFinite(project.longitude) &&
    project.latitude >= -90 &&
    project.latitude <= 90 &&
    project.longitude >= -180 &&
    project.longitude <= 180
  )
}

function toMapItem(project: ProjectRow & { latitude: number; longitude: number }): MapProjectItem {
  return {
    id: project.id,
    name: project.name,
    code: project.code && project.code !== "—" ? project.code : null,
    latitude: project.latitude,
    longitude: project.longitude,
    status: project.status,
    ownerClient: project.ownerClient && project.ownerClient !== "—" ? project.ownerClient : null,
    address: project.address && project.address !== "—" ? project.address : null,
    areaDistrict: project.areaDistrict ?? null,
    supervisorName: project.supervisorName ?? null,
    progress: project.progress,
    imageUrl: project.imageUrl || null,
  }
}

export function ProjectMapSection({
  allProjects,
  filteredProjects,
  locale = "en",
}: {
  allProjects: ProjectRow[]
  filteredProjects: ProjectRow[]
  locale?: string
}) {
  const isArabic = locale === "ar"
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isInView, setIsInView] = useState(false)
  const [syncWithFilters, setSyncWithFilters] = useState(true)
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0)
  const [zones, setZones] = useState<ProjectZone[]>([])

  // IntersectionObserver to defer mounting until scrolled near map
  useEffect(() => {
    if (isInView || !containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: "300px" },
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [isInView])

  // Retrieve organization zones once when map is activated
  useEffect(() => {
    if (!isInView) return

    let cancelled = false
    void getOrganizationZonesAction().then((result) => {
      if (cancelled) return
      if (result.ok && result.data) {
        setZones(result.data)
      }
    })

    return () => {
      cancelled = true
    }
  }, [isInView])

  // Compute active dataset based on sync toggle
  const activeDataset = syncWithFilters ? filteredProjects : allProjects

  const { mappedProjects, unmappedCount, mappedCount } = useMemo(() => {
    const mapped: MapProjectItem[] = []
    let unmapped = 0

    for (const p of activeDataset) {
      if (hasValidCoordinates(p)) {
        mapped.push(toMapItem(p))
      } else {
        unmapped++
      }
    }

    return {
      mappedProjects: mapped,
      unmappedCount: unmapped,
      mappedCount: mapped.length,
    }
  }, [activeDataset])

  return (
    <section
      ref={containerRef}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900"
      aria-label="Project Map"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <Map className="size-4" />
          </div>

          <div>
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              {isArabic ? "خريطة المشاريع" : "Project Map"}
            </h2>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {mappedCount} {isArabic ? "محدد على الخريطة" : "Mapped"}
              </span>
              <span>·</span>
              <span className="text-slate-500">
                {unmappedCount} {isArabic ? "غير محدد" : "Unmapped"}
              </span>
              {zones.length > 0 ? (
                <>
                  <span>·</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {zones.length} {isArabic ? "مناطق" : "Zones"}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2.5 sm:self-auto">
          {/* Sync With Table Filters Toggle */}
          <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <input
              type="checkbox"
              checked={syncWithFilters}
              onChange={(e) => setSyncWithFilters(e.target.checked)}
              className="size-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
            />
            <span className="flex items-center gap-1">
              <SlidersHorizontal className="size-3 text-slate-400" />
              <span>{isArabic ? "مزامنة مع التصفية" : "Sync with table filters"}</span>
            </span>
          </label>

          {/* Fit All Projects Action */}
          <button
            type="button"
            onClick={() => setFitBoundsTrigger((count) => count + 1)}
            disabled={mappedCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            title={isArabic ? "احتواء جميع المشاريع" : "Fit all projects on map"}
          >
            <LocateFixed className="size-3.5 text-slate-500" />
            <span>{isArabic ? "احتواء الكل" : "Fit All Projects"}</span>
          </button>
        </div>
      </div>

      {/* Map Canvas Container */}
      <div className="relative h-[420px] w-full md:h-[560px]">
        {isInView ? (
          <DynamicProjectMapCanvas
            projects={mappedProjects}
            zones={zones}
            fitBoundsTrigger={fitBoundsTrigger}
            locale={locale}
          />
        ) : (
          <MapLoadingSkeleton />
        )}
      </div>
    </section>
  )
}
