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
  const isMemberHomepage = pathname === "/memberhomepage" && isMember
  const isMemberProjects = pathname === "/projects" && isMember
  const isMemberCalendar = pathname.startsWith("/calendar") && isMember
  const isMemberReportEntry = pathname === "/report-entry" && isMember
  const isMemberSettings = pathname.startsWith("/settings") && isMember
  const isMemberSiteVisits = pathname.startsWith("/site-visits") && isMember
  const isMemberLetters = pathname === "/documents" && isMember
  const isMemberProjectDetail = /^\/projects\/[^/]+\/?$/.test(pathname) && pathname !== "/projects/new" && isMember
  const isMemberProjectStages = /^\/projects\/[^/]+\/stages\/?$/.test(pathname) && isMember
  const isMemberStageReport = /^\/projects\/[^/]+\/stages\/[^/]+\/reports\/new$/.test(pathname) && isMember
  const isMemberDashboard = (pathname === "/" || pathname === "/memberhomepage") && isMember
  const isMemberMobileShell =
    isMemberDashboard || isMemberProjects || isMemberCalendar || isMemberReportEntry || isMemberSettings || isMemberSiteVisits || isMemberLetters || isMemberProjectDetail || isMemberProjectStages || isMemberStageReport
  const isCompactMemberMobileShell =
    isMemberHomepage || isMemberProjects || isMemberCalendar || isMemberReportEntry || isMemberSettings || isMemberSiteVisits || isMemberLetters || isMemberProjectDetail || isMemberProjectStages || isMemberStageReport
  const showMemberBottomNavigation = isMemberMobileShell && !isMemberStageReport

  const activeProjectName =
    selectedProjectId === "all" ? null : projects.find((project) => project.id === selectedProjectId)?.name ?? null

  return (
    <div className="flex min-h-dvh bg-background">
      <Suspense fallback={null}><NavigationProgress /></Suspense>
      <div className={isMemberMobileShell ? "hidden md:flex" : "flex"}>
        <AppSidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          canManageStages={canManageStages}
          canAccessSiteVisits={canAccessSiteVisits}
          homeHref={isMember ? "/memberhomepage" : "/"}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {isMemberMobileShell ? (
          <>
            <div className="hidden md:block">
              <AppTopbar activeProjectName={activeProjectName} notificationFeed={notificationFeed} />
            </div>
            <MemberMobileDashboardHeader
              projects={projects}
              selectedProjectId={selectedProjectId}
              canManageStages={canManageStages}
              canAccessSiteVisits={canAccessSiteVisits}
              compact={isCompactMemberMobileShell}
            />
          </>
        ) : (
          <AppTopbar activeProjectName={activeProjectName} notificationFeed={notificationFeed} />
        )}
        <main
          className={
            isMemberStageReport
              ? "flex-1 px-2 py-3 md:px-8 md:py-6"
              : showMemberBottomNavigation
                ? isCompactMemberMobileShell
                  ? "flex-1 px-4 py-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:px-8 md:py-6 md:pb-6"
                  : "flex-1 px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:py-6 md:pb-6"
                : "flex-1 px-4 py-5 md:px-8 md:py-6"
          }
        >
          {children}
        </main>
        {showMemberBottomNavigation ? <MemberMobileBottomNavigation compact={isCompactMemberMobileShell} /> : null}
      </div>
    </div>
  )
}
