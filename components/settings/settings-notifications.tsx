"use client"

import { useEffect, useState } from "react"
import { BellOff, BellRing } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  browserNotificationPermission,
  browserReviewNotificationsEnabled,
  disableBrowserReviewNotifications,
  enableBrowserReviewNotifications,
  REVIEW_NOTIFICATION_PREFERENCE_EVENT,
  type BrowserNotificationPermissionState,
} from "@/lib/review-submissions/client"

type Channels = { email: boolean; push: boolean }

export function SettingsNotifications() {
  const { t } = useI18n()
  const [browserPermission, setBrowserPermission] = useState<BrowserNotificationPermissionState>("unsupported")
  const [browserEnabled, setBrowserEnabled] = useState(false)

  const rows = [
    { key: "inspections", label: t.settings.notifInspections },
    { key: "ncrs", label: t.settings.notifNcrs },
    { key: "reports", label: t.settings.notifReports },
    { key: "docs", label: t.settings.notifDocs },
  ]

  const [prefs, setPrefs] = useState<Record<string, Channels>>({
    inspections: { email: true, push: true },
    ncrs: { email: true, push: true },
    reports: { email: false, push: true },
    docs: { email: true, push: false },
  })

  useEffect(() => {
    const sync = () => {
      const permission = browserNotificationPermission()
      setBrowserPermission(permission)
      setBrowserEnabled(permission === "granted" && browserReviewNotificationsEnabled())
    }
    sync()
    window.addEventListener(REVIEW_NOTIFICATION_PREFERENCE_EVENT, sync)
    return () => window.removeEventListener(REVIEW_NOTIFICATION_PREFERENCE_EVENT, sync)
  }, [])

  const toggle = (key: string, channel: keyof Channels) =>
    setPrefs((p) => ({ ...p, [key]: { ...p[key], [channel]: !p[key][channel] } }))

  async function enableBrowserNotifications() {
    const result = await enableBrowserReviewNotifications()
    setBrowserPermission(browserNotificationPermission())
    setBrowserEnabled(result === "granted")
  }

  function disableBrowserNotifications() {
    disableBrowserReviewNotifications()
    setBrowserEnabled(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.notifPrefs}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Chrome review notifications</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Show a browser notification for new Term and Sub-term review submissions while BuildSight is open.
            </p>
            {browserPermission === "denied" ? (
              <p className="mt-1 text-xs text-destructive">Notifications are blocked in your browser settings.</p>
            ) : null}
          </div>
          {browserPermission === "unsupported" ? (
            <span className="text-xs text-muted-foreground">Not supported by this browser</span>
          ) : browserEnabled ? (
            <Button type="button" variant="outline" size="sm" onClick={disableBrowserNotifications}>
              <BellOff className="size-4" /> Disable
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void enableBrowserNotifications()}
              disabled={browserPermission === "denied"}
            >
              <BellRing className="size-4" /> Enable Notifications
            </Button>
          )}
        </div>

        <div className="flex flex-col divide-y divide-border">
          <div className="hidden items-center gap-4 pb-2 text-xs font-medium text-muted-foreground sm:flex">
            <span className="flex-1" />
            <span className="w-16 text-center">{t.settings.emailNotif}</span>
            <span className="w-16 text-center">{t.settings.pushNotif}</span>
          </div>
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-4 py-4">
              <span className="flex-1 text-sm text-foreground">{row.label}</span>
              <span className="flex w-16 justify-center">
                <Switch
                  checked={prefs[row.key].email}
                  onCheckedChange={() => toggle(row.key, "email")}
                  aria-label={`${row.label} ${t.settings.emailNotif}`}
                />
              </span>
              <span className="flex w-16 justify-center">
                <Switch
                  checked={prefs[row.key].push}
                  onCheckedChange={() => toggle(row.key, "push")}
                  aria-label={`${row.label} ${t.settings.pushNotif}`}
                />
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
