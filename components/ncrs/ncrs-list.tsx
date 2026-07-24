"use client"

import { useMemo, useState } from "react"
import { Search, Plus, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PageHeader } from "@/components/dashboard/page-header"
import { DonutChart } from "@/components/dashboard/donut-chart"
import {
  DisciplineBadge,
  NcrSeverityBadge,
  NcrStatusBadge,
} from "@/components/status-badge"
import { NcrDetailSheet } from "@/components/ncrs/ncr-detail-sheet"
import { useI18n } from "@/lib/i18n"
import { ncrs, ncrSummary, type NcrRecord, type NcrStatus } from "@/lib/mock-data"

const statusTabs: { key: NcrStatus | "all"; labelKey: "tabsAll" | "tabsOpen" | "tabsInReview" | "tabsClosed" }[] = [
  { key: "all", labelKey: "tabsAll" },
  { key: "open", labelKey: "tabsOpen" },
  { key: "in-review", labelKey: "tabsInReview" },
  { key: "closed", labelKey: "tabsClosed" },
]

export function NcrsList() {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [statusTab, setStatusTab] = useState<NcrStatus | "all">("all")
  const [selected, setSelected] = useState<NcrRecord | null>(null)

  const filtered = useMemo(() => {
    return ncrs.filter((ncr) => {
      const matchesQuery =
        query === "" ||
        ncr.title.toLowerCase().includes(query.toLowerCase()) ||
        ncr.id.toLowerCase().includes(query.toLowerCase())
      const matchesStatus = statusTab === "all" || ncr.status === statusTab
      return matchesQuery && matchesStatus
    })
  }, [query, statusTab])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.ncrs.title}
        subtitle={t.ncrs.subtitle}
        action={
          <Button>
            <Plus data-icon="inline-start" />
            {t.ncrs.newNcr}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardContent className="flex items-center gap-4 p-5">
            <DonutChart
              size={96}
              strokeWidth={12}
              segments={[
                { value: ncrSummary.open, color: "var(--destructive)" },
                { value: ncrSummary.inReview, color: "var(--warning)" },
                { value: ncrSummary.closed, color: "var(--success)" },
              ]}
              centerTop={<span className="text-xl font-semibold tabular-nums">{ncrSummary.total}</span>}
              centerBottom={<span className="text-[10px] text-muted-foreground">{t.ncrs.total}</span>}
            />
            <div className="flex flex-col gap-1.5 text-sm">
              <SummaryRow color="bg-destructive" label={t.ncrs.statusOpen} value={ncrSummary.open} />
              <SummaryRow color="bg-warning" label={t.ncrs.statusInReview} value={ncrSummary.inReview} />
              <SummaryRow color="bg-success" label={t.ncrs.statusClosed} value={ncrSummary.closed} />
            </div>
          </CardContent>
        </Card>

        <StatCard label={t.ncrs.severityCritical} value={ncrs.filter((n) => n.severity === "critical").length} tone="text-destructive" />
        <StatCard label={t.ncrs.severityMajor} value={ncrs.filter((n) => n.severity === "major").length} tone="text-warning" />
        <StatCard label={t.ncrs.severityMinor} value={ncrs.filter((n) => n.severity === "minor").length} tone="text-muted-foreground" />
      </div>

      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as NcrStatus | "all")}>
        <TabsList>
          {statusTabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {t.ncrs[tab.labelKey]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="pointer-events-none absolute inset-inline-start-3 start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.ncrs.searchPlaceholder}
          className="ps-9"
        />
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((ncr) => (
          <Card
            key={ncr.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelected(ncr)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setSelected(ncr)
              }
            }}
            className="cursor-pointer transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{ncr.id}</span>
                  <DisciplineBadge discipline={ncr.discipline} />
                </div>
                <h3 className="text-sm font-semibold">{ncr.title}</h3>
                <p className="text-xs text-muted-foreground">{ncr.location}</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden items-center gap-2 sm:flex">
                  <Avatar className="size-7">
                    <AvatarFallback className="text-xs">{ncr.assignedInitials}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground">{ncr.dueDate}</span>
                </div>
                <NcrSeverityBadge severity={ncr.severity} />
                <NcrStatusBadge status={ncr.status} />
                <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <NcrDetailSheet ncr={selected} open={selected !== null} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  )
}

function SummaryRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`size-2.5 rounded-full ${color}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ms-auto font-semibold tabular-nums">{value}</span>
    </span>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-5">
        <span className={`text-3xl font-semibold tabular-nums ${tone}`}>{value}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  )
}
