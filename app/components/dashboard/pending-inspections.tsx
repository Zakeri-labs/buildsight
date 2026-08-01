"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { pendingInspections } from "@/lib/mock-data"
import { DisciplineBadge, InspectionStatusBadge, PriorityBadge } from "@/components/status-badge"

export function PendingInspections() {
  const { t } = useI18n()

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t.dashboard.pendingInspections}</CardTitle>
        <Link href="/inspections" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {t.common.viewAll}
          <ChevronRight className="size-4 flip-rtl" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.id}</TableHead>
                <TableHead>{t.nav.inspections}</TableHead>
                <TableHead>{t.common.discipline}</TableHead>
                <TableHead>{t.common.dueDate}</TableHead>
                <TableHead>{t.common.priority}</TableHead>
                <TableHead>{t.common.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingInspections.map((insp) => (
                <TableRow key={insp.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{insp.id}</TableCell>
                  <TableCell className="font-medium">{insp.title}</TableCell>
                  <TableCell>
                    <DisciplineBadge discipline={insp.discipline} />
                  </TableCell>
                  <TableCell className={cn("tabular-nums", insp.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {insp.dueDate}
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={insp.priority} />
                  </TableCell>
                  <TableCell>
                    <InspectionStatusBadge status={insp.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
