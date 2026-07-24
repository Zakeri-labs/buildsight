import { DateRangePill } from "@/components/dashboard/date-range-pill"
import { PortfolioKpis } from "@/components/dashboard/portfolio-kpis"
import { StatusDonutCard } from "@/components/dashboard/status-donut-card"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { ProjectsOverview } from "@/components/dashboard/projects-overview"
import { MyTasks } from "@/components/dashboard/my-tasks"
import { ncrStatusSlices, inspectionStatusSlices } from "@/lib/portfolio-data"

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <DateRangePill />
      </div>

      <PortfolioKpis />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StatusDonutCard title="NCR Status" slices={ncrStatusSlices} href="/ncrs" linkLabel="View all NCRs" />
        <StatusDonutCard
          title="Inspections Status"
          slices={inspectionStatusSlices}
          href="/inspections"
          linkLabel="View all Inspections"
        />
        <ActivityFeed />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProjectsOverview />
        </div>
        <MyTasks />
      </div>
    </div>
  )
}
