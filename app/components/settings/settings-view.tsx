"use client"

import { useI18n } from "@/lib/i18n"
import { PageHeader } from "@/components/dashboard/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsGeneral } from "@/components/settings/settings-general"
import { SettingsNotifications } from "@/components/settings/settings-notifications"
import { SettingsAccess } from "@/components/settings/settings-access"
import { SettingsOrganization } from "@/components/settings/settings-organization"

export function SettingsView() {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <Tabs defaultValue="general" className="gap-6">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="general">{t.settings.tabGeneral}</TabsTrigger>
          <TabsTrigger value="org-profile">{t.settings.tabOrgProfile}</TabsTrigger>
          <TabsTrigger value="notifications">{t.settings.tabNotifications}</TabsTrigger>
          <TabsTrigger value="access">{t.settings.tabAccess}</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <SettingsGeneral />
        </TabsContent>
        <TabsContent value="org-profile">
          <SettingsOrganization />
        </TabsContent>
        <TabsContent value="notifications">
          <SettingsNotifications />
        </TabsContent>
        <TabsContent value="access">
          <SettingsAccess />
        </TabsContent>
      </Tabs>
    </div>
  )
}
