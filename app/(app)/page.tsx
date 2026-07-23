import { DashboardHeader } from "@/components/dashboard/page-header"
import { ProjectSummary } from "@/components/dashboard/project-summary"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { ProgressChart } from "@/components/dashboard/progress-chart"
import { PendingInspections } from "@/components/dashboard/pending-inspections"
import { NcrStatus } from "@/components/dashboard/ncr-status"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { LatestPhotos } from "@/components/dashboard/latest-photos"

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader />
      <ProjectSummary />
      <KpiCards />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProgressChart />
        <PendingInspections />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <NcrStatus />
        <RecentActivity />
        <LatestPhotos />
      </div>
    </div>
  )
}
