"use client"

import { useMemo, useState } from "react"
import { Search, Plus, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PageHeader } from "@/components/dashboard/page-header"
import {
  DisciplineBadge,
  InspectionStatusBadge,
  PriorityBadge,
} from "@/components/status-badge"
import { InspectionDetailSheet } from "@/components/inspections/inspection-detail-sheet"
import { useI18n } from "@/lib/i18n"
import {
  inspections,
  type Discipline,
  type InspectionRecord,
  type InspectionStatus,
} from "@/lib/mock-data"

const disciplines: (Discipline | "all")[] = [
  "all",
  "Structural",
  "MEP",
  "Architectural",
  "Civil",
  "Electrical",
  "Mechanical",
]

const statusTabs: { key: InspectionStatus | "all"; labelKey: keyof ReturnType<typeof useI18n>["t"]["inspections"] }[] = [
  { key: "all", labelKey: "tabsAll" },
  { key: "pending", labelKey: "tabsPending" },
  { key: "in-progress", labelKey: "tabsInProgress" },
  { key: "approved", labelKey: "tabsApproved" },
  { key: "rejected", labelKey: "tabsRejected" },
]

export function InspectionsList() {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [discipline, setDiscipline] = useState<Discipline | "all">("all")
  const [statusTab, setStatusTab] = useState<InspectionStatus | "all">("all")
  const [selected, setSelected] = useState<InspectionRecord | null>(null)

  const filtered = useMemo(() => {
    return inspections.filter((ins) => {
      const matchesQuery =
        query === "" ||
        ins.title.toLowerCase().includes(query.toLowerCase()) ||
        ins.id.toLowerCase().includes(query.toLowerCase())
      const matchesDiscipline = discipline === "all" || ins.discipline === discipline
      const matchesStatus = statusTab === "all" || ins.status === statusTab
      return matchesQuery && matchesDiscipline && matchesStatus
    })
  }, [query, discipline, statusTab])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.inspections.title}
        subtitle={t.inspections.subtitle}
        action={
          <Button>
            <Plus data-icon="inline-start" />
            {t.inspections.newInspection}
          </Button>
        }
      />

      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as InspectionStatus | "all")}>
        <TabsList>
          {statusTabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {t.inspections[tab.labelKey]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-inline-start-3 start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.inspections.searchPlaceholder}
            className="ps-9"
          />
        </div>
        <Select value={discipline} onValueChange={(v) => setDiscipline(v as Discipline | "all")}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder={t.inspections.allDisciplines}>
              {(value) => (value === "all" ? t.inspections.allDisciplines : (value as string))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {disciplines.map((d) => (
              <SelectItem key={d} value={d}>
                {d === "all" ? t.inspections.allDisciplines : d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((ins) => (
          <Card
            key={ins.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelected(ins)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setSelected(ins)
              }
            }}
            className="cursor-pointer transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{ins.id}</span>
                  <DisciplineBadge discipline={ins.discipline} />
                </div>
                <h3 className="text-sm font-semibold">{ins.title}</h3>
                <p className="text-xs text-muted-foreground">{ins.location}</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden items-center gap-2 sm:flex">
                  <Avatar className="size-7">
                    <AvatarFallback className="text-xs">{ins.assignedInitials}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground">{ins.assignedTo}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className={ins.overdue ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
                    {ins.dueDate}
                  </span>
                </div>
                <PriorityBadge priority={ins.priority} />
                <InspectionStatusBadge status={ins.status} />
                <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <InspectionDetailSheet
        inspection={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  )
}
