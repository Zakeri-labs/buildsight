"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Home,
  Mail,
  FolderOpen,
  CalendarDays,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  FolderKanban,
  Building2,
  HardHat,
  ListTree,
  Search,
  Sparkles,
  MapPinned,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { signOut } from "@/lib/actions/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useEffect, useLayoutEffect, useMemo, useState, useTransition } from "react"
import { selectProject } from "@/lib/actions/project-scope"
import type { ProjectOption } from "@/components/app-shell"
import { NAVIGATION_START_EVENT } from "@/components/loading/navigation-progress"
import { useI18n } from "@/lib/i18n"

function NavLink({
  label,
  href,
  icon: Icon,
  active,
  onNavigate,
}: {
  label: string
  href: string
  icon: React.ElementType
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-5 shrink-0" />
      <span>{label}</span>
    </Link>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">
      {children}
    </p>
  )
}

export function AppSidebar({
  projects,
  selectedProjectId,
  canManageStages,
  canAccessSiteVisits,
  embedded = false,
  hideAdministration = false,
  onNavigate,
  homeHref = "/",
}: {
  projects: ProjectOption[]
  selectedProjectId: string
  canManageStages: boolean
  canAccessSiteVisits: boolean
  embedded?: boolean
  hideAdministration?: boolean
  onNavigate?: () => void
  homeHref?: "/" | "/memberhomepage"
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t, locale } = useI18n()
  const [pendingSelection, setPendingSelection] = useState<{ id: string; fromPathname: string } | null>(null)
  const [projectSearch, setProjectSearch] = useState("")
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [, startTransition] = useTransition()

  const routeProjectId = useMemo(() => {
    const match = pathname.match(/^\/projects\/([^/]+)(?:\/|$)/)
    if (!match?.[1] || match[1] === "new") return null

    try {
      return decodeURIComponent(match[1])
    } catch {
      return null
    }
  }, [pathname])

  const routeProject = routeProjectId ? projects.find((item) => item.id === routeProjectId) ?? null : null
  const isProjectScopedModule = pathname.startsWith("/documents") || pathname.startsWith("/initial-documents") || pathname.startsWith("/site-visits")
  const requestedModuleProjectId = isProjectScopedModule
    ? searchParams.get("project")?.trim() || null
    : null
  const requestedModuleProject = requestedModuleProjectId
    ? projects.find((item) => item.id === requestedModuleProjectId) ?? null
    : null
  const storedProject = selectedProjectId !== "all"
    ? projects.find((item) => item.id === selectedProjectId) ?? null
    : null
  const preservesSelectedProject =
    pathname === "/" ||
    pathname.startsWith("/documents") ||
    pathname.startsWith("/initial-documents") ||
    pathname.startsWith("/site-visits") ||
    pathname.startsWith("/ai-summary") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/inspections") ||
    pathname.startsWith("/ncrs")
  const routeSelection = routeProjectId
    ? routeProject?.id ?? "all"
    : requestedModuleProjectId
      ? requestedModuleProject?.id ?? "all"
      : preservesSelectedProject
        ? storedProject?.id ?? "all"
        : "all"
  const optimisticSelection =
    pendingSelection?.fromPathname === pathname ? pendingSelection.id : null
  const project = optimisticSelection ?? routeSelection
  const contextProjectId = project !== "all" ? project : null

  useLayoutEffect(() => {
    if (pendingSelection && pendingSelection.fromPathname !== pathname) {
      setPendingSelection(null)
    }
  }, [pathname, pendingSelection])

  useEffect(() => {
    if (selectedProjectId === routeSelection) return

    startTransition(async () => {
      try {
        await selectProject(routeSelection)
        router.refresh()
      } catch {
        // Keep the route-derived UI stable even if persisting the cookie fails.
      }
    })
  }, [routeSelection, router, selectedProjectId, startTransition])

  const stageNavigationItem = contextProjectId
    ? {
        label: locale === "ar" ? "المراحل" : "Reports",
        href: `/projects/${contextProjectId}/stages`,
        icon: ListTree,
      }
    : canManageStages
      ? {
          label: t.nav.addStage,
          href: "/stages",
          icon: ListTree,
        }
      : null

  const projectNavigationItem = contextProjectId
    ? {
        label: locale === "ar" ? "المشروع" : "Project",
        href: `/projects/${contextProjectId}`,
        icon: FolderKanban,
      }
    : {
        label: t.projects.title,
        href: "/projects",
        icon: FolderKanban,
      }

  const homeLabel = homeHref === "/memberhomepage" ? (locale === "ar" ? "الرئيسية" : "Home") : t.nav.dashboard

  const isMember = homeHref === "/memberhomepage"

  const supervisorPerformanceItem = {
    label: locale === "ar" ? "أداء المشرفين" : "Supervisor Performance",
    href: "/supervisor-performance",
    icon: TrendingUp,
  }
  void supervisorPerformanceItem

  const moduleItems = [
    { label: homeLabel, href: homeHref, icon: Home },
    projectNavigationItem,
    ...(stageNavigationItem ? [stageNavigationItem] : []),
    {
      label: t.nav.documents,
      href: contextProjectId
        ? `/documents?project=${encodeURIComponent(contextProjectId)}`
        : "/documents",
      icon: Mail,
    },
    {
      label: t.nav.initialDocuments,
      href: contextProjectId
        ? `/initial-documents?project=${encodeURIComponent(contextProjectId)}`
        : "/initial-documents",
      icon: FolderOpen,
    },
    ...(canAccessSiteVisits
      ? [{
          label: locale === "en" ? "Site Visit Request" : t.nav.siteVisits,
          href: contextProjectId
            ? `/site-visits?project=${encodeURIComponent(contextProjectId)}`
            : "/site-visits",
          icon: MapPinned,
        }]
      : []),
    {
      label: t.nav.calendar,
      href: contextProjectId
        ? `/calendar?project=${encodeURIComponent(contextProjectId)}`
        : "/calendar",
      icon: CalendarDays,
    },
    ...(contextProjectId ? [{ label: t.nav.aiSummary, href: "/ai-summary", icon: Sparkles }] : []),
  ]

  const adminItems = [
    { label: t.nav.team, href: "/users", icon: Users },
    { label: t.nav.settings, href: "/settings", icon: Settings },
  ]

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLocaleLowerCase(locale)
    if (!query) return projects
    return projects.filter((item) => item.name.toLocaleLowerCase(locale).includes(query))
  }, [locale, projectSearch, projects])

  async function handleSelectProject(value: string) {
    if (!value || value === project) return

    const targetPath = value === "all" ? "/projects" : `/projects/${encodeURIComponent(value)}`
    setPendingSelection({ id: value, fromPathname: pathname })
    setProjectMenuOpen(false)
    setProjectSearch("")
    onNavigate?.()
    window.dispatchEvent(new Event(NAVIGATION_START_EVENT))

    startTransition(async () => {
      try {
        await selectProject(value)
        router.push(targetPath)
        router.refresh()
      } catch {
        setPendingSelection(null)
      }
    })
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        embedded ? "relative h-full w-full" : "sticky top-0 h-dvh w-64",
      )}
    >
      <div className="flex h-20 items-center px-5">
        <Logo />
      </div>

      <div className="px-4 pb-2">
        <SectionLabel>{t.projects.title ?? "Projects"}</SectionLabel>
        <DropdownMenu
          open={projectMenuOpen}
          onOpenChange={(open) => {
            setProjectMenuOpen(open)
            if (!open) setProjectSearch("")
          }}
        >
          <DropdownMenuTrigger
            disabled={projects.length === 0}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/50 px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-sidebar-accent disabled:opacity-50"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Building2 className="size-4 shrink-0 text-sidebar-primary" />
              <span className="truncate">
                {optimisticSelection === "all"
                  ? "All Projects"
                  : contextProjectId
                    ? (projects.find((item) => item.id === contextProjectId)?.name ?? "Select project")
                    : "All Projects"}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-sidebar-foreground/50" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-[224px] p-0" sideOffset={6}>
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Escape" && e.key !== "ArrowDown") {
                      e.stopPropagation()
                    }
                  }}
                  onKeyDownCapture={(e) => {
                    if (e.key !== "Escape" && e.key !== "ArrowDown") {
                      e.stopPropagation()
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key !== "Escape" && e.key !== "ArrowDown") {
                      e.stopPropagation()
                    }
                  }}
                  placeholder={t.projects.searchProjects}
                  className="h-9 pl-8 text-xs"
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto p-1">
              <DropdownMenuRadioGroup value={project} onValueChange={handleSelectProject}>
                <DropdownMenuRadioItem
                  value="all"
                  className={cn(
                    "min-h-10 gap-2 px-2.5 py-2 pe-8",
                    project === "all" && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <FolderKanban className="size-4" />
                  </span>
                  <span className="truncate">All Projects</span>
                </DropdownMenuRadioItem>

                {filteredProjects.length > 0 ? (
                  filteredProjects.map((item) => (
                    <DropdownMenuRadioItem
                      key={item.id}
                      value={item.id}
                      className={cn(
                        "min-h-10 gap-2 px-2.5 py-2 pe-8",
                        project === item.id && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <HardHat className="size-4" />
                      </span>
                      <span className="truncate">{item.name}</span>
                    </DropdownMenuRadioItem>
                  ))
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {t.projects.noProjectsFound}
                  </p>
                )}
              </DropdownMenuRadioGroup>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-3" aria-label="Main navigation">
        <SectionLabel>{t.nav.modules}</SectionLabel>
        {moduleItems.map((item) => (
          <NavLink
            key={item.href}
            label={item.label}
            href={item.href}
            icon={item.icon}
            active={
              item.href === homeHref
                ? homeHref === "/memberhomepage"
                  ? pathname === "/memberhomepage" || pathname === "/"
                  : pathname === "/"
                : item.href.split("?", 1)[0] === "/projects"
                  ? pathname === "/projects" || pathname === "/projects/new"
                  : contextProjectId && item.href.split("?", 1)[0] === `/projects/${contextProjectId}`
                    ? pathname === `/projects/${contextProjectId}` || pathname.startsWith(`/projects/${contextProjectId}/gallery`)
                    : pathname.startsWith(item.href.split("?", 1)[0])
            }
            onNavigate={onNavigate}
          />
        ))}

        {!hideAdministration ? (
          <div className="pt-4">
            <SectionLabel>{t.nav.administration}</SectionLabel>
            {adminItems.map((item) => (
              <NavLink
                key={item.href}
                label={item.label}
                href={item.href}
                icon={item.icon}
                active={pathname.startsWith(item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <button
          type="button"
          onClick={() => {
            void signOut()
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-5 shrink-0 flip-rtl" />
          <span>{t.nav.logOut}</span>
        </button>
      </div>
    </aside>
  )
}

