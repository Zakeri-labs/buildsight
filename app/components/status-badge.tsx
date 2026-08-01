"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { getDocumentTypeDefinition, type DocumentTypeValue } from "@/lib/documents/document-types"
import type {
  Discipline,
  InspectionStatus,
  Priority,
  ProjectStatusKey,
  NcrSeverity,
  NcrStatus,
  DocumentStatus,
} from "@/lib/mock-data"

const toneClass: Record<string, string> = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning-foreground dark:text-warning",
  success: "bg-success/12 text-success dark:text-success",
  info: "bg-info/12 text-info dark:text-info",
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/12 text-accent",
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useI18n()
  const tone = priority === "high" ? "danger" : priority === "medium" ? "warning" : "neutral"
  return <Badge className={cn("border-transparent", toneClass[tone])}>{t.priority[priority]}</Badge>
}

export function InspectionStatusBadge({ status }: { status: InspectionStatus }) {
  const { t } = useI18n()
  const map: Record<InspectionStatus, { tone: string; label: string }> = {
    pending: { tone: "warning", label: t.statuses.pending },
    approved: { tone: "success", label: t.statuses.approved },
    rejected: { tone: "danger", label: t.statuses.rejected },
    "in-progress": { tone: "info", label: t.statuses.inProgress },
  }
  const { tone, label } = map[status]
  return <Badge className={cn("border-transparent", toneClass[tone])}>{label}</Badge>
}

const disciplineTone: Record<Discipline, string> = {
  Structural: "info",
  MEP: "success",
  Architectural: "accent",
  Civil: "primary",
  Electrical: "warning",
  Mechanical: "neutral",
}

export function DisciplineBadge({ discipline }: { discipline: Discipline }) {
  return (
    <Badge className={cn("border-transparent font-medium", toneClass[disciplineTone[discipline]])}>
      {discipline}
    </Badge>
  )
}

const projectStatusTone: Record<ProjectStatusKey, string> = {
  underConstruction: "info",
  planning: "neutral",
  onHold: "warning",
  completed: "success",
  handover: "primary",
}

export function ProjectStatusBadge({ statusKey }: { statusKey: ProjectStatusKey }) {
  const { t } = useI18n()
  return (
    <Badge className={cn("border-transparent font-medium", toneClass[projectStatusTone[statusKey]])}>
      {t.projectStatus[statusKey]}
    </Badge>
  )
}

const ncrSeverityTone: Record<NcrSeverity, string> = {
  critical: "danger",
  major: "warning",
  minor: "neutral",
}

export function NcrSeverityBadge({ severity }: { severity: NcrSeverity }) {
  const { t } = useI18n()
  const label =
    severity === "critical"
      ? t.ncrs.severityCritical
      : severity === "major"
        ? t.ncrs.severityMajor
        : t.ncrs.severityMinor
  return <Badge className={cn("border-transparent", toneClass[ncrSeverityTone[severity]])}>{label}</Badge>
}

const ncrStatusTone: Record<NcrStatus, string> = {
  open: "danger",
  "in-review": "warning",
  closed: "success",
}

export function NcrStatusBadge({ status }: { status: NcrStatus }) {
  const { t } = useI18n()
  const label =
    status === "open" ? t.ncrs.statusOpen : status === "in-review" ? t.ncrs.statusInReview : t.ncrs.statusClosed
  return <Badge className={cn("border-transparent", toneClass[ncrStatusTone[status]])}>{label}</Badge>
}

const docStatusTone: Record<DocumentStatus, string> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
  revise: "info",
}

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useI18n()
  const map: Record<DocumentStatus, string> = {
    approved: t.documents.statusApproved,
    pending: t.documents.statusPending,
    rejected: t.documents.statusRejected,
    revise: t.documents.statusRevise,
  }
  return <Badge className={cn("border-transparent", toneClass[docStatusTone[status]])}>{map[status]}</Badge>
}

export function DocumentTypeBadge({ type }: { type: DocumentTypeValue | string }) {
  const definition = getDocumentTypeDefinition(type)
  return (
    <Badge title={definition.label} className={cn("border-transparent font-medium", definition.badgeClassName)}>
      {definition.shortLabel}
    </Badge>
  )
}

export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: keyof typeof toneClass
  children: React.ReactNode
  className?: string
}) {
  return <Badge className={cn("border-transparent", toneClass[tone], className)}>{children}</Badge>
}
