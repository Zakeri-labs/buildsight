import { AppSidebar } from "@/components/app-sidebar"
import { Suspense } from "react"
import { AppTopbar } from "@/components/app-topbar"
import { NavigationProgress } from "@/components/loading/navigation-progress"
import type { ReviewSubmissionFeed } from "@/lib/review-submissions/types"

export type ProjectOption = { id: string; name: string }

export function AppShell({
  children,
  projects,
  selectedProjectId,
  canManageStages,
  reviewFeed,
}: {
  children: React.ReactNode
  projects: ProjectOption[]
  selectedProjectId: string
  canManageStages: boolean
  reviewFeed: ReviewSubmissionFeed
}) {
  const activeProjectName =
    selectedProjectId === "all" ? null : projects.find((project) => project.id === selectedProjectId)?.name ?? null

  return (
    <div className="flex min-h-dvh bg-background">
      <Suspense fallback={null}><NavigationProgress /></Suspense>
      <AppSidebar projects={projects} selectedProjectId={selectedProjectId} canManageStages={canManageStages} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar activeProjectName={activeProjectName} reviewFeed={reviewFeed} />
        <main className="flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
      </div>
    </div>
  )
}
