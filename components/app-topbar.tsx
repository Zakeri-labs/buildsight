"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, Lock, LogOut } from "lucide-react"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LanguageSwitch } from "@/components/language-switch"
import { useCurrentUser } from "@/components/current-user-provider"
import { signOut } from "@/lib/actions/auth"
import { roleLabel } from "@/lib/db/types"
import { useI18n } from "@/lib/i18n"
import { ReviewNotificationCenter } from "@/components/notifications/review-notification-center"
import type { AppNotificationFeed } from "@/lib/notifications/types"

import { useState } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import type { ProjectOption } from "@/components/app-shell"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

export function AppTopbar({
  activeProjectName,
  notificationFeed,
  projects = [],
  selectedProjectId = "all",
  canManageStages = false,
  canAccessSiteVisits = false,
  homeHref = "/",
}: {
  activeProjectName?: string | null
  notificationFeed: AppNotificationFeed
  projects?: ProjectOption[]
  selectedProjectId?: string
  canManageStages?: boolean
  canAccessSiteVisits?: boolean
  homeHref?: "/" | "/memberhomepage"
}) {
  const pathname = usePathname()
  const currentUser = useCurrentUser()
  const userRoleLabel = currentUser.role ? roleLabel(currentUser.role) : "Admin"
  const { t } = useI18n()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const titleMap: Record<string, { title: string; subtitle: string }> = {
    "/": { title: t.nav.dashboard, subtitle: t.dashboard.overallProgress },
    "/ncrs": { title: t.ncrs.title, subtitle: t.ncrs.subtitle },
    "/inspections": { title: t.inspections.title, subtitle: t.inspections.subtitle },
    "/rfi": { title: "RFI", subtitle: t.documents.typeRfi },
    "/vo": { title: "VO", subtitle: t.documents.typeSubmittal },
    "/documents": { title: t.documents.title, subtitle: t.documents.subtitle },
    "/initial-documents": { title: t.nav.initialDocuments, subtitle: "Initial reference files uploaded with each project" },
    "/reports": { title: t.reports.title, subtitle: t.reports.subtitle },
    "/calendar": { title: t.nav.calendar, subtitle: "" },
    "/site-visits": { title: t.nav.siteVisits, subtitle: "Request, schedule, and track project site visits" },
    "/users": { title: t.settings.tabAccess, subtitle: t.settings.accessDesc },
    "/stages": { title: t.nav.addStage, subtitle: t.stages.subtitle },
    "/settings": { title: t.settings.title, subtitle: t.settings.subtitle },
    "/projects": { title: t.projects.title, subtitle: t.projects.subtitle },
    "/team": { title: t.team.title, subtitle: t.team.subtitle },
  }

  function resolveTitle(p: string) {
    if (p === "/" && activeProjectName) {
      return {
        title: activeProjectName,
        subtitle: "Project dashboard, progress, and activity",
      }
    }
    if (activeProjectName && /^\/projects\/[^/]+$/.test(p)) {
      return {
        title: activeProjectName,
        subtitle: "Project overview, participants, documents, letters, and site visits",
      }
    }
    if (p === "/") return titleMap["/"]
    const match = Object.keys(titleMap)
      .filter((k) => k !== "/")
      .find((k) => p.startsWith(k))
    return match ? titleMap[match] : { title: t.nav.dashboard, subtitle: "" }
  }

  const { title, subtitle } = resolveTitle(pathname)
  const isSiteVisitRequestList = pathname === "/site-visits"
  const isInitialDocumentsPage = pathname === "/initial-documents"
  const isTitlelessPage = isSiteVisitRequestList || isInitialDocumentsPage

  return (
    <header className={`sticky top-0 z-30 flex items-center gap-3 bg-background/95 px-4 backdrop-blur md:px-8 ${isTitlelessPage ? "h-14 justify-between md:justify-end" : "h-20"}`}>
      {/* Mobile Hamburger Drawer Trigger */}
      <button
        type="button"
        aria-label="Open navigation menu"
        aria-expanded={mobileMenuOpen}
        onClick={() => setMobileMenuOpen(true)}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <span className="flex w-4 flex-col gap-1" aria-hidden="true">
          <span className="h-0.5 w-full rounded-full bg-current" />
          <span className="h-0.5 w-full rounded-full bg-current" />
          <span className="h-0.5 w-full rounded-full bg-current" />
        </span>
      </button>

      {/* Mobile Navigation Drawer */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar
            projects={projects}
            selectedProjectId={selectedProjectId}
            canManageStages={canManageStages}
            canAccessSiteVisits={canAccessSiteVisits}
            homeHref={homeHref}
            onNavigate={() => setMobileMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Page title */}
      {!isTitlelessPage ? (
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h1>
          {subtitle && <p className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</p>}
        </div>
      ) : (
        <div className="min-w-0 flex-1 md:hidden">
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{title}</h1>
        </div>
      )}

      {/* Right-side actions */}
      <div className="flex items-center gap-1.5">

        {/* Language toggle */}
        <LanguageSwitch />

        {/* Notifications */}
        <ReviewNotificationCenter initialFeed={notificationFeed} userId={currentUser.id} />

        {/* User profile menu */}
        <div className="flex items-center rounded-xl p-0.5 hover:bg-muted/50">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="User Menu"
                  className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
                >
                  <ProfileAvatar
                    name={currentUser.name}
                    email={currentUser.email}
                    avatarUrl={currentUser.avatarUrl}
                    size="md"
                    fallbackClassName="bg-primary text-primary-foreground"
                  />
                  <span className="hidden flex-col items-start leading-tight lg:flex">
                    <span className="text-sm font-semibold">{currentUser.name}</span>
                    <span className="text-xs text-muted-foreground">{userRoleLabel}</span>
                  </span>
                  <span className="flex size-8 items-center justify-center rounded-lg text-muted-foreground">
                    <ChevronDown className="size-4" />
                  </span>
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex flex-col">
                  <span>{currentUser.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{currentUser.email}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/settings">{t.settings.title}</Link>} />
              <DropdownMenuItem render={<Link href="/users">{t.settings.tabAccess}</Link>} />
              <DropdownMenuItem
                render={
                  <Link href="/owner">
                    <Lock className="size-4" data-icon="inline-start" />
                    {t.owner.openPortal}
                  </Link>
                }
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void signOut()
                }}
              >
                <LogOut className="size-4" data-icon="inline-start" />
                {t.nav.logOut}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
