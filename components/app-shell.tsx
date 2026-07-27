import { AppSidebar } from "@/components/app-sidebar"
import { AppTopbar } from "@/components/app-topbar"

export type ProjectOption = { id: string; name: string }

export function AppShell({
  children,
  projects,
  selectedProjectId,
  canManageStages,
}: {
  children: React.ReactNode
  projects: ProjectOption[]
  selectedProjectId: string
  canManageStages: boolean
}) {
  const activeProjectName =
    selectedProjectId === "all" ? null : projects.find((project) => project.id === selectedProjectId)?.name ?? null

  return (
    <div className="flex min-h-dvh bg-background">
      <AppSidebar projects={projects} selectedProjectId={selectedProjectId} canManageStages={canManageStages} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar activeProjectName={activeProjectName} />
        <main className="flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
      </div>
    </div>
  )
}
