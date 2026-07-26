"use client"

import Image from "next/image"
import Link from "next/link"
import {
  MapPin,
  ArrowLeft,
  HardHat,
  Building2,
  CalendarDays,
  Wallet,
  ClipboardList,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProjectStatusBadge } from "@/components/status-badge"
import { DonutChart } from "@/components/dashboard/donut-chart"
import { useI18n } from "@/lib/i18n"
import type { ProjectRecord } from "@/lib/mock-data"
import { ProjectParticipants, type ProjectParticipant } from "@/components/projects/project-participants"
import { ProjectDocuments, type ProjectDocument } from "@/components/projects/project-documents"


function projectParticipants(project: ProjectRecord): ProjectParticipant[] {
  return [
    {
      id: `${project.id}-consultant`,
      organization: project.consultant,
      organizationType: "Consultancy",
      projectRole: "Consultant",
      keyContact: { name: "Arman H.", initials: "AH", avatar: "/avatars/arman.png" },
      usersWithAccess: 5,
      status: "Active",
      logoTone: "blue",
    },
    {
      id: `${project.id}-client`,
      organization: project.client,
      organizationType: "Client",
      projectRole: "Client",
      keyContact: { name: "Leena K.", initials: "LK" },
      usersWithAccess: 2,
      status: "Active",
      logoTone: "violet",
    },
    {
      id: `${project.id}-contractor`,
      organization: project.contractor,
      organizationType: "Contractor",
      projectRole: "Contractor",
      keyContact: { name: "Mohammed S.", initials: "MS" },
      usersWithAccess: 8,
      status: "Active",
      logoTone: "amber",
    },
    {
      id: `${project.id}-third-party`,
      organization: "Prime Inspectors",
      organizationType: "Third Party",
      projectRole: "Third Party",
      keyContact: { name: "Nadine R.", initials: "NR" },
      usersWithAccess: 3,
      status: "Active",
      logoTone: "cyan",
    },
    {
      id: `${project.id}-government`,
      organization: "Municipal Authority",
      organizationType: "Government",
      projectRole: "Government",
      keyContact: { name: "Ibrahim M.", initials: "IM" },
      usersWithAccess: 1,
      status: "Limited Access",
      logoTone: "emerald",
    },
  ]
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
    {
      id: `${project.id}-progress-photos`,
      reference: "DOC-1104",
      title: "Site Progress Photos",
      type: "other",
      uploadedBy: { name: "Nadine R.", initials: "NR" },
      lastUpdated: "May 15, 2025",
      status: "Updated",
    },
    {
      id: `${project.id}-weekly-report`,
      reference: "REP-2005",
      title: "Weekly Progress Report – Week 20",
      type: "weekly_report",
      uploadedBy: { name: "Arman H.", initials: "AH", avatar: "/avatars/arman.png" },
      lastUpdated: "May 14, 2025",
      status: "Shared",
    },
  ]
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">{value}</span>
      </div>
    </div>
  )
}

export function ProjectDetail({ project }: { project: ProjectRecord }) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/projects"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t.projects.title}
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden py-0 gap-0">
          <div className="relative aspect-[21/9] w-full bg-muted">
            <Image
              src={project.image || "/placeholder.svg"}
              alt={project.name}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 66vw"
              priority
            />
          </div>
          <CardContent className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold">{project.name}</h1>
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="size-4" />
                  {project.location}
                </p>
              </div>
              <ProjectStatusBadge statusKey={project.statusKey} />
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
              <InfoRow icon={<HardHat className="size-4" />} label={t.dashboard.contractor} value={project.contractor} />
              <InfoRow icon={<Building2 className="size-4" />} label={t.dashboard.consultant} value={project.consultant} />
              <InfoRow icon={<Building2 className="size-4" />} label={t.projects.client} value={project.client} />
              <InfoRow icon={<CalendarDays className="size-4" />} label={t.projects.startDate} value={project.startDate} />
              <InfoRow icon={<CalendarDays className="size-4" />} label={t.dashboard.targetHandover} value={project.targetHandover} />
              <InfoRow icon={<Wallet className="size-4" />} label={t.projects.contractValue} value={project.contractValue} />
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
              centerTop={
                <span className="text-3xl font-semibold tabular-nums">{project.progress.actual}%</span>
              }
            />
            <div className="flex w-full flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-info" />
                  {t.dashboard.planned}
                </span>
                <span className="font-semibold tabular-nums">{project.progress.planned}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-success" />
                  {t.dashboard.actual}
                </span>
                <span className="font-semibold tabular-nums">{project.progress.actual}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-destructive" />
                  {t.dashboard.delay}
                </span>
                <span className="font-semibold tabular-nums">{project.progress.delay}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-info/12 text-info">
              <ClipboardList className="size-6" />
            </span>
            <div className="flex flex-col">
              <span className="text-2xl font-semibold tabular-nums">{project.openInspections}</span>
              <span className="text-sm text-muted-foreground">{t.projects.openInspections}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-6" />
            </span>
            <div className="flex flex-col">
              <span className="text-2xl font-semibold tabular-nums">{project.openNcrs}</span>
              <span className="text-sm text-muted-foreground">{t.projects.openNcrs}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <ProjectParticipants participants={projectParticipants(project)} />

      <ProjectDocuments projectId={project.id} documents={projectDocuments(project)} />
    </div>
  )
}
