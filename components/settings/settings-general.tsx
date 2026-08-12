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
import { cn } from "@/lib/utils"
import { useState, useTransition } from "react"
import { updateProfile } from "@/lib/actions/profile"
import { CheckCircle2, Loader2, Lock } from "lucide-react"

export function SettingsGeneral() {
  const { t } = useI18n()
  const currentUser = useCurrentUser()
  const isMember = currentUser.role === "org_member"

  const [fullName, setFullName] = useState(currentUser.name ?? "")
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const mobileCardClass = isMember ? "[--card-spacing:--spacing(3)] md:[--card-spacing:--spacing(4)]" : undefined
  const fieldClass = cn("flex min-w-0 flex-col gap-2", isMember && "gap-1.5 md:gap-2")
  const labelClass = isMember ? "text-xs md:text-sm" : undefined
  const inputClass = isMember ? "min-w-0" : undefined

  function handleSave() {
    setSaveStatus("idle")
    setErrorMessage(null)
    startTransition(async () => {
      const result = await updateProfile(fullName)
      if (result.success) {
        setSaveStatus("success")
        setTimeout(() => setSaveStatus("idle"), 3000)
      } else {
        setSaveStatus("error")
        setErrorMessage(result.error)
      }
    })
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-6", isMember && "gap-4 md:gap-6")}>
      <Card className={mobileCardClass}>
        <CardHeader>
          <CardTitle>{t.settings.language}</CardTitle>
          <CardDescription>{t.settings.languageDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroupLike compactMobile={isMember} />
        </CardContent>
      </Card>

      <Card className={mobileCardClass}>
        <CardHeader>
          <CardTitle>{t.settings.profile}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "mb-6 flex flex-col gap-4 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between",
              isMember &&
                "mb-4 min-w-0 gap-3 p-3 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between md:mb-6 md:gap-4 md:p-4",
            )}
          >
            <div className={cn("flex items-center gap-4", isMember && "min-w-0 gap-3 md:gap-4")}>
              <ProfileAvatar
                name={currentUser.name}
                email={currentUser.email}
                avatarUrl={currentUser.avatarUrl}
                size="xl"
                className={isMember ? "size-14 shrink-0 md:size-20" : undefined}
                fallbackClassName={isMember ? "text-base md:text-xl" : undefined}
              />
              <div className="min-w-0">
                <p className="truncate font-semibold">{currentUser.name}</p>
                <p className="truncate text-sm text-muted-foreground">{currentUser.email}</p>
                <p className={cn("mt-1 text-xs text-muted-foreground", isMember && "hidden min-[430px]:block md:block")}>
                  JPG, PNG, or WEBP. Maximum 5 MB.
                </p>
              </div>
            </div>
            <div className={cn(isMember && "w-full shrink-0 min-[380px]:w-auto [&_button]:w-full min-[380px]:[&_button]:w-auto")}>
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
          </div>

          <div className={cn("grid gap-5 sm:grid-cols-2", isMember && "grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:gap-5")}>
            <div className={fieldClass}>
              <Label htmlFor="fullName" className={labelClass}>{t.settings.fullName}</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                disabled={isPending}
              />
            </div>
            <div className={fieldClass}>
              <Label htmlFor="email" className={cn(labelClass, "flex items-center gap-1.5")}>
                {t.settings.email}
                <Lock className="size-3 text-muted-foreground" />
              </Label>
              <Input
                id="email"
                type="email"
                value={currentUser.email}
                readOnly
                disabled
                className={cn(inputClass, "cursor-not-allowed opacity-60")}
              />
            </div>
            <div className={fieldClass}>
              <Label htmlFor="jobTitle" className={labelClass}>{t.settings.jobTitle}</Label>
              <Input id="jobTitle" defaultValue="Project Manager" className={inputClass} />
            </div>
            <div className={fieldClass}>
              <Label htmlFor="timezone" className={labelClass}>{t.settings.timezone}</Label>
              <Input id="timezone" defaultValue="(GMT+4) Gulf Standard Time" className={inputClass} />
            </div>
          </div>

          <div className={cn("mt-6 flex items-center justify-end gap-3", isMember && "mt-4 md:mt-6")}>
            {saveStatus === "success" && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                Profile saved successfully!
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-sm text-destructive">{errorMessage ?? "Failed to save."}</span>
            )}
            <Button
              onClick={handleSave}
              disabled={isPending || !fullName.trim()}
              className={cn(
                "bg-accent text-accent-foreground hover:bg-accent/90",
                isMember && "w-full min-[420px]:w-auto",
              )}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                t.settings.save
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
