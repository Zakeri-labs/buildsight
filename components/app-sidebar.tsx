"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  TriangleAlert,
  ClipboardCheck,
  CircleHelp,
  FileText,
  Files,
  BarChart3,
  CalendarDays,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  FolderKanban,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { signOut } from "@/lib/actions/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { selectProject } from "@/lib/actions/project-scope"
import type { ProjectOption } from "@/components/app-shell"
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
}: {
  projects: ProjectOption[]
  selectedProjectId: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useI18n()
  const [project, setProject] = useState(selectedProjectId)
  const [, startTransition] = useTransition()

  const moduleItems = [
    { label: t.nav.dashboard, href: "/", icon: Home },
    { label: t.ncrs.title, href: "/ncrs", icon: TriangleAlert },
    { label: t.nav.inspections, href: "/inspections", icon: ClipboardCheck },
    { label: "RFI", href: "/rfi", icon: CircleHelp },
    { label: "VO", href: "/vo", icon: FileText },
    { label: t.nav.documents, href: "/documents", icon: Files },
    { label: t.nav.reports, href: "/reports", icon: BarChart3 },
    { label: t.nav.calendar, href: "/calendar", icon: CalendarDays },
  ]

  const adminItems = [
    { label: t.settings.tabAccess, href: "/users", icon: Users },
    { label: t.nav.settings, href: "/settings", icon: Settings },
  ]

  const activeProjectLabel =
    project === "all" ? t.projects.allStatuses : projects.find((p) => p.id === project)?.name ?? t.projects.title

  function handleSelect(value: string) {
    if (!value || value === project) return
    setProject(value)
    startTransition(async () => {
      await selectProject(value)
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
              >
                <FolderKanban className="size-4 shrink-0 text-sidebar-foreground/60" />
                <span className="flex-1 truncate text-start">{activeProjectLabel}</span>
                <ChevronDown className="size-4 shrink-0 text-sidebar-foreground/60" />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuRadioGroup value={project} onValueChange={handleSelect}>
              <DropdownMenuRadioItem value="all">{t.projects.allStatuses}</DropdownMenuRadioItem>
              {projects.map((p) => (
                <DropdownMenuRadioItem key={p.id} value={p.id}>
                  {p.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
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
            active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
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

