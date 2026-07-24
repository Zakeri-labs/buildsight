import { AppSidebar } from "@/components/app-sidebar"
import { AppTopbar } from "@/components/app-topbar"

export type ProjectOption = { id: string; name: string }

export function AppShell({
  children,
  projects,
  selectedProjectId,
}: {
  children: React.ReactNode
  projects: ProjectOption[]
  selectedProjectId: string
}) {
  return (
    <div className="flex min-h-dvh bg-background">
      <AppSidebar projects={projects} selectedProjectId={selectedProjectId} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <main className="flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
      </div>
    </div>
  )
}
