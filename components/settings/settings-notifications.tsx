"use client"

import { useState } from "react"
import { useI18n } from "@/lib/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

type Channels = { email: boolean; push: boolean }

export function SettingsNotifications() {
  const { t } = useI18n()

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

  const toggle = (key: string, channel: keyof Channels) =>
    setPrefs((p) => ({ ...p, [key]: { ...p[key], [channel]: !p[key][channel] } }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.notifPrefs}</CardTitle>
      </CardHeader>
      <CardContent>
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
