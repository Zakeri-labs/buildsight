"use client"

import { useEffect, useState } from "react"
import { Check, X, Minus, MapPin, User, CalendarClock, AlertTriangle } from "lucide-react"
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
  InspectionStatusBadge,
  PriorityBadge,
  ToneBadge,
} from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import type { ChecklistItem, InspectionRecord } from "@/lib/mock-data"

type Result = "pass" | "fail" | "na" | null

function MetaRow({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("ms-auto text-sm font-medium", danger && "text-destructive")}>{value}</span>
    </div>
  )
}

export function InspectionDetailSheet({
  inspection,
  open,
  onOpenChange,
}: {
  inspection: InspectionRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const [results, setResults] = useState<Record<string, Result>>({})

  useEffect(() => {
    if (inspection) {
      setResults(
        inspection.checklist.reduce<Record<string, Result>>((acc, item) => {
          acc[item.id] = item.result
          return acc
        }, {}),
      )
    }
  }, [inspection])

  if (!inspection) return null

  const setResult = (id: string, value: Result) =>
    setResults((prev) => ({ ...prev, [id]: prev[id] === value ? null : value }))

  const editable = inspection.status === "pending" || inspection.status === "in-progress"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="gap-2 border-b border-border">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{inspection.id}</span>
            <DisciplineBadge discipline={inspection.discipline} />
            <InspectionStatusBadge status={inspection.status} />
          </div>
          <SheetTitle>{inspection.title}</SheetTitle>
          <SheetDescription>{inspection.project}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 p-4">
          <MetaRow icon={<MapPin className="size-4" />} label={t.inspections.location} value={inspection.location} />
          <MetaRow icon={<User className="size-4" />} label={t.inspections.requestedBy} value={inspection.requestedBy} />
          <MetaRow icon={<User className="size-4" />} label={t.inspections.assignedTo} value={inspection.assignedTo} />
          <MetaRow
            icon={<CalendarClock className="size-4" />}
            label={t.inspections.scheduled}
            value={inspection.scheduled}
            danger={inspection.overdue}
          />
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{t.common.priority}</span>
            <span className="ms-auto">
              <PriorityBadge priority={inspection.priority} />
            </span>
          </div>

          {inspection.linkedNcr && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/8 p-3">
              <AlertTriangle className="size-4 text-destructive" />
              <span className="text-xs text-muted-foreground">{t.inspections.linkedNcr}</span>
              <span className="ms-auto font-mono text-sm font-medium text-destructive">{inspection.linkedNcr}</span>
            </div>
          )}
        </div>

        <Separator />

        <div className="flex flex-col gap-3 p-4">
          <h4 className="text-sm font-semibold">{t.inspections.checklistItems}</h4>
          <div className="flex flex-col gap-2">
            {inspection.checklist.map((item: ChecklistItem) => {
              const current = results[item.id] ?? null
              return (
                <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <span className="flex-1 text-sm">{item.label}</span>
                  {editable ? (
                    <div className="flex items-center gap-1">
                      <ResultButton active={current === "pass"} tone="pass" onClick={() => setResult(item.id, "pass")}>
                        <Check className="size-4" />
                      </ResultButton>
                      <ResultButton active={current === "fail"} tone="fail" onClick={() => setResult(item.id, "fail")}>
                        <X className="size-4" />
                      </ResultButton>
                      <ResultButton active={current === "na"} tone="na" onClick={() => setResult(item.id, "na")}>
                        <Minus className="size-4" />
                      </ResultButton>
                    </div>
                  ) : (
                    <ResultLabel result={current} t={t} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {editable && (
          <SheetFooter className="flex-row gap-2 border-t border-border">
            <Button variant="outline" className="flex-1 text-destructive hover:text-destructive">
              <X data-icon="inline-start" />
              {t.inspections.reject}
            </Button>
            <Button className="flex-1">
              <Check data-icon="inline-start" />
              {t.inspections.approve}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ResultButton({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean
  tone: "pass" | "fail" | "na"
  onClick: () => void
  children: React.ReactNode
}) {
  const activeClass =
    tone === "pass"
      ? "bg-success text-white border-success"
      : tone === "fail"
        ? "bg-destructive text-white border-destructive"
        : "bg-muted-foreground text-white border-muted-foreground"
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted",
        active && activeClass,
      )}
    >
      {children}
    </button>
  )
}

function ResultLabel({ result, t }: { result: Result; t: ReturnType<typeof useI18n>["t"] }) {
  if (result === "pass") return <ToneBadge tone="success">{t.inspections.pass}</ToneBadge>
  if (result === "fail") return <ToneBadge tone="danger">{t.inspections.fail}</ToneBadge>
  if (result === "na") return <ToneBadge tone="neutral">{t.inspections.na}</ToneBadge>
  return <span className="text-xs text-muted-foreground">—</span>
}
