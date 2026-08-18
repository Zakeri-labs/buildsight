"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, FileText, FolderKanban, Home, MapPinned, Plus, User } from "lucide-react"
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
  compact = false,
}: {
  projects: ProjectOption[]
  selectedProjectId: string
  canManageStages: boolean
  canAccessSiteVisits: boolean
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 flex items-center justify-between border-b bg-background/95 backdrop-blur md:hidden",
          compact
            ? "min-h-12 px-3 pb-1.5 pt-[calc(0.25rem+env(safe-area-inset-top))]"
            : "min-h-16 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]",
        )}
      >
        <div className="min-w-0">
          <Logo variant="dark" className={cn("dark:hidden", compact && "[&_img]:h-7 [&_img]:max-w-[140px]")} />
          <Logo variant="white" className={cn("hidden dark:flex", compact && "[&_img]:h-7 [&_img]:max-w-[140px]")} />
        </div>
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center border bg-background text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "size-9 rounded-lg" : "size-11 rounded-xl",
          )}
        >
          <span className={cn("flex flex-col", compact ? "w-4 gap-1" : "w-5 gap-1.5")} aria-hidden="true">
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
            homeHref="/memberhomepage"
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
  compact = false,
}: {
  label: string
  icon: React.ElementType
  href?: string
  active?: boolean
  uiOnly?: boolean
  compact?: boolean
}) {
  const classes = cn(
    "flex min-w-0 flex-1 flex-col items-center justify-center px-1 font-medium transition-colors",
    compact ? "gap-0.5 py-1 text-[10px]" : "gap-1 py-2 text-[11px]",
    active ? "text-primary" : "text-muted-foreground",
  )

  const content = (
    <>
      <Icon className={compact ? "size-[18px]" : "size-5"} aria-hidden="true" />
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

export function MemberMobileBottomNavigation({
  compact = false,
  isMember = true,
}: {
  compact?: boolean
  isMember?: boolean
}) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.45)] backdrop-blur md:hidden"
    >
      <div
        className={cn(
          "relative mx-auto grid max-w-lg grid-cols-5 items-stretch px-2",
          compact ? "h-[3.75rem]" : "h-[4.5rem]",
        )}
      >
        <BottomNavItem
          label={isMember ? "Home" : "Dashboard"}
          icon={Home}
          href={isMember ? "/memberhomepage" : "/"}
          active={isMember ? pathname === "/memberhomepage" : pathname === "/"}
          compact={compact}
        />
        <BottomNavItem
          label="Projects"
          icon={FolderKanban}
          href="/projects"
          active={pathname === "/projects" || pathname.startsWith("/projects/")}
          compact={compact}
        />

        <div className={cn("relative flex items-end justify-center", compact ? "pb-0.5" : "pb-1")}>
          <Link
            href={isMember ? "/report-entry" : "/projects/new"}
            aria-label={isMember ? "Report Entry" : "New Project"}
            aria-current={(isMember ? pathname === "/report-entry" : pathname === "/projects/new") ? "page" : undefined}
            className={cn(
              "absolute inline-flex items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95",
              compact ? "-top-3 size-[3.75rem]" : "-top-5 size-14",
              (isMember ? pathname === "/report-entry" : pathname === "/projects/new") && "ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
            )}
          >
            <Plus className={compact ? "size-[1.875rem]" : "size-7"} aria-hidden="true" />
          </Link>
        </div>

        <BottomNavItem label="Calendar" icon={CalendarDays} href="/calendar" active={pathname.startsWith("/calendar")} compact={compact} />

        {isMember ? (
          <BottomNavItem label="Reports" icon={FileText} href="/my-reports" active={pathname.startsWith("/my-reports")} compact={compact} />
        ) : (
          <BottomNavItem label="Site Visits" icon={MapPinned} href="/site-visits" active={pathname.startsWith("/site-visits")} compact={compact} />
        )}
      </div>
    </nav>
  )
}
