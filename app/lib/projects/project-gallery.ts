import { projectImageDisplayUrl, projectImageStoragePath } from "@/lib/projects/project-image"

export type ProjectGalleryImage = {
  id: string
  projectId: string
  storagePath: string
  imageUrl: string
  orderIndex: number
  createdAt: string
  isCover: boolean
  legacy?: boolean
}

export type ProjectGalleryRow = {
  id: string
  project_id: string
  storage_path: string
  order_index: number
  created_at: string
}

export function toProjectGalleryImage(
  row: ProjectGalleryRow,
  projectId: string,
): ProjectGalleryImage | null {
  const storagePath = projectImageStoragePath(row.storage_path, projectId)
  const imageUrl = projectImageDisplayUrl(row.storage_path, projectId)
  if (!storagePath || !imageUrl) return null

  return {
    id: row.id,
    projectId,
    storagePath,
    imageUrl,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    isCover: row.order_index === 0,
  }
}

export function legacyProjectGalleryImage(
  projectId: string,
  value: string | null | undefined,
): ProjectGalleryImage | null {
  const imageUrl = projectImageDisplayUrl(value, projectId)
  if (!imageUrl) return null

  return {
    id: `legacy-${projectId}`,
    projectId,
    storagePath: projectImageStoragePath(value, projectId) ?? value!.trim(),
    imageUrl,
    orderIndex: 0,
    createdAt: "",
    isCover: true,
    legacy: true,
  }
}
