"use client"

import Link from "next/link"
import { Bell, Building2, ChevronDown, Lock, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useI18n } from "@/lib/i18n"
import { LanguageSwitch } from "@/components/language-switch"
import { currentUser, notificationsCount, projectsList, activeProject } from "@/lib/mock-data"

export function AppTopbar() {
  const { t } = useI18n()

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:px-6">
      {/* Project selector */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Building2 className="size-4 text-muted-foreground" />
              <span className="max-w-40 truncate">{activeProject.name}</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>{t.nav.projects}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {projectsList.map((p) => (
              <DropdownMenuItem key={p.id} className="flex-col items-start gap-0.5">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.location}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Search */}
      <div className="relative hidden flex-1 md:block">
        <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t.common.search}
          className="ps-9 bg-background"
          aria-label={t.common.search}
        />
      </div>

      <div className="flex flex-1 items-center justify-end gap-1 md:flex-none">
        {/* Notifications */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="size-5" />
          {notificationsCount > 0 && (
            <span className="absolute -top-0.5 inset-inline-end-0 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground">
              {notificationsCount}
            </span>
          )}
        </button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    {currentUser.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden flex-col items-start leading-tight lg:flex">
                  <span className="text-sm font-semibold">{currentUser.name}</span>
                  <span className="text-xs text-muted-foreground">{t.roles[currentUser.role]}</span>
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
            <DropdownMenuItem render={<Link href="/settings">{t.nav.settings}</Link>} />
            <DropdownMenuItem
              render={
                <Link href="/owner">
                  <Lock className="size-4" data-icon="inline-start" />
                  {t.owner.openPortal}
                </Link>
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1 h-6 w-px bg-border" />

        {/* Language toggle */}
        <LanguageSwitch />
      </div>
    </header>
  )
}
