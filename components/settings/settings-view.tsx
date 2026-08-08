"use client"

import { useI18n } from "@/lib/i18n"
import { PageHeader } from "@/components/dashboard/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsGeneral } from "@/components/settings/settings-general"
import { SettingsNotifications } from "@/components/settings/settings-notifications"
import { SettingsAccess } from "@/components/settings/settings-access"
import { SettingsOrganization } from "@/components/settings/settings-organization"
import { useCurrentUser } from "@/components/current-user-provider"
import { cn } from "@/lib/utils"

export function SettingsView() {
  const { t } = useI18n()
  const currentUser = useCurrentUser()
  const isMember = currentUser.role === "org_member"

  const triggerClassName = isMember ? "flex-none px-2.5 text-xs md:px-1.5 md:text-sm" : undefined

  return (
    <div className={cn("flex min-w-0 flex-col gap-6", isMember && "gap-4 md:gap-6")}>
      {isMember ? (
        <div className="md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        </div>
      ) : null}

      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <Tabs defaultValue="general" className={cn("min-w-0 gap-6", isMember && "gap-4 md:gap-6")}>
        <div
          className={cn(
            "min-w-0",
            isMember && "-mx-1 overflow-x-auto px-1 pb-1 md:mx-0 md:overflow-visible md:px-0 md:pb-0",
          )}
        >
          <TabsList className={cn("flex flex-wrap", isMember && "w-max max-w-none flex-nowrap md:w-fit md:flex-wrap")}>
            <TabsTrigger value="general" className={triggerClassName}>{t.settings.tabGeneral}</TabsTrigger>
            <TabsTrigger value="org-profile" className={triggerClassName}>{t.settings.tabOrgProfile}</TabsTrigger>
            <TabsTrigger value="notifications" className={triggerClassName}>{t.settings.tabNotifications}</TabsTrigger>
            <TabsTrigger value="access" className={triggerClassName}>{t.settings.tabAccess}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="general" className="min-w-0">
          <SettingsGeneral />
        </TabsContent>
        <TabsContent value="org-profile" className="min-w-0">
          <SettingsOrganization />
        </TabsContent>
        <TabsContent value="notifications" className="min-w-0">
          <SettingsNotifications />
        </TabsContent>
        <TabsContent value="access" className="min-w-0">
          <SettingsAccess />
        </TabsContent>
      </Tabs>
    </div>
  )
}
