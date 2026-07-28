"use client"

import Link from "next/link"
import { useState } from "react"
import {
  MapPin,
  ArrowLeft,
  Building2,
  CalendarDays,
  ClipboardList,
  AlertTriangle,
  Hash,
  Layers3,
  UserRound,
  BriefcaseBusiness,
  FileText,
} from "lucide-react"
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

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border bg-muted/10 px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-sm font-medium">{value}</span>
      </div>
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
  const [projectImage, setProjectImage] = useState<string | null>(projectImageDisplayUrl(project.image))
  const isArabic = locale === "ar"
  const labels = isArabic
    ? {
        details: "تفاصيل المشروع",
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
      }
    : {
        details: "Project Details",
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
      }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/projects" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t.projects.title}
      </Link>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b px-5 py-4 sm:px-6">
            <CardTitle className="text-base">{labels.details}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
              <ProjectImageDisplay
                src={projectImage}
                alt={project.name}
                className="aspect-[4/3] w-full rounded-xl border md:aspect-[5/4]"
              >
                {canManageImages ? (
                  <div className="absolute bottom-3 end-3">
                    <ProjectImageManagementDialog
                      projectId={project.id}
                      projectName={project.name}
                      currentImage={projectImage}
                      onSaved={setProjectImage}
                    />
                  </div>
                ) : null}
              </ProjectImageDisplay>

              <div className="min-w-0 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold tracking-tight">{project.name}</h1>
                    <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 size-4 shrink-0" />
                      <span>{project.location}</span>
                    </p>
                  </div>
                  <ProjectStatusBadge statusKey={project.statusKey} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <InfoRow icon={<Hash className="size-4" />} label={labels.code} value={project.code} />
                  <InfoRow icon={<UserRound className="size-4" />} label={labels.owner} value={project.client} />
                  <InfoRow icon={<BriefcaseBusiness className="size-4" />} label={labels.role} value={project.organizationRole} />
                  <InfoRow icon={<MapPin className="size-4" />} label={labels.location} value={project.location} />
                  <InfoRow icon={<Layers3 className="size-4" />} label={labels.type} value={project.projectType} />
                  <InfoRow icon={<Building2 className="size-4" />} label={labels.status} value={<ProjectStatusBadge statusKey={project.statusKey} />} />
                  <InfoRow icon={<CalendarDays className="size-4" />} label={labels.start} value={project.startDate} />
                  <InfoRow icon={<CalendarDays className="size-4" />} label={labels.completion} value={project.targetHandover} />
                  <InfoRow icon={<ClipboardList className="size-4" />} label={labels.progress} value={`${project.progress.actual}%`} />
                </div>

                <div className="rounded-xl border bg-muted/10 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <FileText className="size-4" />
                    {labels.description}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{project.description}</p>
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
