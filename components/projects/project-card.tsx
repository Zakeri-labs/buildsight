"use client"

import Link from "next/link"
import { MapPin, ClipboardList, AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { ProjectStatusBadge } from "@/components/status-badge"
import { ProjectImageDisplay } from "@/components/projects/project-image-display"
import { useI18n } from "@/lib/i18n"
import type { ProjectRecord } from "@/lib/mock-data"

export function ProjectCard({ project }: { project: ProjectRecord }) {
  const { t } = useI18n()

  return (
    <Link href={`/projects/${project.id}`} className="group block focus:outline-none">
      <Card className="overflow-hidden py-0 gap-0 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
        <ProjectImageDisplay
          src={project.image}
          alt={project.name}
          className="aspect-[16/9]"
          imageClassName="transition-transform duration-300 group-hover:scale-105"
        >
          <div className="absolute top-3 inline-start-3 start-3">
            <ProjectStatusBadge statusKey={project.statusKey} />
          </div>
        </ProjectImageDisplay>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold leading-tight text-balance">{project.name}</h3>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              {project.location}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t.projects.progress}</span>
              <span className="font-medium tabular-nums">{project.progress.actual}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${project.progress.actual}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 border-t border-border pt-3 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ClipboardList className="size-4 text-info" />
              {project.openInspections} <span className="text-xs">{t.projects.openInspections}</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <AlertTriangle className="size-4 text-destructive" />
              {project.openNcrs} <span className="text-xs">{t.projects.openNcrs}</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
