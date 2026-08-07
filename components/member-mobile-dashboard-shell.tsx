"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, FolderKanban, Home, Plus, User } from "lucide-react"
import { useState } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import type { ProjectOption } from "@/components/app-shell"
import { Logo } from "@/components/logo"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export function MemberMobileDashboardHeader({
  projects,
  selectedProjectId,
  canManageStages,
  canAccessSiteVisits,
}: {
  projects: ProjectOption[]
  selectedProjectId: string
  canManageStages: boolean
  canAccessSiteVisits: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b bg-background/95 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur md:hidden">
        <div className="min-w-0">
          <Logo variant="dark" className="dark:hidden" />
          <Logo variant="white" className="hidden dark:flex" />
        </div>
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex w-5 flex-col gap-1.5" aria-hidden="true">
            <span className="h-0.5 w-full rounded-full bg-current" />
            <span className="h-0.5 w-full rounded-full bg-current" />
            <span className="h-0.5 w-full rounded-full bg-current" />
          </span>
        </button>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[min(88vw,20rem)] gap-0 overflow-hidden border-sidebar-border bg-sidebar p-0 text-sidebar-foreground md:hidden"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar
            projects={projects}
            selectedProjectId={selectedProjectId}
            canManageStages={canManageStages}
            canAccessSiteVisits={canAccessSiteVisits}
            embedded
            hideAdministration
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

function BottomNavItem({
  label,
  icon: Icon,
  href,
  active,
  uiOnly = false,
}: {
  label: string
  icon: React.ElementType
  href?: string
  active?: boolean
  uiOnly?: boolean
}) {
  const classes = cn(
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
    active ? "text-primary" : "text-muted-foreground",
  )

  const content = (
    <>
      <Icon className="size-5" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </>
  )

  if (href && !uiOnly) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} className={classes}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" className={classes} aria-current={active ? "page" : undefined}>
      {content}
    </button>
  )
}

export function MemberMobileBottomNavigation() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.45)] backdrop-blur md:hidden"
    >
      <div className="relative mx-auto grid h-[4.5rem] max-w-lg grid-cols-5 items-stretch px-2">
        <BottomNavItem label="Home" icon={Home} href="/memberhomepage" active={pathname === "/memberhomepage"} />
        <BottomNavItem
          label="Projects"
          icon={FolderKanban}
          href="/projects"
          active={pathname === "/projects" || pathname.startsWith("/projects/")}
        />

        <div className="relative flex items-end justify-center pb-1">
          <button
            type="button"
            aria-label="Quick action"
            className="absolute -top-5 inline-flex size-14 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
          >
            <Plus className="size-7" aria-hidden="true" />
          </button>
        </div>

        <BottomNavItem label="Calendar" icon={CalendarDays} href="/calendar" active={pathname.startsWith("/calendar")} />
        <BottomNavItem label="Profile" icon={User} href="/settings" active={pathname.startsWith("/settings")} />
      </div>
    </nav>
  )
}
