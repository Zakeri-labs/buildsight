import { HelpCircle } from "lucide-react"
import { ModulePlaceholder } from "@/components/module-placeholder"

export default function RfiPage() {
  return (
    <ModulePlaceholder
      icon={HelpCircle}
      title="RFIs"
      description="Track and respond to Requests for Information across all your projects."
    />
  )
}
