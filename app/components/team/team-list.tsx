"use client"

import { useMemo, useState } from "react"
import { Search, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/dashboard/page-header"
import { useI18n } from "@/lib/i18n"
import { teamMembers, type RoleKey, type PresenceStatus } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const roleOptions: (RoleKey | "all")[] = [
  "all",
  "admin",
  "projectManager",
  "residentEngineer",
  "inspector",
  "documentController",
  "contractor",
  "owner",
]

const presenceDot: Record<PresenceStatus, string> = {
  online: "bg-success",
  away: "bg-warning",
  offline: "bg-muted-foreground/40",
}

export function TeamList() {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [role, setRole] = useState<RoleKey | "all">("all")

  const presenceLabel: Record<PresenceStatus, string> = {
    online: t.team.online,
    away: t.team.away,
    offline: t.team.offline,
  }

  const filtered = useMemo(() => {
    return teamMembers.filter((m) => {
      const matchesQuery =
        query === "" ||
        m.name.toLowerCase().includes(query.toLowerCase()) ||
        m.email.toLowerCase().includes(query.toLowerCase())
      const matchesRole = role === "all" || m.role === role
      return matchesQuery && matchesRole
    })
  }, [query, role])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.team.title}
        subtitle={t.team.subtitle}
        action={
          <Button>
            <UserPlus data-icon="inline-start" />
            {t.team.invite}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.team.searchPlaceholder}
            className="ps-9"
          />
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as RoleKey | "all")}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={t.team.allRoles}>
              {(value) => (value === "all" ? t.team.allRoles : t.roles[value as RoleKey])}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt === "all" ? t.team.allRoles : t.roles[opt]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.team.member}</TableHead>
              <TableHead className="hidden md:table-cell">{t.team.role}</TableHead>
              <TableHead className="hidden lg:table-cell">{t.team.company}</TableHead>
              <TableHead>{t.team.status}</TableHead>
              <TableHead className="hidden sm:table-cell">{t.team.lastActive}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                        {m.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{m.name}</span>
                      <span className="text-xs text-muted-foreground">{m.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="secondary" className="font-medium">
                    {t.roles[m.role]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                  {m.company}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2 text-sm">
                    <span className={cn("size-2 rounded-full", presenceDot[m.presence])} aria-hidden="true" />
                    {presenceLabel[m.presence]}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                  {m.lastActive}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
