import { FileText } from "lucide-react"
import { ModulePlaceholder } from "@/components/module-placeholder"

export default function VoPage() {
  return (
    <ModulePlaceholder
      icon={FileText}
      title="Variation Orders"
      description="Manage variation orders and change requests for your projects."
    />
  )
}
