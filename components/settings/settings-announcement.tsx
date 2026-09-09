"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Check, Megaphone, ShieldAlert } from "lucide-react"
import { useCurrentUser } from "@/components/current-user-provider"
import type { AnnouncementType, SystemAnnouncement } from "@/lib/announcements/types"
import { getSystemAnnouncementAction, saveSystemAnnouncementAction } from "@/lib/actions/system-announcement"
import { cn } from "@/lib/utils"

function isoToDatetimeLocal(isoString: string | null): string {
  if (!isoString) return ""
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ""
  }
}

function datetimeLocalToIso(localString: string): string | null {
  if (!localString.trim()) return null
  try {
    const d = new Date(localString)
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch {
    return null
  }
}

export function SettingsAnnouncement() {
  const { t, locale } = useI18n()
  const currentUser = useCurrentUser()
  const isArabic = locale === "ar"

  // Admin authorization: org_admin, org_manager, or admin
  const isAdmin = !currentUser.role || currentUser.role === "org_admin" || currentUser.role === "admin" || currentUser.role === "org_manager"

  const [isActive, setIsActive] = useState(false)
  const [message, setMessage] = useState("")
  const [type, setType] = useState<AnnouncementType>("maintenance")
  const [expiresAtLocal, setExpiresAtLocal] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    getSystemAnnouncementAction().then((res) => {
      if (!mounted) return
      setLoading(false)
      if (res.ok && res.data) {
        setIsActive(res.data.isActive)
        setMessage(res.data.message || "")
        setType(res.data.type || "maintenance")
        setExpiresAtLocal(isoToDatetimeLocal(res.data.expiresAt))
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const expiresAtIso = datetimeLocalToIso(expiresAtLocal)
      const res = await saveSystemAnnouncementAction({
        message,
        type,
        isActive,
        expiresAt: expiresAtIso,
      })

      if (!res.ok) {
        setError(res.error || "Failed to save announcement")
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save announcement")
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex min-h-60 flex-col items-center justify-center p-6 text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <ShieldAlert className="size-7" />
          </span>
          <h2 className="text-lg font-semibold">
            {isArabic ? "صلاحية الإدارة مطلوبة" : "Administrator Access Required"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {t.settings.announcementAdminOnly}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Megaphone className="size-5 text-primary" />
                {t.settings.announcementTitle}
              </CardTitle>
              <CardDescription className="mt-1">
                {t.settings.announcementSubtitle}
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
            >
              {isArabic ? "للإدارة فقط" : "Admin Only"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 1. Enable Announcement Toggle */}
          <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enable-announcement" className="text-sm font-semibold">
                {t.settings.announcementEnable}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t.settings.announcementEnableDesc}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                {isActive ? (isArabic ? "مفعل" : "ON") : (isArabic ? "معطل" : "OFF")}
              </span>
              <Switch
                id="enable-announcement"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={loading || saving}
              />
            </div>
          </div>

          {/* 2. Message Textarea */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="announcement-message" className="text-sm font-semibold">
              {t.settings.announcementMessage}
            </Label>
            <textarea
              id="announcement-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t.settings.announcementMessagePlaceholder}
              disabled={loading || saving}
              className={cn(
                "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow]",
                "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
          </div>

          {/* 3. Type & Display Until Grid */}
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Type Dropdown */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="announcement-type" className="text-sm font-semibold">
                {t.settings.announcementType}
              </Label>
              <Select
                value={type}
                onValueChange={(val) => setType(val as AnnouncementType)}
                disabled={loading || saving}
              >
                <SelectTrigger id="announcement-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-amber-500" />
                      <span>{t.settings.announcementTypeMaintenance}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="update">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-blue-500" />
                      <span>{t.settings.announcementTypeUpdate}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="general">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-slate-500" />
                      <span>{t.settings.announcementTypeGeneral}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Display Until Datetime Picker */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="announcement-expires" className="text-sm font-semibold">
                {t.settings.announcementExpiresAt}
              </Label>
              <Input
                id="announcement-expires"
                type="datetime-local"
                value={expiresAtLocal}
                onChange={(e) => setExpiresAtLocal(e.target.value)}
                disabled={loading || saving}
                className="w-full"
              />
              <p className="text-[11px] text-muted-foreground">
                {t.settings.announcementExpiresAtDesc}
              </p>
            </div>
          </div>

          {/* 4. Feedback and Save Action */}
          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {saved ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="size-4" />
                  {t.settings.announcementSaved}
                </span>
              ) : null}
              {error ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <AlertCircle className="size-4" />
                  {error}
                </span>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={loading || saving}
              className="bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
            >
              {saving ? (isArabic ? "جاري الحفظ..." : "Saving...") : t.settings.save}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
