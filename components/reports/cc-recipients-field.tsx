"use client"

import { useMemo, useState } from "react"
import { Building2, Check, ChevronDown, Mail, Plus, Search, UserCheck, UserPlus, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useI18n } from "@/lib/i18n"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"
import type {
  ExternalCcRecipientInput,
  ProjectCcCandidate,
  ReportCcSelection,
} from "@/lib/report-cc/types"
import { cn } from "@/lib/utils"

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"
}

export function CcRecipientsField({
  candidates,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  candidates: ProjectCcCandidate[]
  value: ReportCcSelection
  onChange: (value: ReportCcSelection) => void
  disabled?: boolean
  compact?: boolean
}) {
  const { locale } = useI18n()
  const isAr = locale === "ar"

  // We maintain target groups: "reportTo" and "ccTo"
  const [reportToUserIds, setReportToUserIds] = useState<string[]>(() => value.internalUserIds.slice(0, 1))
  const [ccToUserIds, setCcToUserIds] = useState<string[]>(() => value.internalUserIds.slice(1))
  const [externalMap, setExternalMap] = useState<Map<string, ExternalCcRecipientInput & { group: "reportTo" | "ccTo" }>>(() => {
    const map = new Map<string, ExternalCcRecipientInput & { group: "reportTo" | "ccTo" }>()
    value.externalRecipients.forEach((rec, idx) => {
      map.set(rec.clientId, { ...rec, group: idx === 0 ? "reportTo" : "ccTo" })
    })
    return map
  })

  // Search state per column
  const [reportSearch, setReportSearch] = useState("")
  const [ccSearch, setCcSearch] = useState("")

  // External Dialog State
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogGroup, setDialogGroup] = useState<"reportTo" | "ccTo">("reportTo")
  const [extName, setExtName] = useState("")
  const [extEmail, setExtEmail] = useState("")
  const [extCompany, setExtCompany] = useState("")
  const [extRole, setExtRole] = useState("")
  const [dialogError, setDialogError] = useState<string | null>(null)

  const candidateMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])

  // Helper to emit changes up
  function emitChanges(
    nextReportToIds: string[],
    nextCcToIds: string[],
    nextExtMap: Map<string, ExternalCcRecipientInput & { group: "reportTo" | "ccTo" }>
  ) {
    const allInternalIds = Array.from(new Set([...nextReportToIds, ...nextCcToIds]))
    const allExternals = Array.from(nextExtMap.values()).map(({ group, ...rest }) => rest)
    onChange({
      internalUserIds: allInternalIds,
      externalRecipients: allExternals,
    })
  }

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  // Toggle candidate selection
  function toggleCandidate(candidateId: string, group: "reportTo" | "ccTo") {
    if (disabled) return
    const candidate = candidateMap.get(candidateId)
    const isRealUser = UUID_PATTERN.test(candidateId)

    if (isRealUser || !candidate) {
      let nextReportTo = [...reportToUserIds]
      let nextCcTo = [...ccToUserIds]

      if (group === "reportTo") {
        if (nextReportTo.includes(candidateId)) {
          nextReportTo = nextReportTo.filter((id) => id !== candidateId)
        } else {
          nextReportTo.push(candidateId)
          nextCcTo = nextCcTo.filter((id) => id !== candidateId)
        }
      } else {
        if (nextCcTo.includes(candidateId)) {
          nextCcTo = nextCcTo.filter((id) => id !== candidateId)
        } else {
          nextCcTo.push(candidateId)
          nextReportTo = nextReportTo.filter((id) => id !== candidateId)
        }
      }

      setReportToUserIds(nextReportTo)
      setCcToUserIds(nextCcTo)
      emitChanges(nextReportTo, nextCcTo, externalMap)
    } else {
      const nextMap = new Map(externalMap)
      const existing = nextMap.get(candidateId)
      if (existing) {
        nextMap.delete(candidateId)
      } else {
        const safeEmail = candidate.email?.trim() || `${candidate.name.toLowerCase().replace(/[^a-z0-9]/g, "")}@project.contact`
        nextMap.set(candidateId, {
          clientId: candidateId,
          name: candidate.name,
          email: safeEmail,
          company: candidate.organizationName || "",
          role: candidate.role || "",
          group,
        })
      }
      setExternalMap(nextMap)
      emitChanges(reportToUserIds, ccToUserIds, nextMap)
    }
  }

  // Remove external candidate
  function removeExternal(clientId: string) {
    if (disabled) return
    const nextMap = new Map(externalMap)
    nextMap.delete(clientId)
    setExternalMap(nextMap)
    emitChanges(reportToUserIds, ccToUserIds, nextMap)
  }

  // Open Add External Dialog
  function openAddExternal(group: "reportTo" | "ccTo") {
    if (disabled) return
    setDialogGroup(group)
    setExtName("")
    setExtEmail("")
    setExtCompany("")
    setExtRole("")
    setDialogError(null)
    setDialogOpen(true)
  }

  // Handle Add External Submission
  function handleSaveExternal() {
    if (!extName.trim()) {
      setDialogError(isAr ? "الاسم مطلوب." : "Full name is required.")
      return
    }
    if (!extEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extEmail.trim())) {
      setDialogError(isAr ? "يرجى إدخال بريد إلكتروني صحيح." : "Enter a valid email address.")
      return
    }
    setDialogError(null)

    const newExt: ExternalCcRecipientInput & { group: "reportTo" | "ccTo" } = {
      clientId: crypto.randomUUID(),
      name: extName.trim(),
      email: extEmail.trim().toLowerCase(),
      company: extCompany.trim(),
      role: extRole.trim(),
      group: dialogGroup,
    }

    const nextMap = new Map(externalMap)
    nextMap.set(newExt.clientId, newExt)
    setExternalMap(nextMap)
    emitChanges(reportToUserIds, ccToUserIds, nextMap)
    setDialogOpen(false)
  }

  // Filter candidates per search
  const filteredForReport = useMemo(() => {
    const q = reportSearch.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter((c) =>
      [c.name, c.email ?? "", c.role, c.organizationName ?? ""].some((f) => f.toLowerCase().includes(q))
    )
  }, [candidates, reportSearch])

  const filteredForCc = useMemo(() => {
    const q = ccSearch.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter((c) =>
      [c.name, c.email ?? "", c.role, c.organizationName ?? ""].some((f) => f.toLowerCase().includes(q))
    )
  }, [candidates, ccSearch])

  // External recipients grouped
  const externalReportTo = useMemo(
    () => Array.from(externalMap.values()).filter((item) => item.group === "reportTo"),
    [externalMap]
  )
  const externalCcTo = useMemo(
    () => Array.from(externalMap.values()).filter((item) => item.group === "ccTo"),
    [externalMap]
  )

  return (
    <>
      <Card className={cn("gap-0 py-0 overflow-hidden", compact && "shadow-none")}>
        <CardHeader className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/50 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-blue-950 dark:text-blue-100">
                <Mail className="size-4 text-primary" />
                {isAr ? "مستلمو التقرير والنسخ" : "Report Recipients & Copies"}
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isAr
                  ? "حدد الأشخاص المعنيين بالمستند من المشاركين في المشروع أو أضف جهات خارجية."
                  : "Specify primary report recipients and notification copies from project participants."}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 sm:p-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Column 1: Report To */}
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <UserCheck className="size-4 text-primary" />
                    {isAr ? "إرسال التقرير إلى (Report to)" : "Report to"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr ? "المستلمون الرئيسيون للتقرير" : "Primary report recipient"}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {reportToUserIds.length + externalReportTo.length}
                </span>
              </div>

              {/* Minimal Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    className="w-full justify-between bg-background text-xs font-normal"
                  >
                    <span className="truncate">
                      {isAr ? "+ حدد مستلم التقرير..." : "+ Select Report To recipient..."}
                    </span>
                    <ChevronDown className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 p-2">
                  <div className="mb-2 relative">
                    <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                      placeholder={isAr ? "بحث في المشارکین..." : "Search project participants..."}
                      className="h-8 text-xs ps-8"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {filteredForReport.length ? (
                      filteredForReport.map((candidate) => {
                        const isSelected = reportToUserIds.includes(candidate.id) || (externalMap.has(candidate.id) && externalMap.get(candidate.id)?.group === "reportTo")
                        return (
                          <DropdownMenuItem
                            key={candidate.id}
                            onClick={() => toggleCandidate(candidate.id, "reportTo")}
                            className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer"
                          >
                            <span
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded border",
                                isSelected ? "border-primary bg-primary text-primary-foreground" : "bg-background"
                              )}
                            >
                              {isSelected ? <Check className="size-3" /> : null}
                            </span>
                            <Avatar className="size-6">
                              {candidate.avatarUrl ? (
                                <AvatarImage src={profileAvatarDisplayUrl(candidate.avatarUrl)} />
                              ) : null}
                              <AvatarFallback className="text-[10px]">{initials(candidate.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{candidate.name}</p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {candidate.role} {candidate.organizationName ? `· ${candidate.organizationName}` : ""}
                              </p>
                            </div>
                          </DropdownMenuItem>
                        )
                      })
                    ) : (
                      <p className="py-3 text-center text-xs text-muted-foreground">
                        {isAr ? "لا يوجد مشاركون مطابقون." : "No matching participants."}
                      </p>
                    )}
                  </div>

                  <DropdownMenuSeparator className="my-1.5" />

                  <DropdownMenuItem
                    onClick={() => openAddExternal("reportTo")}
                    className="flex items-center gap-2 text-xs text-primary font-medium cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    {isAr ? "+ افزودن مخاطب خارجی" : "+ Add External Contact"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Selected Recipients Display */}
              <div className="mt-2 space-y-2">
                {reportToUserIds.map((userId) => {
                  const candidate = candidateMap.get(userId)
                  if (!candidate) return null
                  return (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="size-8 shrink-0">
                          {candidate.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(candidate.avatarUrl)} /> : null}
                          <AvatarFallback className="text-xs">{initials(candidate.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-foreground">{candidate.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {candidate.role} {candidate.organizationName ? `· ${candidate.organizationName}` : ""}
                          </p>
                        </div>
                      </div>
                      {!disabled ? (
                        <button
                          type="button"
                          onClick={() => toggleCandidate(candidate.id, "reportTo")}
                          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove recipient"
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  )
                })}

                {externalReportTo.map((ext) => (
                  <div
                    key={ext.clientId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                        {initials(ext.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-semibold text-foreground">{ext.name}</p>
                          <span className="rounded bg-primary/10 px-1 py-0.2 text-[9px] font-medium text-primary">
                            External
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {ext.role || "External Contact"} {ext.company ? `· ${ext.company}` : ""} · {ext.email}
                        </p>
                      </div>
                    </div>
                    {!disabled ? (
                      <button
                        type="button"
                        onClick={() => removeExternal(ext.clientId)}
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Remove external contact"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}

                {!reportToUserIds.length && !externalReportTo.length ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    {isAr ? "لم يتم تحديد مستلم رئيسي بعد." : "No primary recipient selected."}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Column 2: CC To */}
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Mail className="size-4 text-primary" />
                    {isAr ? "رونوشت به (CC to)" : "CC to"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr ? "مستلمو النسخة للإشعار" : "Notification copy recipient"}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {ccToUserIds.length + externalCcTo.length}
                </span>
              </div>

              {/* Minimal Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    className="w-full justify-between bg-background text-xs font-normal"
                  >
                    <span className="truncate">
                      {isAr ? "+ حدد نسخة التقرير (CC)..." : "+ Select CC recipient..."}
                    </span>
                    <ChevronDown className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 p-2">
                  <div className="mb-2 relative">
                    <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={ccSearch}
                      onChange={(e) => setCcSearch(e.target.value)}
                      placeholder={isAr ? "بحث في المشارکین..." : "Search project participants..."}
                      className="h-8 text-xs ps-8"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {filteredForCc.length ? (
                      filteredForCc.map((candidate) => {
                        const isSelected = ccToUserIds.includes(candidate.id) || (externalMap.has(candidate.id) && externalMap.get(candidate.id)?.group === "ccTo")
                        return (
                          <DropdownMenuItem
                            key={candidate.id}
                            onClick={() => toggleCandidate(candidate.id, "ccTo")}
                            className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer"
                          >
                            <span
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded border",
                                isSelected ? "border-primary bg-primary text-primary-foreground" : "bg-background"
                              )}
                            >
                              {isSelected ? <Check className="size-3" /> : null}
                            </span>
                            <Avatar className="size-6">
                              {candidate.avatarUrl ? (
                                <AvatarImage src={profileAvatarDisplayUrl(candidate.avatarUrl)} />
                              ) : null}
                              <AvatarFallback className="text-[10px]">{initials(candidate.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{candidate.name}</p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {candidate.role} {candidate.organizationName ? `· ${candidate.organizationName}` : ""}
                              </p>
                            </div>
                          </DropdownMenuItem>
                        )
                      })
                    ) : (
                      <p className="py-3 text-center text-xs text-muted-foreground">
                        {isAr ? "لا يوجد مشاركون مطابقون." : "No matching participants."}
                      </p>
                    )}
                  </div>

                  <DropdownMenuSeparator className="my-1.5" />

                  <DropdownMenuItem
                    onClick={() => openAddExternal("ccTo")}
                    className="flex items-center gap-2 text-xs text-primary font-medium cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    {isAr ? "+ افزودن مخاطب خارجی" : "+ Add External Contact"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Selected Recipients Display */}
              <div className="mt-2 space-y-2">
                {ccToUserIds.map((userId) => {
                  const candidate = candidateMap.get(userId)
                  if (!candidate) return null
                  return (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="size-8 shrink-0">
                          {candidate.avatarUrl ? <AvatarImage src={profileAvatarDisplayUrl(candidate.avatarUrl)} /> : null}
                          <AvatarFallback className="text-xs">{initials(candidate.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-foreground">{candidate.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {candidate.role} {candidate.organizationName ? `· ${candidate.organizationName}` : ""}
                          </p>
                        </div>
                      </div>
                      {!disabled ? (
                        <button
                          type="button"
                          onClick={() => toggleCandidate(candidate.id, "ccTo")}
                          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove CC recipient"
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  )
                })}

                {externalCcTo.map((ext) => (
                  <div
                    key={ext.clientId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                        {initials(ext.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-semibold text-foreground">{ext.name}</p>
                          <span className="rounded bg-primary/10 px-1 py-0.2 text-[9px] font-medium text-primary">
                            External
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {ext.role || "External Contact"} {ext.company ? `· ${ext.company}` : ""} · {ext.email}
                        </p>
                      </div>
                    </div>
                    {!disabled ? (
                      <button
                        type="button"
                        onClick={() => removeExternal(ext.clientId)}
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Remove external CC contact"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}

                {!ccToUserIds.length && !externalCcTo.length ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    {isAr ? "لم يتم تحديد أي نسخة (CC) بعد." : "No CC recipient selected."}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add External Contact Dialog Box */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4 text-primary" />
              {isAr ? "افزودن مخاطب خارجی" : "Add External Contact"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "أدخل بيانات الجهة الخارجية لإرسال التقرير عبر البريد الإلكتروني."
                : `Add an external contact to ${dialogGroup === "reportTo" ? "Report to" : "CC to"} list.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ext-name">
                {isAr ? "الاسم الكامل *" : "Full Name *"}
              </Label>
              <Input
                id="ext-name"
                value={extName}
                onChange={(e) => setExtName(e.target.value)}
                placeholder="e.g. John Smith"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ext-email">
                {isAr ? "البريد الإلكتروني *" : "Email Address *"}
              </Label>
              <Input
                id="ext-email"
                type="email"
                value={extEmail}
                onChange={(e) => setExtEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ext-company">{isAr ? "الشركة / الجهة" : "Company / Organization"}</Label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="ext-company"
                    value={extCompany}
                    onChange={(e) => setExtCompany(e.target.value)}
                    placeholder="Consultant Inc."
                    className="ps-8"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ext-role">{isAr ? "الصفة / الوظيفة" : "Role / Position"}</Label>
                <Input
                  id="ext-role"
                  value={extRole}
                  onChange={(e) => setExtRole(e.target.value)}
                  placeholder="Owner Representative"
                />
              </div>
            </div>

            {dialogError ? (
              <p className="text-xs font-medium text-destructive">{dialogError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSaveExternal}>
              {isAr ? "إضافة وتحديد" : "Add & Select"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
