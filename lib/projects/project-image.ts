export const PROJECT_IMAGE_BUCKET = "project-images"
export const PROJECT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp"
export const PROJECT_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024

const ALLOWED_PROJECT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

type ProjectImageLike = {
  name: string
  size: number
  type: string
}

export function validateProjectImageFile(file: ProjectImageLike): string | null {
  if (!file.name.trim()) return "The project image must have a valid filename."
  if (file.size <= 0) return "The selected project image is empty."
  if (file.size > PROJECT_IMAGE_MAX_SIZE_BYTES) return "Project image must be 10 MB or smaller."
  if (!ALLOWED_PROJECT_IMAGE_TYPES.has(file.type)) {
    return "Project image must be a JPG, PNG, or WebP file."
  }
  return null
}

export function isAllowedProjectImageType(value: string): boolean {
  return ALLOWED_PROJECT_IMAGE_TYPES.has(value.toLowerCase())
}

export function projectImageStoragePath(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith("/api/project-images?")) return null
  try {
    return new URL(value, "https://buildsight.local").searchParams.get("path")
  } catch {
    return null
  }
}

export function projectImageDisplayUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === "/placeholder.svg" || trimmed === "/placeholder.jpg") return null
  return trimmed
}
