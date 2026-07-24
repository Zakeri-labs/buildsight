"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, ChevronDown, Lock, LogOut, Search } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

export function AppTopbar() {
  const pathname = usePathname()
  const currentUser = useCurrentUser()
  const userRoleLabel = currentUser.role ? roleLabel(currentUser.role) : "Organization Admin"
  const { t } = useI18n()

  const titleMap: Record<string, { title: string; subtitle: string }> = {
    "/": { title: t.nav.dashboard, subtitle: t.dashboard.overallProgress },
    "/ncrs": { title: t.ncrs.title, subtitle: t.ncrs.subtitle },
    "/inspections": { title: t.inspections.title, subtitle: t.inspections.subtitle },
    "/rfi": { title: "RFI", subtitle: t.documents.typeRfi },
    "/vo": { title: "VO", subtitle: t.documents.typeSubmittal },
    "/documents": { title: t.documents.title, subtitle: t.documents.subtitle },
    "/reports": { title: t.reports.title, subtitle: t.reports.subtitle },
    "/calendar": { title: t.nav.dashboard, subtitle: t.dashboard.overallProgress },
    "/users": { title: t.settings.tabAccess, subtitle: t.settings.accessDesc },
    "/settings": { title: t.settings.title, subtitle: t.settings.subtitle },
    "/projects": { title: t.projects.title, subtitle: t.projects.subtitle },
    "/team": { title: t.team.title, subtitle: t.team.subtitle },
  }

  function resolveTitle(p: string) {
    if (p === "/") return titleMap["/"]
    const match = Object.keys(titleMap)
      .filter((k) => k !== "/")
      .find((k) => p.startsWith(k))
    return match ? titleMap[match] : { title: t.nav.dashboard, subtitle: t.dashboard.overallProgress }
  }

  const { title, subtitle } = resolveTitle(pathname)

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center gap-4 bg-background/95 px-4 backdrop-blur md:px-8">
      {/* Page title */}
      <div className="min-w-0 shrink-0">
        <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* Search */}
      <div className="hidden flex-1 justify-center md:flex">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder={t.common.search}
            aria-label="Search"
            className="h-11 w-full rounded-xl border border-border bg-card ps-9 pe-14 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          <kbd className="pointer-events-none absolute inset-inline-end-3 top-1/2 -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            ⌘ K
          </kbd>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
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

        {/* Language toggle */}
        <LanguageSwitch className="rounded-xl border border-border bg-card px-1 py-1" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
              >
                <Avatar className="size-9">
                  <AvatarImage src="/avatars/arman.png" alt="" />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    {currentUser.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden flex-col items-start leading-tight lg:flex">
                  <span className="text-sm font-semibold">{currentUser.name}</span>
                  <span className="text-xs text-muted-foreground">{userRoleLabel}</span>
                </span>
                <ChevronDown className="hidden size-4 text-muted-foreground lg:block" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span>{currentUser.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{currentUser.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/users">{t.settings.tabAccess}</Link>} />
            <DropdownMenuItem render={<Link href="/settings">{t.settings.title}</Link>} />
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
    </header>
  )
}

