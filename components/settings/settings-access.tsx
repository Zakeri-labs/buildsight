"use client"

import { useI18n } from "@/lib/i18n"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { rolePermissions, type PermissionLevel } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const levelTone: Record<PermissionLevel, string> = {
  manage: "bg-[var(--primary)]/12 text-[var(--primary)]",
  approve: "bg-[var(--success)]/15 text-[var(--success)]",
  edit: "bg-[var(--info)]/15 text-[var(--info)]",
  view: "bg-muted text-muted-foreground",
  none: "bg-transparent text-muted-foreground/40",
}

export function SettingsAccess() {
  const { t } = useI18n()

  const levelLabel: Record<PermissionLevel, string> = {
    view: t.settings.permView,
    edit: t.settings.permEdit,
    approve: t.settings.permApprove,
    manage: t.settings.permManage,
    none: "—",
  }

  const cell = (level: PermissionLevel) => (
    <span className={cn("inline-block rounded px-2 py-0.5 text-xs font-medium", levelTone[level])}>
      {levelLabel[level]}
    </span>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.accessTitle}</CardTitle>
        <CardDescription>{t.settings.accessDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.team.role}</TableHead>
                <TableHead>{t.inspections.title}</TableHead>
                <TableHead>{t.ncrs.title}</TableHead>
                <TableHead>{t.reports.title}</TableHead>
                <TableHead>{t.documents.title}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rolePermissions.map((row) => (
                <TableRow key={row.role}>
                  <TableCell className="font-medium text-foreground">{t.roles[row.role]}</TableCell>
                  <TableCell>{cell(row.inspections)}</TableCell>
                  <TableCell>{cell(row.ncrs)}</TableCell>
                  <TableCell>{cell(row.reports)}</TableCell>
                  <TableCell>{cell(row.documents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-[var(--primary)]/12 text-[var(--primary)]">
            {t.settings.permManage}
          </Badge>
          <Badge variant="secondary" className="bg-[var(--success)]/15 text-[var(--success)]">
            {t.settings.permApprove}
          </Badge>
          <Badge variant="secondary" className="bg-[var(--info)]/15 text-[var(--info)]">
            {t.settings.permEdit}
          </Badge>
          <Badge variant="secondary" className="bg-muted text-muted-foreground">
            {t.settings.permView}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
