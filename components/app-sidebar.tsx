"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutGrid,
  FolderKanban,
  ClipboardCheck,
  AlertCircle,
  BarChart3,
  FileText,
  Users,
  Settings,
  ChevronsLeft,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { Logo } from "@/components/logo"
import { signOut } from "@/lib/actions/auth"

const navItems = [
  { key: "dashboard", href: "/", icon: LayoutGrid },
  { key: "projects", href: "/projects", icon: FolderKanban },
  { key: "inspections", href: "/inspections", icon: ClipboardCheck },
  { key: "ncrs", href: "/ncrs", icon: AlertCircle },
  { key: "reports", href: "/reports", icon: BarChart3 },
  { key: "documents", href: "/documents", icon: FileText },
  { key: "team", href: "/team", icon: Users },
  { key: "settings", href: "/settings", icon: Settings },
] as const

const adminItems = [{ key: "users", href: "/users", icon: Users, label: "Users & Roles" }] as const

export function AppSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const pathname = usePathname()
  const { t } = useI18n()

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center px-4", collapsed && "justify-center px-0")}>
        <Logo showText={!collapsed} />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label="Main navigation">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              title={collapsed ? t.nav[item.key] : undefined}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && <span>{t.nav[item.key]}</span>}
            </Link>
          )
        })}

        {!collapsed && (
          <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">
            Administration
          </p>
        )}
        {adminItems.map((item) => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={() => {
            void signOut()
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-0",
          )}
          title={collapsed ? "Log Out" : undefined}
        >
          <LogOut className="size-5 shrink-0 flip-rtl" />
          {!collapsed && <span>Log Out</span>}
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Toggle sidebar"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <ChevronsLeft className={cn("size-5 shrink-0 flip-rtl transition-transform", collapsed && "rotate-180")} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
