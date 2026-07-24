"use client"

import { useI18n } from "@/lib/i18n"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroupLike } from "@/components/settings/language-toggle"

export function SettingsGeneral() {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.language}</CardTitle>
          <CardDescription>{t.settings.languageDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroupLike />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.settings.profile}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName">{t.settings.fullName}</Label>
              <Input id="fullName" defaultValue="Omar Hassan" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t.settings.email}</Label>
              <Input id="email" type="email" defaultValue="omar.hassan@buildsight.ae" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="jobTitle">{t.settings.jobTitle}</Label>
              <Input id="jobTitle" defaultValue="Project Manager" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="timezone">{t.settings.timezone}</Label>
              <Input id="timezone" defaultValue="(GMT+4) Gulf Standard Time" />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
              {t.settings.save}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
