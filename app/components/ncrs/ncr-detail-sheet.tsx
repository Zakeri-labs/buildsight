"use client"

import { MapPin, User, CalendarClock, ClipboardList, CheckCircle2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  DisciplineBadge,
  NcrSeverityBadge,
  NcrStatusBadge,
} from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import type { NcrRecord } from "@/lib/mock-data"

function MetaRow({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("ms-auto text-sm font-medium", danger && "text-destructive")}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <p className="text-sm leading-relaxed">{children}</p>
    </div>
  )
}

export function NcrDetailSheet({
  ncr,
  open,
  onOpenChange,
}: {
  ncr: NcrRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  if (!ncr) return null

  const editable = ncr.status !== "closed"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="gap-2 border-b border-border">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{ncr.id}</span>
            <DisciplineBadge discipline={ncr.discipline} />
            <NcrSeverityBadge severity={ncr.severity} />
            <NcrStatusBadge status={ncr.status} />
          </div>
          <SheetTitle>{ncr.title}</SheetTitle>
          <SheetDescription>{ncr.project}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 p-4">
          <MetaRow icon={<MapPin className="size-4" />} label={t.ncrs.location} value={ncr.location} />
          <MetaRow icon={<User className="size-4" />} label={t.ncrs.raisedBy} value={ncr.raisedBy} />
          <MetaRow icon={<CalendarClock className="size-4" />} label={t.ncrs.raisedOn} value={ncr.raisedOn} />
          <MetaRow icon={<User className="size-4" />} label={t.ncrs.assignedTo} value={ncr.assignedTo} />
          <MetaRow icon={<CalendarClock className="size-4" />} label={t.ncrs.dueDate} value={ncr.dueDate} danger={editable} />
          {ncr.linkedInspection && (
            <MetaRow
              icon={<ClipboardList className="size-4" />}
              label={t.ncrs.linkedInspection}
              value={ncr.linkedInspection}
            />
          )}
        </div>

        <Separator />

        <div className="flex flex-col gap-4 p-4">
          <Section title={t.ncrs.description}>{ncr.description}</Section>
          <Section title={t.ncrs.rootCause}>{ncr.rootCause}</Section>
          <Section title={t.ncrs.correctiveAction}>{ncr.correctiveAction}</Section>
        </div>

        <Separator />

        <div className="flex flex-col gap-3 p-4">
          <h4 className="text-sm font-semibold">{t.ncrs.timeline}</h4>
          <ol className="flex flex-col gap-0">
            {ncr.timeline.map((entry, i) => {
              const isLast = i === ncr.timeline.length - 1
              const isClosed = entry.label.toLowerCase().includes("closed")
              return (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 items-center justify-center rounded-full border-2",
                        isClosed ? "border-success bg-success text-white" : "border-primary bg-primary/10",
                      )}
                    >
                      {isClosed && <CheckCircle2 className="size-3" />}
                    </span>
                    {!isLast && <span className="my-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex flex-col gap-0.5 pb-4">
                    <span className="text-sm font-medium">{entry.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.date} · {entry.by}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        {editable && (
          <SheetFooter className="border-t border-border">
            <Button className="w-full">
              <CheckCircle2 data-icon="inline-start" />
              {t.inspections.approve}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
