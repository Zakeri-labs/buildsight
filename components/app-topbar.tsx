"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, ChevronDown, Lock, LogOut } from "lucide-react"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LanguageSwitch } from "@/components/language-switch"
import { useCurrentUser } from "@/components/current-user-provider"
import { signOut } from "@/lib/actions/auth"
import { notificationsCount } from "@/lib/mock-data"
import { roleLabel } from "@/lib/db/types"
import { useI18n } from "@/lib/i18n"

export function AppTopbar({ activeProjectName }: { activeProjectName?: string | null }) {
  const pathname = usePathname()
  const currentUser = useCurrentUser()
  const userRoleLabel = currentUser.role ? roleLabel(currentUser.role) : "Admin"
  const { t } = useI18n()

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
        subtitle: "Project overview, participants, and project letters",
      }
    }
    if (p === "/") return titleMap["/"]
    const match = Object.keys(titleMap)
      .filter((k) => k !== "/")
      .find((k) => p.startsWith(k))
    return match ? titleMap[match] : { title: t.nav.dashboard, subtitle: "" }
  }

  const { title, subtitle } = resolveTitle(pathname)

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center gap-4 bg-background/95 px-4 backdrop-blur md:px-8">
      {/* Page title */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {/* Right-side actions */}
      <div className="flex items-center gap-1.5">

        {/* Language toggle */}
        <LanguageSwitch />

        {/* Notifications */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="size-5" />
          {notificationsCount > 0 && (
            <span className="absolute top-1 inset-inline-end-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {notificationsCount}
            </span>
          )}
        </button>

        {/* User profile link & menu */}
        <div className="flex items-center gap-1 rounded-xl p-0.5 hover:bg-muted/50">
          <Link
            href="/settings"
            className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
            title={t.settings.title}
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
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="User Menu"
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronDown className="size-4" />
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span>{currentUser.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{currentUser.email}</span>
              </DropdownMenuLabel>
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
