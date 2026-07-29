import { createAdminClient } from "@/lib/supabase/admin"
import {
  legacyProjectGalleryImage,
  toProjectGalleryImage,
  type ProjectGalleryImage,
  type ProjectGalleryRow,
} from "@/lib/projects/project-gallery"

export async function getProjectGallery(
  projectId: string,
  legacyCover?: string | null,
): Promise<ProjectGalleryImage[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("project_images")
    .select("id, project_id, storage_path, order_index, created_at")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) throw error

  const images = ((data ?? []) as ProjectGalleryRow[])
    .map((row) => toProjectGalleryImage(row, projectId))
    .filter((image): image is ProjectGalleryImage => Boolean(image))

  if (images.length > 0) {
    return images.map((image, index) => ({ ...image, orderIndex: index, isCover: index === 0 }))
  }

  const legacy = legacyProjectGalleryImage(projectId, legacyCover)
  return legacy ? [legacy] : []
}
