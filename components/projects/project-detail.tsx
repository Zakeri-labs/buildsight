"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, ArrowLeft, ChevronDown, ClipboardList, ExternalLink, FolderOpen, Images, Loader2, MapPin, Maximize2, Minimize2, Pencil } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useCurrentUser } from "@/components/current-user-provider"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/lib/i18n"
import type { ProjectRecord } from "@/lib/mock-data"
import { InitialDocumentsList } from "@/components/initial-documents/initial-documents-list"
import { AddProjectDocumentModal } from "@/components/initial-documents/add-project-document-modal"
import type { InitialDocumentListItem } from "@/lib/initial-documents/types"
import { ProjectParticipants, type ProjectParticipant } from "@/components/projects/project-participants"
import type { ProjectParticipantUserOption } from "@/lib/projects/project-participant-types"
import { ProjectDocuments, type ProjectDocument } from "@/components/projects/project-documents"
import { ProjectSiteVisitReports, type ProjectSiteVisitReport } from "@/components/projects/project-site-visit-reports"
import {
  ProjectEditDialog,
  type ProjectEditData,
} from "@/components/projects/project-edit-dialog"
import type { ProjectSupervisorCandidate } from "@/lib/projects/supervisor-candidates"
import {
  normalizeProjectStatus,
  PROJECT_STATUS_BADGE_CLASS,
  projectStatusLabel,
} from "@/lib/projects/project-status"
import { ProjectImageManagementDialog } from "@/components/projects/project-image-management-dialog"
import { ProjectImageDisplay } from "@/components/projects/project-image-display"
import { projectImageDisplayUrl } from "@/lib/projects/project-image"
import { projectPriorityLabel } from "@/lib/projects/project-options"
import { formatProjectAmountOmr } from "@/lib/projects/project-financial"
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from "@/lib/locations/config"
import type { MapPoint } from "@/components/projects/location-map-canvas"

const DynamicLocationMapCanvas = dynamic(
  () => import("@/components/projects/location-map-canvas").then((module) => module.LocationMapCanvas),
  { ssr: false, loading: () => null },
)

function normalizedProjectPoint(
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
): MapPoint | null {
  if (latitude == null || longitude == null) return null
  if (typeof latitude === "string" && !latitude.trim()) return null
  if (typeof longitude === "string" && !longitude.trim()) return null

  const normalizedLatitude = Number(latitude)
  const normalizedLongitude = Number(longitude)
  if (
    !Number.isFinite(normalizedLatitude) ||
    !Number.isFinite(normalizedLongitude) ||
    normalizedLatitude < -90 ||
    normalizedLatitude > 90 ||
    normalizedLongitude < -180 ||
    normalizedLongitude > 180
  ) {
    return null
  }

  return { latitude: normalizedLatitude, longitude: normalizedLongitude }
}

function projectDocuments(project: ProjectRecord): ProjectDocument[] {
  return [
    {
      id: `${project.id}-contract-agreement`,
      reference: "DOC-1001",
      title: "Contract Agreement",
      type: "other",
      uploadedBy: { name: "Arman H.", initials: "AH", avatar: "/avatars/arman.png" },
      lastUpdated: "May 18, 2025",
      status: "Approved",
    },
    {
      id: `${project.id}-structural-drawing`,
      reference: "DRW-0208",
      title: "Structural Slab Drawing Revision",
      type: "drawing",
      uploadedBy: { name: "Leena K.", initials: "LK" },
      lastUpdated: "May 17, 2025",
      status: "Current",
    },
    {
      id: `${project.id}-mep-submittal`,
      reference: "SUB-0771",
      title: "MEP Shop Drawing Package",
      type: "shop_drawing",
      uploadedBy: { name: "Mohammed S.", initials: "MS" },
      lastUpdated: "May 16, 2025",
      status: "Under Review",
    },
  ]
}

