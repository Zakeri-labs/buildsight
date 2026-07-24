import { Calendar } from "lucide-react"
import { ModulePlaceholder } from "@/components/module-placeholder"

export default function CalendarPage() {
  return (
    <ModulePlaceholder
      icon={Calendar}
      title="Calendar"
      description="View inspections, deadlines, and project milestones on a shared calendar."
    />
  )
}
