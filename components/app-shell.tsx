"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { MemberMobileBottomNavigation, MemberMobileDashboardHeader } from "@/components/member-mobile-dashboard-shell"
import { useCurrentUser } from "@/components/current-user-provider"
import { usePathname } from "next/navigation"
import { Suspense } from "react"
import { AppTopbar } from "@/components/app-topbar"
import { NavigationProgress } from "@/components/loading/navigation-progress"
import type { AppNotificationFeed } from "@/lib/notifications/types"

export type ProjectOption = { id: string; name: string }

export function AppShell({
  children,
  projects,
  selectedProjectId,
  canManageStages,
  canAccessSiteVisits,
  notificationFeed,
}: {
  children: React.ReactNode
  projects: ProjectOption[]
  selectedProjectId: string
  canManageStages: boolean
  canAccessSiteVisits: boolean
  notificationFeed: AppNotificationFeed
}) {
  const pathname = usePathname()
  const currentUser = useCurrentUser()
  const isMember = currentUser.role === "org_member"
  const isMemberDashboard = (pathname === "/" || pathname === "/memberhomepage") && isMember
  const showMemberBottomNavigation = isMemberDashboard || (isMember && pathname.startsWith("/calendar"))

  const activeProjectName =
    selectedProjectId === "all" ? null : projects.find((project) => project.id === selectedProjectId)?.name ?? null

  return (
    <div className="flex min-h-dvh bg-background">
      <Suspense fallback={null}><NavigationProgress /></Suspense>
      <div className={isMemberDashboard ? "hidden md:flex" : "flex"}>
        <AppSidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          canManageStages={canManageStages}
          canAccessSiteVisits={canAccessSiteVisits}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {isMemberDashboard ? (
          <>
            <div className="hidden md:block">
              <AppTopbar activeProjectName={activeProjectName} notificationFeed={notificationFeed} />
            </div>
            <MemberMobileDashboardHeader
              projects={projects}
              selectedProjectId={selectedProjectId}
              canManageStages={canManageStages}
              canAccessSiteVisits={canAccessSiteVisits}
            />
          </>
        ) : (
          <AppTopbar activeProjectName={activeProjectName} notificationFeed={notificationFeed} />
        )}
        <main
          className={
            showMemberBottomNavigation
              ? "flex-1 px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:py-6 md:pb-6"
              : "flex-1 px-4 py-5 md:px-8 md:py-6"
          }
        >
          {children}
        </main>
        {showMemberBottomNavigation ? <MemberMobileBottomNavigation /> : null}
      </div>
    </div>
  )
}
