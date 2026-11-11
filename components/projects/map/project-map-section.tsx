"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Circle as CircleIcon,
  LocateFixed,
  Map,
  Pentagon,
  Plus,
  SlidersHorizontal,
  Loader2,
} from "lucide-react"
import {
  createProjectZoneAction,
  deleteProjectZoneAction,
  getOrganizationZonesAction,
  updateProjectZoneAction,
} from "@/lib/actions/zones"
import { useCurrentUser } from "@/components/current-user-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type {
  CreateZoneInput,
  ProjectZone,
  ProjectZoneType,
  UpdateZoneInput,
  ZoneGeometry,
} from "@/lib/zones/types"
import type { DrawingMode, MapProjectItem } from "./types"
import type { ProjectRow } from "@/components/projects/projects-list"
import { ZoneDialog } from "./zone-dialog"
import { ZoneDeleteDialog } from "./zone-delete-dialog"

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

function hasValidCoordinates(
  project: ProjectRow,
): project is ProjectRow & { latitude: number; longitude: number } {
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

type DialogState = {
  open: boolean
  mode: "create" | "edit"
  zoneType: ProjectZoneType
  geometry: ZoneGeometry | null
  initialName: string
  initialColor: string
  currentZoneId?: string
}

export function ProjectMapSection({
  allProjects,
  filteredProjects,
  locale = "en",
  zones: externalZones,
  onZonesChange,
}: {
  allProjects: ProjectRow[]
  filteredProjects: ProjectRow[]
  locale?: string
  zones?: ProjectZone[]
  onZonesChange?: (zones: ProjectZone[]) => void
}) {
  const isArabic = locale === "ar"
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isInView, setIsInView] = useState(false)
  const [syncWithFilters, setSyncWithFilters] = useState(true)
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0)
  const [localZones, setLocalZones] = useState<ProjectZone[]>(externalZones ?? [])

  const zones = externalZones ?? localZones

  const updateZones = (updater: (prev: ProjectZone[]) => ProjectZone[]) => {
    const next = updater(zones)
    setLocalZones(next)
    onZonesChange?.(next)
  }

  // Authorization check
  let canManageZones = false
  let isArchitectAdmin = false
  try {
    const currentUser = useCurrentUser()
    canManageZones = currentUser.role === "org_admin" || currentUser.role === "org_manager"
    isArchitectAdmin = currentUser.role === "architect_administrator"
  } catch {
    // Current user context not available (e.g. tests)
  }

  // Zone management interaction state machine
  const [drawingMode, setDrawingMode] = useState<DrawingMode>("idle")
  const [activeEditingZone, setActiveEditingZone] = useState<ProjectZone | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [dialogState, setDialogState] = useState<DialogState>({
    open: false,
    mode: "create",
    zoneType: "circle",
    geometry: null,
    initialName: "",
    initialColor: "#2563eb",
  })

  const [deleteZoneState, setDeleteZoneState] = useState<{
    open: boolean
    zone: ProjectZone | null
    isDeleting: boolean
  }>({
    open: false,
    zone: null,
    isDeleting: false,
  })

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

  // Sync external zones if provided
  useEffect(() => {
    if (externalZones) {
      setLocalZones(externalZones)
    }
  }, [externalZones])

  // Retrieve organization zones once when map is activated (if external zones not passed)
  useEffect(() => {
    if (!isInView || externalZones) return

    let cancelled = false
    void getOrganizationZonesAction().then((result) => {
      if (cancelled) return
      if (result.ok && result.data) {
        setLocalZones(result.data)
        onZonesChange?.(result.data)
      }
    })

    return () => {
      cancelled = true
    }
  }, [isInView, externalZones, onZonesChange])

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

  // Do not render Project Map or Zone Management for Architect Administrator
  if (isArchitectAdmin) {
    return null
  }

  // Handler: when user finishes drawing a new geometry on map
  const handleDrawingComplete = (geometry: ZoneGeometry) => {
    setDialogState({
      open: true,
      mode: "create",
      zoneType: geometry.type,
      geometry,
      initialName: "",
      initialColor: "#2563eb",
    })
  }

  // Handler: cancel current drawing/editing mode
  const handleDrawingCancel = () => {
    setDrawingMode("idle")
    setActiveEditingZone(null)
    setActionError(null)
  }

  // Handler: when user starts editing a zone from popup
  const handleStartEditZone = (zone: ProjectZone) => {
    setActiveEditingZone(zone)
    if (zone.type === "circle") {
      setDrawingMode("editing_circle")
    } else {
      setDrawingMode("editing_polygon")
    }
  }

  // Handler: when user updates zone geometry via handles and clicks Save Shape
  const handleSaveEditedGeometry = async (geometry: ZoneGeometry) => {
    if (!activeEditingZone) return
    setIsSubmitting(true)
    setActionError(null)

    try {
      let input: UpdateZoneInput
      if (geometry.type === "circle") {
        input = {
          id: activeEditingZone.id,
          type: "circle",
          geometry: {
            center: geometry.center,
            radiusMeters: geometry.radiusMeters,
          },
        }
      } else {
        input = {
          id: activeEditingZone.id,
          type: "polygon",
          geometry: {
            coordinates: geometry.coordinates,
          },
        }
      }

      const res = await updateProjectZoneAction(input)
      if (!res.ok) {
        setActionError(res.error)
        return
      }
      updateZones((prev) => prev.map((z) => (z.id === res.data.id ? res.data : z)))
      setDrawingMode("idle")
      setActiveEditingZone(null)
    } catch {
      setActionError("An unexpected error occurred while saving zone shape.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handler: when user clicks "Edit Details" (Name & Color)
  const handleRequestEditDetails = (zone: ProjectZone) => {
    setDialogState({
      open: true,
      mode: "edit",
      zoneType: zone.type,
      geometry: zone.geometry,
      initialName: zone.name,
      initialColor: zone.color,
      currentZoneId: zone.id,
    })
  }

  // Handler: when user clicks "Delete Zone"
  const handleRequestDeleteZone = (zone: ProjectZone) => {
    setDeleteZoneState({
      open: true,
      zone,
      isDeleting: false,
    })
  }

  // Handler: submit ZoneDialog (Create or Update Name/Color)
  const handleDialogSave = async (name: string, color: string) => {
    setIsSubmitting(true)
    setActionError(null)

    try {
      if (dialogState.mode === "create") {
        if (!dialogState.geometry) return

        let input: CreateZoneInput
        if (dialogState.geometry.type === "circle") {
          input = {
            name,
            color,
            type: "circle",
            geometry: {
              center: dialogState.geometry.center,
              radiusMeters: dialogState.geometry.radiusMeters,
            },
          }
        } else {
          input = {
            name,
            color,
            type: "polygon",
            geometry: {
              coordinates: dialogState.geometry.coordinates,
            },
          }
        }

        const res = await createProjectZoneAction(input)
        if (!res.ok) {
          alert(res.error)
          return
        }
        updateZones((prev) => [res.data, ...prev])
        setDialogState((prev) => ({ ...prev, open: false }))
        setDrawingMode("idle")
        setActiveEditingZone(null)
      } else if (dialogState.mode === "edit" && dialogState.currentZoneId) {
        const input: UpdateZoneInput = {
          id: dialogState.currentZoneId,
          name,
          color,
          type: dialogState.zoneType,
        }

        const res = await updateProjectZoneAction(input)
        if (!res.ok) {
          alert(res.error)
          return
        }
        updateZones((prev) => prev.map((z) => (z.id === res.data.id ? res.data : z)))
        setDialogState((prev) => ({ ...prev, open: false }))
        setDrawingMode("idle")
        setActiveEditingZone(null)
      }
    } catch {
      alert("An unexpected error occurred while saving zone.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handler: confirm Delete action
  const handleDeleteConfirm = async () => {
    if (!deleteZoneState.zone) return
    setDeleteZoneState((prev) => ({ ...prev, isDeleting: true }))

    try {
      const res = await deleteProjectZoneAction(deleteZoneState.zone.id)
      if (!res.ok) {
        alert(res.error)
        setDeleteZoneState((prev) => ({ ...prev, isDeleting: false }))
        return
      }
      updateZones((prev) => prev.filter((z) => z.id !== deleteZoneState.zone?.id))
      setDeleteZoneState({ open: false, zone: null, isDeleting: false })
      if (activeEditingZone?.id === deleteZoneState.zone.id) {
        setDrawingMode("idle")
        setActiveEditingZone(null)
      }
    } catch {
      alert("An unexpected error occurred while deleting zone.")
      setDeleteZoneState((prev) => ({ ...prev, isDeleting: false }))
    }
  }

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

          {/* Authorized + Create Zone Workflow */}
          {canManageZones ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 focus:outline-hidden disabled:opacity-50"
                disabled={drawingMode !== "idle"}
              >
                <Plus className="size-3.5" />
                <span>{isArabic ? "إنشاء منطقة" : "Create Zone"}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 text-xs font-medium">
                <DropdownMenuItem
                  onClick={() => setDrawingMode("drawing_circle")}
                  className="gap-2 cursor-pointer"
                >
                  <CircleIcon className="size-3.5 text-blue-600" />
                  <span>{isArabic ? "منطقة دائرية" : "Circle Zone"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDrawingMode("drawing_polygon")}
                  className="gap-2 cursor-pointer"
                >
                  <Pentagon className="size-3.5 text-emerald-600" />
                  <span>{isArabic ? "منطقة مضلعة" : "Polygon Zone"}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {/* Map Canvas Container */}
      <div className="relative z-0 isolate h-[420px] w-full overflow-hidden md:h-[560px]">
        {isInView ? (
          <DynamicProjectMapCanvas
            projects={mappedProjects}
            zones={zones}
            fitBoundsTrigger={fitBoundsTrigger}
            locale={locale}
            canManageZones={canManageZones}
            drawingMode={drawingMode}
            isDialogOpen={dialogState.open || deleteZoneState.open}
            activeEditingZone={activeEditingZone}
            onDrawingComplete={handleDrawingComplete}
            onDrawingCancel={handleDrawingCancel}
            onStartEditZone={handleStartEditZone}
            onSaveEditedGeometry={handleSaveEditedGeometry}
            onRequestEditDetails={handleRequestEditDetails}
            onRequestDeleteZone={handleRequestDeleteZone}
          />
        ) : (
          <MapLoadingSkeleton />
        )}
      </div>

      {/* Zone Details Modal (Creation & Editing) */}
      <ZoneDialog
        open={dialogState.open}
        mode={dialogState.mode}
        zoneType={dialogState.zoneType}
        geometry={dialogState.geometry}
        initialName={dialogState.initialName}
        initialColor={dialogState.initialColor}
        existingZones={zones}
        currentZoneId={dialogState.currentZoneId}
        locale={locale}
        isSubmitting={isSubmitting}
        onSave={handleDialogSave}
        onCancel={() => {
          setDialogState((prev) => ({ ...prev, open: false }))
          if (dialogState.mode === "create") {
            setDrawingMode("idle")
            setActiveEditingZone(null)
          }
        }}
      />

      {/* Zone Delete Confirmation Modal */}
      <ZoneDeleteDialog
        open={deleteZoneState.open}
        zone={deleteZoneState.zone}
        locale={locale}
        isDeleting={deleteZoneState.isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteZoneState({ open: false, zone: null, isDeleting: false })}
      />
    </section>
  )
}
