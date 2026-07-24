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
import { useState } from "react"
import { portfolioProjects } from "@/lib/portfolio-data"

const moduleItems = [
  { label: "Dashboard", href: "/", icon: Home },
  { label: "NCR", href: "/ncrs", icon: TriangleAlert },
  { label: "Inspections", href: "/inspections", icon: ClipboardCheck },
  { label: "RFI", href: "/rfi", icon: CircleHelp },
  { label: "VO", href: "/vo", icon: FileText },
  { label: "Documents", href: "/documents", icon: Files },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
] as const

const adminItems = [
  { label: "Users & Roles", href: "/users", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
] as const

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

export function AppSidebar() {
  const pathname = usePathname()
  const [project, setProject] = useState("all")

  const activeProjectLabel =
    project === "all" ? "All Projects" : portfolioProjects.find((p) => p.id === project)?.name ?? "All Projects"

  return (
    <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-20 items-center px-5">
        <Logo />
      </div>

      <div className="px-4 pb-2">
        <SectionLabel>Projects</SectionLabel>
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
            <DropdownMenuRadioGroup value={project} onValueChange={(v) => v && setProject(v)}>
              <DropdownMenuRadioItem value="all">All Projects</DropdownMenuRadioItem>
              {portfolioProjects.map((p) => (
                <DropdownMenuRadioItem key={p.id} value={p.id}>
                  {p.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-3" aria-label="Main navigation">
        <SectionLabel>Modules</SectionLabel>
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
          <SectionLabel>Administration</SectionLabel>
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
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  )
}
