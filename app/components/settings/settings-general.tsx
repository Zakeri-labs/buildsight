"use client"

import { useI18n } from "@/lib/i18n"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroupLike } from "@/components/settings/language-toggle"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { AvatarManagementDialog } from "@/components/profile/avatar-management-dialog"
import { useCurrentUser } from "@/components/current-user-provider"

export function SettingsGeneral() {
  const { t } = useI18n()
  const currentUser = useCurrentUser()

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
          <div className="mb-6 flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <ProfileAvatar
                name={currentUser.name}
                email={currentUser.email}
                avatarUrl={currentUser.avatarUrl}
                size="xl"
              />
              <div>
                <p className="font-semibold">{currentUser.name}</p>
                <p className="text-sm text-muted-foreground">{currentUser.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, or WEBP. Maximum 5 MB.</p>
              </div>
            </div>
            <AvatarManagementDialog
              targetUser={{
                id: currentUser.id,
                name: currentUser.name,
                email: currentUser.email,
                avatarUrl: currentUser.avatarUrl,
              }}
              triggerLabel="Change profile image"
              triggerVariant="outline"
              onSaved={currentUser.setAvatarUrl}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName">{t.settings.fullName}</Label>
              <Input id="fullName" defaultValue={currentUser.name} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t.settings.email}</Label>
              <Input id="email" type="email" defaultValue={currentUser.email} readOnly />
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
