import { ProjectCreateContent } from "@/components/projects/project-create-content"
import { ProjectCreateModal } from "@/components/projects/project-create-modal"

export default function NewProjectModalPage() {
  return (
    <ProjectCreateModal>
      <ProjectCreateContent />
    </ProjectCreateModal>
  )
}
