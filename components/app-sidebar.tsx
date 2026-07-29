"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Files,
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
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { selectProject } from "@/lib/actions/project-scope"
import type { ProjectOption } from "@/components/app-shell"
import { NAVIGATION_START_EVENT } from "@/components/loading/navigation-progress"
import { useI18n } from "@/lib/i18n"

function NavLink({
  label,
  href,
  icon: Icon,
  active,
}: {
  label: string
  href: string
  icon: React.ElementType
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
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
}: {
  projects: ProjectOption[]
  selectedProjectId: string
  canManageStages: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { t, locale } = useI18n()
  const [project, setProject] = useState(selectedProjectId)
  const [projectSearch, setProjectSearch] = useState("")
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [, startTransition] = useTransition()

  const routeProjectMatch = pathname.match(/^\/projects\/([^/]+)(?:\/|$)/)
  const routeProjectId = routeProjectMatch?.[1] && routeProjectMatch[1] !== "new"
    ? decodeURIComponent(routeProjectMatch[1])
    : null
  const contextProjectId = routeProjectId ?? (project !== "all" ? project : null)

  const stageNavigationItem = contextProjectId
    ? {
        label: locale === "ar" ? "المراحل" : "Stages",
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

  const moduleItems = [
    { label: t.nav.dashboard, href: "/", icon: Home },
    { label: t.projects.title, href: "/projects", icon: FolderKanban },
    ...(stageNavigationItem ? [stageNavigationItem] : []),
    { label: t.nav.documents, href: "/documents", icon: Files },
    ...(contextProjectId ? [{ label: t.nav.aiSummary, href: "/ai-summary", icon: Sparkles }] : []),
    { label: t.nav.calendar, href: "/calendar", icon: CalendarDays },
  ]

  const adminItems = [
    { label: t.settings.tabAccess, href: "/users", icon: Users },
    { label: t.nav.settings, href: "/settings", icon: Settings },
  ]

  const allProjectsLabel = t.projects.allProjects
  const activeProject = projects.find((p) => p.id === project)
  const activeProjectLabel = project === "all" ? allProjectsLabel : activeProject?.name ?? t.projects.title
  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLocaleLowerCase(locale)
    if (!query) return projects
    return projects.filter((item) => item.name.toLocaleLowerCase(locale).includes(query))
  }, [locale, projectSearch, projects])

  function handleSelect(value: string) {
    if (!value || value === project) return
    setProject(value)
    setProjectMenuOpen(false)
    setProjectSearch("")
    window.dispatchEvent(new Event(NAVIGATION_START_EVENT))
    startTransition(async () => {
      await selectProject(value)
      router.push("/")
      router.refresh()
    })
  }

  return (
    <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-20 items-center px-5">
        <Logo />
      </div>

      <div className="px-4 pb-2">
        <SectionLabel>{t.nav.projects ?? "Projects"}</SectionLabel>
        <DropdownMenu
          open={projectMenuOpen}
          onOpenChange={(open) => {
            setProjectMenuOpen(open)
            if (!open) setProjectSearch("")
          }}
        >
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`${t.nav.projects}: ${activeProjectLabel}`}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors",
                  project === "all"
                    ? "border-sidebar-primary/45 bg-sidebar-primary/15 shadow-sm hover:bg-sidebar-primary/20"
                    : "border-sidebar-border bg-sidebar-accent/40 hover:bg-sidebar-accent",
                )}
              >
                {project === "all" ? (
                  <Building2 className="size-4 shrink-0 text-sidebar-primary" />
                ) : (
                  <HardHat className="size-4 shrink-0 text-sidebar-foreground/65" />
                )}
                <span className="flex-1 truncate text-start">{activeProjectLabel}</span>
                <ChevronDown className="size-4 shrink-0 text-sidebar-foreground/60" />
              </button>
            }
          />
          <DropdownMenuContent
            align="start"
            className="flex max-h-[min(26rem,var(--available-height))] w-56 max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0"
          >
            <div className="sticky top-0 z-10 border-b bg-popover p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  placeholder={t.projects.projectSearchPlaceholder}
                  aria-label={t.projects.projectSearchPlaceholder}
                  className="h-9 ps-8"
                />
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto p-1.5">
              <DropdownMenuRadioGroup value={project} onValueChange={handleSelect}>
                <DropdownMenuRadioItem
                  value="all"
                  className={cn(
                    "min-h-10 gap-2 px-2.5 py-2 pe-8 font-medium",
                    project === "all" && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Building2 className="size-4" />
                  </span>
                  <span className="truncate">{allProjectsLabel}</span>
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
              item.href === "/"
                ? pathname === "/"
                : item.href === "/projects"
                  ? pathname === "/projects" || pathname === "/projects/new" || /^\/projects\/[^/]+$/.test(pathname)
                  : pathname.startsWith(item.href)
            }
          />
        ))}

        <div className="pt-4">
          <SectionLabel>{t.nav.administration}</SectionLabel>
          {adminItems.map((item) => (
            <NavLink
              key={item.href}
              label={item.label}
              href={item.href}
              icon={item.icon}
              active={pathname.startsWith(item.href)}
            />
          ))}
        </div>
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

