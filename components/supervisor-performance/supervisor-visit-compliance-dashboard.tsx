"use client"

import {
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  Clock,
  AlertCircle,
  HelpCircle,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { SupervisorVisitComplianceDashboardData } from "@/lib/supervisor-performance/types"
import { ComplianceMatrix } from "./compliance-matrix"

export type SupervisorVisitComplianceDashboardProps = {
  data: SupervisorVisitComplianceDashboardData
  className?: string
}

export function SupervisorVisitComplianceDashboard({
  data,
  className,
}: SupervisorVisitComplianceDashboardProps) {
  const { weeks, projects } = data

  return (
    <Card className={className}>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-semibold">
                Supervisor Visit Compliance Matrix
              </CardTitle>
            </div>
            <CardDescription className="mt-1 text-xs">
              Operational compliance tracking required vs. completed inspection visits across calendar weeks (Sunday → Saturday).
            </CardDescription>
          </div>

          {/* Compliance Status Legend */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-1.5 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-medium text-foreground">Completed</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-rose-500" />
              <span className="font-medium text-foreground">Missing</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-sky-500" />
              <span className="font-medium text-foreground">Upcoming</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-1">
              <span className="flex h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-medium text-foreground">Extra Visit</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <ComplianceMatrix weeks={weeks} projects={projects} />
      </CardContent>
    </Card>
  )
}