function DetailField({
  label,
  value,
  className,
  compactMobile = false,
  wrapValue = false,
}: {
  label: string
  value: React.ReactNode
  className?: string
  compactMobile?: boolean
  wrapValue?: boolean
}) {
  const isNotSet =
    value === "Not set" ||
    value === "غير محدد" ||
    value === "—" ||
    value == null ||
    value === "" ||
    (typeof value === "string" && !value.trim())

  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 border-b border-border/30 py-1.5 text-xs",
        compactMobile && "max-md:flex-col max-md:items-start max-md:gap-0.5 max-md:py-2",
        className,
      )}
    >
      <dt className="shrink-0 font-medium text-muted-foreground">{label}</dt>
      <dd className={cn(
        "min-w-0 text-end",
        wrapValue
          ? compactMobile
            ? "max-md:whitespace-normal max-md:break-words md:truncate"
            : "whitespace-normal break-words"
          : "truncate",
        compactMobile && "max-md:w-full max-md:text-start",
      )}>
        {isNotSet ? (
          <span className="font-normal text-muted-foreground/40">—</span>
        ) : typeof value === "string" || typeof value === "number" ? (
          <span className={cn("font-semibold text-foreground", wrapValue && compactMobile && "max-md:break-words")}>{value}</span>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function displayProjectDate(value: string | null | undefined, locale: string, notSet: string) {
  if (!value) return notSet
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function displayVisitCount(value: number | null | undefined, notSet: string) {
  return value == null ? notSet : String(value)
}

function ProjectStatusDisplay({ status, isArabic }: { status: string; isArabic: boolean }) {
  const normalizedStatus = normalizeProjectStatus(status)

  return (
    <Badge
      variant="outline"
      className={cn("h-6 rounded-md px-2 text-[11px] font-medium shadow-none", PROJECT_STATUS_BADGE_CLASS[normalizedStatus])}
    >
      {projectStatusLabel(normalizedStatus, isArabic)}
    </Badge>
  )
}

export function ProjectDetail({
  project,
  editProject,
  letters,
  initialDocuments,
  initialDocumentsError,
  siteVisitReports = [],
  participants,
  participantUsers = [],
  supervisorOptions = [],
  canManageImages = false,
  canEditProject = false,
}: {
  project: ProjectRecord
  editProject: ProjectEditData
  letters?: ProjectDocument[]
  initialDocuments: InitialDocumentListItem[]
  initialDocumentsError?: string | null
  siteVisitReports?: ProjectSiteVisitReport[]
  participants: ProjectParticipant[]
  participantUsers?: ProjectParticipantUserOption[]
  supervisorOptions?: ProjectSupervisorCandidate[]
  canManageImages?: boolean
  canEditProject?: boolean
}) {
  const { t, locale } = useI18n()
  const currentUser = useCurrentUser()
  const router = useRouter()
  const isMember = currentUser.role === "org_member"
  const [currentProject, setCurrentProject] = useState(project)
  const [currentEditProject, setCurrentEditProject] = useState(editProject)
  const [editOpen, setEditOpen] = useState(false)
  const [financialOpen, setFinancialOpen] = useState(false)
  const [documentsOpen, setDocumentsOpen] = useState(false)
  const mapShellRef = useRef<HTMLDivElement | null>(null)
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading")
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false)
  const [resizeRequest, setResizeRequest] = useState(0)
  const [projectImage, setProjectImage] = useState<string | null>(projectImageDisplayUrl(project.image, project.id))

  useEffect(() => {
    setCurrentProject(project)
    setCurrentEditProject(editProject)
    setProjectImage(projectImageDisplayUrl(project.image, project.id))
  }, [editProject, project])

  const isArabic = locale === "ar"
  const labels = isArabic
    ? {
        details: "١. تفاصيل المشروع",
        name: "اسم المشروع",
        code: "رقم / رمز المشروع",
        owner: "المالك / العميل",
        role: "دور الجهة",
        location: "الموقع / العنوان",
        areaDistrict: "المنطقة / الحي",
        notSet: "—",
        type: "نوع المشروع",
        supervisionType: "نوع الإشراف",
        plotNo: "رقم قطعة الأرض",
        priority: "الأولوية",
        status: "الحالة",
        start: "تاريخ البدء",
        supervisionStart: "تاريخ بدء الإشراف",
        includedStructureVisits: "زيارات الهيكل الإنشائي المشمولة",
        includedFinishingVisits: "زيارات التشطيبات المشمولة",
        completion: "الإنجاز المتوقع",
        progress: "التقدم",
        description: "وصف المشروع",
        financialSummary: "الملخص المالي",
        structureFee: "رسوم الإشراف الإنشائي",
        finishingFee: "رسوم الإشراف على التشطيبات",
        receivedAmount: "المبلغ المستلم",
        outstandingAmount: "المبلغ المستحق",
        nextPaymentAmount: "مبلغ الدفعة التالية",
        nextPaymentDueDate: "تاريخ استحقاق الدفعة التالية",
        paymentNote: "مرجع الفاتورة / ملاحظة الدفع",
        initialRemarks: "ملاحظات أولية",
        viewGallery: "عرض معرض المشروع",
        editProject: "تعديل المشروع",
        projectDocuments: "٣. مستندات المشروع",
        viewAllDocuments: "عرض كل المستندات",
      }
    : {
        details: "1. Project Details",
        name: "Project Name",
        code: "Project Code / Number",
        owner: "Owner / Client",
        role: "Organization Role",
        location: "Location / Address",
        areaDistrict: "Area / District",
        notSet: "—",
        type: "Project Type",
        supervisionType: "Supervision Type",
        plotNo: "Plot No.",
        priority: "Priority",
        status: "Status",
        start: "Start Date",
        supervisionStart: "Supervision Start Date",
        includedStructureVisits: "Included Structure Visits",
        includedFinishingVisits: "Included Finishing Visits",
        completion: "Expected Completion",
        progress: "Progress",
        description: "Project Description",
        financialSummary: "Financial Summary",
        structureFee: "Structure Supervision Fee",
        finishingFee: "Finishing Supervision Fee",
        receivedAmount: "Received Amount",
        outstandingAmount: "Outstanding Amount",
        nextPaymentAmount: "Next Payment Amount",
        nextPaymentDueDate: "Next Payment Due Date",
        paymentNote: "Invoice Reference / Payment Note",
        initialRemarks: "Initial Remarks",
        viewGallery: "View Project Gallery",
        editProject: "Edit project",
        projectDocuments: "3. Project Documents",
        viewAllDocuments: "View All Documents",
      }

  const progress = Math.max(0, Math.min(100, currentProject.progress.actual))
  const projectPoint = useMemo(
    () => normalizedProjectPoint(currentEditProject.latitude, currentEditProject.longitude),
    [currentEditProject.latitude, currentEditProject.longitude],
  )
  const hasProjectCoordinates = projectPoint !== null
  const googleMapsUrl = projectPoint
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${projectPoint.latitude},${projectPoint.longitude}`)}`
    : null
  const handleMapReady = useCallback(() => setMapState("ready"), [])
  const handleTileError = useCallback(() => {
    // Keep the mounted map visible; Leaflet can continue rendering the marker, controls, and remaining tiles.
  }, [])
  const isFullscreen = nativeFullscreen || fallbackFullscreen
  const requestMapResize = useCallback(() => {
    setResizeRequest((request) => request + 1)
  }, [])

  useEffect(() => {
    setMapState(hasProjectCoordinates ? "loading" : "error")
  }, [hasProjectCoordinates, currentEditProject.latitude, currentEditProject.longitude])

  useEffect(() => {
    if (!hasProjectCoordinates || mapState !== "loading") return
    const timeout = window.setTimeout(() => {
      setMapState((current) => (current === "loading" ? "error" : current))
    }, 10_000)
    return () => window.clearTimeout(timeout)
  }, [hasProjectCoordinates, mapState])

  useEffect(() => {
    function handleFullscreenChange() {
      setNativeFullscreen(document.fullscreenElement === mapShellRef.current)
      window.requestAnimationFrame(requestMapResize)
      window.setTimeout(requestMapResize, 120)
      window.setTimeout(requestMapResize, 360)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [requestMapResize])

  useEffect(() => {
    if (!fallbackFullscreen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      setFallbackFullscreen(false)
      window.requestAnimationFrame(requestMapResize)
    }

    window.addEventListener("keydown", handleEscape, true)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleEscape, true)
    }
  }, [fallbackFullscreen, requestMapResize])

  useEffect(() => {
    if (!isFullscreen) return
    window.requestAnimationFrame(requestMapResize)
    const first = window.setTimeout(requestMapResize, 120)
    const second = window.setTimeout(requestMapResize, 360)
    return () => {
      window.clearTimeout(first)
      window.clearTimeout(second)
    }
  }, [isFullscreen, requestMapResize])

  async function toggleMapFullscreen() {
    if (!projectPoint) return

    if (nativeFullscreen && document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined)
      return
    }

    if (fallbackFullscreen) {
      setFallbackFullscreen(false)
      window.requestAnimationFrame(requestMapResize)
      return
    }

    const shell = mapShellRef.current
    if (shell?.requestFullscreen) {
      try {
        await shell.requestFullscreen()
        return
      } catch {
        // Fall through to the CSS fullscreen mode when the browser rejects the native API.
      }
    }

    setFallbackFullscreen(true)
    window.requestAnimationFrame(requestMapResize)
  }

  return (
    <div className={cn("flex flex-col", isMember ? "gap-3 md:gap-6" : "gap-6")}>
      <Link
        href="/projects"
        className={cn(
          "inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground",
          isMember && "max-md:text-xs",
        )}
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t.projects.title}
      </Link>

      {isMember ? (
        <section className="min-w-0 md:hidden" aria-label={isArabic ? "ملخص المشروع" : "Project summary"}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{currentProject.name}</h1>
              <p className="mt-0.5 whitespace-normal break-words text-xs font-medium text-muted-foreground">{currentProject.code}</p>
            </div>
            <ProjectStatusDisplay status={currentEditProject.status} isArabic={isArabic} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {[currentProject.projectType, currentEditProject.areaDistrict?.trim()].filter(Boolean).join(" • ") || labels.notSet}
          </p>
        </section>
      ) : null}

      <div className={cn("grid grid-cols-1 items-stretch lg:grid-cols-[minmax(0,1fr)_280px]", isMember ? "gap-3 md:gap-6" : "gap-6")}>
        <Card className="h-full gap-0 overflow-hidden py-0">
          <CardHeader className={cn("flex flex-row items-center justify-between gap-3 border-b px-5 py-3.5 sm:px-6", isMember && "max-md:px-3 max-md:py-2.5")}>
            <CardTitle className="min-w-0 text-base font-semibold tracking-tight">{labels.details}</CardTitle>
            {canEditProject ? (
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex shrink-0 rounded-lg" />}>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="Edit project"
                    className="size-8 rounded-lg bg-background text-muted-foreground shadow-xs hover:text-foreground"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{labels.editProject}</TooltipContent>
              </Tooltip>
            ) : null}
          </CardHeader>
          <CardContent className={cn("p-4 sm:p-5", isMember && "max-md:p-3")}>
            <div className={cn("grid gap-4 lg:grid-cols-[288px_minmax(0,1fr)]", isMember && "max-md:gap-3")}>
              <div className="min-w-0">
                <div className="relative">
                  <ProjectImageDisplay
                    src={projectImage}
                    projectId={currentProject.id}
                    alt={currentProject.name}
                    className={cn(
                      "h-[280px] w-full rounded-lg border bg-muted/40 shadow-sm sm:h-[310px] lg:h-[288px]",
                      isMember && "max-md:h-28",
                    )}
                    imageClassName="object-cover"
                    iconClassName={cn("size-10", isMember && "max-md:size-7")}
                  />
                  {canManageImages ? (
                    <div className="absolute end-3 top-3 z-10">
                      <ProjectImageManagementDialog
                        projectId={currentProject.id}
                        projectName={currentProject.name}
                        currentImage={projectImage}
                        triggerVariant="overlay"
                        onSaved={(imageUrl) => {
                          setProjectImage(imageUrl)
                          router.refresh()
                        }}
                      />
                    </div>
                  ) : null}
                </div>
                <Link
                  href={`/projects/${currentProject.id}/gallery`}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "mt-3 w-full justify-center",
                    isMember && "max-md:mt-2 max-md:h-8 max-md:text-xs",
                  )}
                >
                  <Images className="size-4" />
                  {labels.viewGallery}
                </Link>
              </div>

              <div className="min-w-0 py-0.5">
                <dl className={cn("grid min-w-0 gap-x-5 md:grid-cols-2", isMember && "max-md:grid-cols-2 max-md:gap-x-3")}>
                  <DetailField label={labels.name} value={currentProject.name} compactMobile={isMember} />
                  <DetailField label={labels.owner} value={currentProject.client} compactMobile={isMember} />
                  <DetailField
                    label={labels.code}
                    value={currentProject.code}
                    compactMobile={isMember}
                    wrapValue={isMember}
                    className={isMember ? "max-md:col-span-2" : undefined}
                  />
                  <DetailField label={labels.role} value={currentProject.organizationRole} compactMobile={isMember} />
                  <DetailField label={labels.type} value={currentProject.projectType} compactMobile={isMember} />
                  <DetailField label={labels.supervisionType} value={currentProject.supervisionType} compactMobile={isMember} />
                  <DetailField label={labels.plotNo} value={currentEditProject.plotNo?.trim() || labels.notSet} compactMobile={isMember} />
                  <DetailField label={labels.areaDistrict} value={currentEditProject.areaDistrict?.trim() || labels.notSet} compactMobile={isMember} />
                  <DetailField
                    label={labels.status}
                    value={<ProjectStatusDisplay status={currentEditProject.status} isArabic={isArabic} />}
                    compactMobile={isMember}
                  />
                  <DetailField label={labels.priority} value={projectPriorityLabel(currentEditProject.priority, isArabic)} compactMobile={isMember} />
                  <DetailField label={labels.start} value={currentProject.startDate} compactMobile={isMember} />
                  <DetailField
                    label={labels.supervisionStart}
                    value={displayProjectDate(currentEditProject.supervisionStartDate, locale, labels.notSet)}
                    compactMobile={isMember}
                  />
                  <DetailField
                    label={labels.location}
                    value={currentProject.location}
                    compactMobile={isMember}
                    wrapValue={isMember}
                    className={isMember ? "max-md:col-span-2" : undefined}
                  />
                  <DetailField label={labels.completion} value={currentProject.targetHandover} compactMobile={isMember} />
                </dl>

                <div className={cn("mt-3 rounded-lg border border-border/40 bg-muted/20 p-3", isMember && "max-md:mt-2 max-md:p-2.5")}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{labels.description}</p>
                  <p className="min-w-0 whitespace-pre-wrap break-words text-xs font-medium text-foreground/90">
                    {currentProject.description?.trim() || "—"}
                  </p>
                </div>

                <div className={cn("mt-3 rounded-lg border border-border/40 bg-muted/20 p-3", isMember && "max-md:mt-2 max-md:p-2.5")}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground">{labels.financialSummary}</p>
                    {isMember ? (
                      <button
                        type="button"
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted md:hidden"
                        aria-label={financialOpen ? "Collapse financial summary" : "Expand financial summary"}
                        aria-expanded={financialOpen}
                        onClick={() => setFinancialOpen((open) => !open)}
                      >
                        <ChevronDown className={cn("size-4 transition-transform", financialOpen && "rotate-180")} />
                      </button>
                    ) : null}
                  </div>
                  <dl className={cn(
                    "mt-1 grid min-w-0 gap-x-6 md:grid-cols-2",
                    isMember && "max-md:grid-cols-2 max-md:gap-x-3",
                    isMember && !financialOpen && "max-md:hidden",
                  )}>
                    <DetailField
                      label={labels.includedStructureVisits}
                      value={displayVisitCount(currentEditProject.includedStructureVisits, "—")}
                      compactMobile={isMember}
                    />
                    <DetailField
                      label={labels.includedFinishingVisits}
                      value={displayVisitCount(currentEditProject.includedFinishingVisits, "—")}
                      compactMobile={isMember}
                    />
                    <DetailField
                      label={labels.structureFee}
                      value={formatProjectAmountOmr(currentEditProject.structureSupervisionFee, "—")}
                      compactMobile={isMember}
                    />
                    <DetailField
                      label={labels.finishingFee}
                      value={formatProjectAmountOmr(currentEditProject.finishingSupervisionFee, "—")}
                      compactMobile={isMember}
                    />
                    <DetailField
                      label={labels.receivedAmount}
                      value={formatProjectAmountOmr(currentEditProject.receivedAmount, "—")}
                      compactMobile={isMember}
                    />
                    <DetailField
                      label={labels.outstandingAmount}
                      value={formatProjectAmountOmr(currentEditProject.outstandingAmount, "—")}
                      compactMobile={isMember}
                    />
                  </dl>
                </div>

                <div className={cn("mt-3 flex items-center gap-3", isMember && "max-md:mt-2 max-md:gap-2")} aria-label={`${labels.progress}: ${progress}%`}>
                  <div className={cn("h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted", isMember && "max-md:h-1.5")}>
                    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{progress}%</span>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>

        <Card className={cn("h-full w-full self-stretch gap-0 overflow-hidden py-0", isMember ? "min-h-0 md:min-h-[420px]" : "min-h-[420px]")}>
          <CardHeader className={cn("shrink-0 border-b px-5 py-3.5 sm:px-6", isMember && "max-md:px-3 max-md:py-2.5")}>
            <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <MapPin className="size-4 text-primary" aria-hidden="true" />
              {isArabic ? "موقع المشروع" : "Project Location"}
            </CardTitle>
          </CardHeader>
          <CardContent className={cn("flex flex-1 p-0 lg:min-h-0", isMember ? "min-h-[180px] md:min-h-[360px]" : "min-h-[360px]")}>
            <div
              ref={mapShellRef}
              role="region"
              aria-label={isArabic ? "خريطة موقع المشروع" : "Project location map"}
              className={cn(
                "relative isolate w-full flex-1 overflow-hidden bg-muted/40 lg:min-h-0",
                isMember ? "min-h-[180px] md:min-h-[360px]" : "min-h-[360px]",
                isFullscreen
                  ? "fixed inset-0 z-[1200] h-screen max-h-none max-w-none rounded-none border-0 bg-background"
                  : "h-full",
              )}
            >
              <div
                className={cn(
                  "absolute overflow-hidden",
                  isFullscreen ? "inset-3 rounded-xl border sm:inset-4" : "inset-0",
                )}
              >
                {projectPoint ? (
                  <DynamicLocationMapCanvas
                    key={`${currentProject.id}-${projectPoint.latitude}-${projectPoint.longitude}`}
                    initialCenter={projectPoint}
                    initialZoom={15}
                    marker={projectPoint}
                    centerRequest={null}
                    resizeRequest={resizeRequest}
                    tileUrl={MAP_TILE_URL}
                    tileAttribution={MAP_TILE_ATTRIBUTION}
                    markerTitle={currentProject.name}
                    onReady={handleMapReady}
                    onTileError={handleTileError}
                    readOnly
                  />
                ) : null}

                {mapState === "loading" ? (
                  <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-background/88 text-xs text-muted-foreground backdrop-blur-[1px]">
                    <Loader2 className="me-2 size-3.5 animate-spin" aria-hidden="true" />
                    {isArabic ? "جارٍ تحميل الخريطة..." : "Loading map..."}
                  </div>
                ) : null}

                {mapState === "error" ? (
                  <div className="absolute inset-0 z-[501] flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
                    <MapPin className="size-6" aria-hidden="true" />
                    <span>{isArabic ? "الموقع غير متاح." : "Location unavailable"}</span>
                  </div>
                ) : null}

                {projectPoint && mapState !== "error" ? (
                  <div
                    className="pointer-events-none absolute bottom-2 start-2 z-[700] rounded-md bg-background/92 px-2 py-1 font-mono text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm"
                    dir="ltr"
                  >
                    {projectPoint.latitude.toFixed(6)}, {projectPoint.longitude.toFixed(6)}
                  </div>
                ) : null}
              </div>

              <div className={cn("absolute end-2 top-2 z-[900] flex items-center gap-1.5", isFullscreen && "end-6 top-6")}>
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex rounded-md" />}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-sm"
                      className="size-8 bg-background/95 shadow-md backdrop-blur-sm hover:bg-background"
                      disabled={!projectPoint}
                      onClick={toggleMapFullscreen}
                      aria-label={
                        isFullscreen
                          ? isArabic
                            ? "الخروج من وضع ملء الشاشة"
                            : "Exit fullscreen"
                          : isArabic
                            ? "فتح الخريطة بملء الشاشة"
                            : "Open map fullscreen"
                      }
                    >
                      {isFullscreen ? (
                        <Minimize2 className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Maximize2 className="size-3.5" aria-hidden="true" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isFullscreen
                      ? isArabic
                        ? "الخروج من وضع ملء الشاشة"
                        : "Exit fullscreen"
                      : isArabic
                        ? "فتح الخريطة بملء الشاشة"
                        : "Open map fullscreen"}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex rounded-md" />}>
                    {googleMapsUrl ? (
                      <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          buttonVariants({ variant: "secondary", size: "icon-sm" }),
                          "size-8 bg-background/95 shadow-md backdrop-blur-sm hover:bg-background",
                        )}
                        aria-label={isArabic ? "فتح في خرائط Google" : "Open in Google Maps"}
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        className="size-8 bg-background/95 shadow-md backdrop-blur-sm"
                        disabled
                        aria-label={isArabic ? "فتح في خرائط Google" : "Open in Google Maps"}
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>{isArabic ? "فتح في خرائط Google" : "Open in Google Maps"}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={cn("grid gap-6 sm:grid-cols-2", isMember && "max-md:grid-cols-2 max-md:gap-3")}>
        <Card className={cn(isMember && "max-md:rounded-xl")}>
          <CardContent className={cn("flex items-center gap-4 p-5", isMember && "max-md:gap-2.5 max-md:p-3")}>
            <span className={cn("flex size-12 items-center justify-center rounded-xl bg-info/12 text-info", isMember && "max-md:size-9 max-md:rounded-lg")}><ClipboardList className={cn("size-6", isMember && "max-md:size-4")} /></span>
            <div className="flex min-w-0 flex-col"><span className={cn("text-2xl font-semibold tabular-nums", isMember && "max-md:text-lg")}>{currentProject.openInspections}</span><span className={cn("text-sm text-muted-foreground", isMember && "max-md:text-[11px] max-md:leading-tight")}>{isArabic ? t.projects.openInspections : "Total Inspections"}</span></div>
          </CardContent>
        </Card>
        <Card className={cn(isMember && "max-md:rounded-xl")}>
          <CardContent className={cn("flex items-center gap-4 p-5", isMember && "max-md:gap-2.5 max-md:p-3")}>
            <span className={cn("flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive", isMember && "max-md:size-9 max-md:rounded-lg")}><AlertTriangle className={cn("size-6", isMember && "max-md:size-4")} /></span>
            <div className="flex min-w-0 flex-col"><span className={cn("text-2xl font-semibold tabular-nums", isMember && "max-md:text-lg")}>{currentProject.openNcrs}</span><span className={cn("text-sm text-muted-foreground", isMember && "max-md:text-[11px] max-md:leading-tight")}>{t.projects.openNcrs}</span></div>
          </CardContent>
        </Card>
      </div>

      <ProjectParticipants
        projectId={currentProject.id}
        participants={participants}
        participantUsers={participantUsers}
        canManageParticipants={canManageImages}
        canManageAvatars={canManageImages}
        memberMobile={isMember}
      />
      <Card className="gap-0 py-0">
        <CardHeader className={cn("flex flex-row items-center justify-between gap-3 border-b px-5 py-4 sm:px-6", isMember && "max-md:px-3 max-md:py-2.5")}>
          {isMember ? (
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-start md:hidden"
              aria-expanded={documentsOpen}
              onClick={() => setDocumentsOpen((open) => !open)}
            >
              <FolderOpen className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-sm font-semibold">
                {isArabic ? `مستندات المشروع (${initialDocuments.length})` : `Project Documents (${initialDocuments.length})`}
              </span>
              <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", documentsOpen && "rotate-180")} />
            </button>
          ) : null}
          <CardTitle className={cn("flex min-w-0 items-center gap-2 text-base font-semibold sm:text-lg", isMember && "max-md:hidden")}>
            <FolderOpen className="size-5 shrink-0 text-primary" />
            {labels.projectDocuments}
          </CardTitle>
          <div className="flex items-center gap-2">
            {canEditProject || canManageImages ? (
              <AddProjectDocumentModal
                projectId={currentProject.id}
                buttonVariant="default"
                buttonSize="default"
                buttonClassName="h-9 shrink-0"
              />
            ) : null}
            <Link
              href={`/initial-documents?project=${encodeURIComponent(currentProject.id)}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-9 shrink-0",
                isMember && "max-md:size-8 max-md:p-0",
              )}
              aria-label={labels.viewAllDocuments}
              title={labels.viewAllDocuments}
            >
              <FolderOpen className="size-4" />
              <span className="hidden sm:inline">{labels.viewAllDocuments}</span>
            </Link>
          </div>
        </CardHeader>
        <CardContent className={cn("p-0", isMember && !documentsOpen && "max-md:hidden")}>
          <InitialDocumentsList
            embedded
            documents={initialDocuments}
            selectedProjectId={currentProject.id}
            selectedProjectName={currentProject.name}
            errorMessage={initialDocumentsError}
            compactMobile={isMember}
          />
        </CardContent>
      </Card>
      <ProjectSiteVisitReports projectId={currentProject.id} reports={siteVisitReports} memberMobile={isMember} />
      <ProjectDocuments projectId={currentProject.id} documents={letters ?? projectDocuments(currentProject)} memberMobile={isMember} />

      {editOpen ? (
        <ProjectEditDialog
          key={currentEditProject.id}
          project={currentEditProject}
          locale={locale}
          supervisorOptions={supervisorOptions}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setCurrentEditProject(updated)
            setCurrentProject((current) => ({
              ...current,
              name: updated.name,
              code: updated.code === "—" ? "Not set" : updated.code,
              location: updated.address === "—" ? "Location not set" : updated.address,
              projectType: updated.projectTypeLabel,
              supervisionType: updated.supervisionTypeLabel,
              plotNo: updated.plotNo?.trim() || "Not set",
              supervisionStartDate: displayProjectDate(updated.supervisionStartDate, "en", "Not set"),
              priority: projectPriorityLabel(updated.priority),
              includedStructureVisits: updated.includedStructureVisits == null ? "Not set" : String(updated.includedStructureVisits),
              includedFinishingVisits: updated.includedFinishingVisits == null ? "Not set" : String(updated.includedFinishingVisits),
              description: updated.description?.trim() || "No project description has been added.",
            }))
            setEditOpen(false)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
