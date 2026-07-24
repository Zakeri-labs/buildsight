"use client"

import { useMemo, useState } from "react"
import { Search, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/dashboard/page-header"
import { ProjectCard } from "@/components/projects/project-card"
import { useI18n } from "@/lib/i18n"
import { projects, type ProjectStatusKey } from "@/lib/mock-data"

const statusOptions: (ProjectStatusKey | "all")[] = [
  "all",
  "underConstruction",
  "planning",
  "onHold",
  "completed",
]

export function ProjectsList() {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<ProjectStatusKey | "all">("all")

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const matchesQuery =
        query === "" ||
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.location.toLowerCase().includes(query.toLowerCase())
      const matchesStatus = status === "all" || p.statusKey === status
      return matchesQuery && matchesStatus
    })
  }, [query, status])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.projects.title}
        subtitle={t.projects.subtitle}
        action={
          <Button>
            <Plus data-icon="inline-start" />
            {t.projects.newProject}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-inline-start-3 start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.projects.searchPlaceholder}
            className="ps-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatusKey | "all")}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder={t.projects.allStatuses}>
              {(value) =>
                value === "all" ? t.projects.allStatuses : t.projectStatus[value as ProjectStatusKey]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt === "all" ? t.projects.allStatuses : t.projectStatus[opt]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  )
}
