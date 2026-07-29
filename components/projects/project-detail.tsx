"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AlertTriangle, ArrowLeft, ClipboardList, Images } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProjectStatusBadge } from "@/components/status-badge"
import { DonutChart } from "@/components/dashboard/donut-chart"
import { useI18n } from "@/lib/i18n"
import type { ProjectRecord } from "@/lib/mock-data"
import { ProjectParticipants, type ProjectParticipant } from "@/components/projects/project-participants"
import { ProjectDocuments, type ProjectDocument } from "@/components/projects/project-documents"
import { ProjectImageManagementDialog } from "@/components/projects/project-image-management-dialog"
import { ProjectImageDisplay } from "@/components/projects/project-image-display"
import { projectImageDisplayUrl } from "@/lib/projects/project-image"

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

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] items-start gap-3 py-1.5">
      <dt className="text-xs font-medium leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-semibold leading-5 text-foreground">{value}</dd>
    </div>
  )
}

export function ProjectDetail({
  project,
  documents,
  participants,
  canManageImages = false,
}: {
  project: ProjectRecord
  documents?: ProjectDocument[]
  participants: ProjectParticipant[]
  canManageImages?: boolean
}) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [projectImage, setProjectImage] = useState<string | null>(projectImageDisplayUrl(project.image, project.id))

  useEffect(() => {
    setProjectImage(projectImageDisplayUrl(project.image, project.id))
  }, [project.id, project.image])

  const isArabic = locale === "ar"
  const labels = isArabic
    ? {
        details: "١. تفاصيل المشروع",
        name: "اسم المشروع",
        code: "رقم / رمز المشروع",
        owner: "المالك / العميل",
        role: "دور الجهة",
        location: "الموقع / العنوان",
        type: "نوع المشروع",
        status: "الحالة",
        start: "تاريخ البدء",
        completion: "الإنجاز المتوقع",
        progress: "التقدم",
        description: "وصف المشروع",
        viewGallery: "عرض معرض المشروع",
      }
    : {
        details: "1. Project Details",
        name: "Project Name",
        code: "Project Code / Number",
        owner: "Owner / Client",
        role: "Organization Role",
        location: "Location / Address",
        type: "Project Type",
        status: "Status",
        start: "Start Date",
        completion: "Expected Completion",
        progress: "Progress",
        description: "Project Description",
        viewGallery: "View Project Gallery",
      }

  const progress = Math.max(0, Math.min(100, project.progress.actual))

  return (
    <div className="flex flex-col gap-6">
      <Link href="/projects" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t.projects.title}
      </Link>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-5 py-3.5 sm:px-6">
            <CardTitle className="text-base font-semibold tracking-tight">{labels.details}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="relative">
                  <ProjectImageDisplay
                    src={projectImage}
                    projectId={project.id}
                    alt={project.name}
                    className="h-[260px] w-full rounded-lg border bg-muted/40 shadow-sm sm:h-[300px] lg:h-[260px]"
                    imageClassName="object-cover"
                    iconClassName="size-10"
                  />
                  {canManageImages ? (
                    <div className="absolute end-3 top-3 z-10">
                      <ProjectImageManagementDialog
                        projectId={project.id}
                        projectName={project.name}
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
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full justify-center"
                  render={<Link href={`/projects/${project.id}/gallery`} />}
                >
                  <Images className="size-4" />
                  {labels.viewGallery}
                </Button>
              </div>

              <div className="min-w-0 py-0.5">
                <dl className="grid min-w-0 gap-x-7 md:grid-cols-2">
                  <DetailField label={labels.name} value={project.name} />
                  <DetailField label={labels.type} value={project.projectType} />
                  <DetailField label={labels.code} value={project.code} />
                  <DetailField label={labels.status} value={<ProjectStatusBadge statusKey={project.statusKey} />} />
                  <DetailField label={labels.owner} value={project.client} />
                  <DetailField label={labels.start} value={project.startDate} />
                  <DetailField label={labels.role} value={project.organizationRole} />
                  <DetailField label={labels.completion} value={project.targetHandover} />
                  <DetailField label={labels.location} value={project.location} />
                  <DetailField label={labels.progress} value={`${progress}%`} />
                </dl>

                <div className="mt-3 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">{labels.description}</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{project.description}</p>
                </div>

                <div className="mt-4 flex items-center gap-3" aria-label={`${labels.progress}: ${progress}%`}>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{progress}%</span>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.dashboard.overallProgress}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <DonutChart
              segments={[
                { value: project.progress.actual, color: "var(--success)" },
                { value: Math.max(0, 100 - project.progress.actual), color: "var(--muted)" },
              ]}
              total={100}
              centerTop={<span className="text-3xl font-semibold tabular-nums">{project.progress.actual}%</span>}
            />
            <div className="flex w-full flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-info" />{t.dashboard.planned}</span>
                <span className="font-semibold tabular-nums">{project.progress.planned}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-success" />{t.dashboard.actual}</span>
                <span className="font-semibold tabular-nums">{project.progress.actual}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-destructive" />{t.dashboard.delay}</span>
                <span className="font-semibold tabular-nums">{project.progress.delay}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-info/12 text-info"><ClipboardList className="size-6" /></span>
            <div className="flex flex-col"><span className="text-2xl font-semibold tabular-nums">{project.openInspections}</span><span className="text-sm text-muted-foreground">{t.projects.openInspections}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="size-6" /></span>
            <div className="flex flex-col"><span className="text-2xl font-semibold tabular-nums">{project.openNcrs}</span><span className="text-sm text-muted-foreground">{t.projects.openNcrs}</span></div>
          </CardContent>
        </Card>
      </div>

      <ProjectParticipants projectId={project.id} participants={participants} canManageAvatars={canManageImages} />
      <ProjectDocuments projectId={project.id} documents={documents ?? projectDocuments(project)} />
    </div>
  )
}
