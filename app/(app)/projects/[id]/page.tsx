import { notFound } from "next/navigation"
import { ProjectDetail } from "@/components/projects/project-detail"
import { projects } from "@/lib/mock-data"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = projects.find((p) => p.id === id)
  if (!project) notFound()
  return <ProjectDetail project={project} />
}
