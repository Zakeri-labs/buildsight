export const PROJECT_IMAGE_BUCKET = "project-images"
export const PROJECT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp"
export const PROJECT_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024

const ALLOWED_PROJECT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ProjectImageLike = {
  name: string
  size: number
  type: string
}

export function validateProjectImageFile(file: ProjectImageLike): string | null {
  if (!file.name.trim()) return "The project image must have a valid filename."
  if (!Number.isFinite(file.size) || file.size <= 0) return "The selected project image is empty."
  if (file.size > PROJECT_IMAGE_MAX_SIZE_BYTES) return "Project image must be 10 MB or smaller."
  if (!ALLOWED_PROJECT_IMAGE_TYPES.has(file.type.toLowerCase())) {
    return "Project image must be a JPG, PNG, or WebP file."
  }
  return null
}

export function isAllowedProjectImageType(value: string): boolean {
  return ALLOWED_PROJECT_IMAGE_TYPES.has(value.toLowerCase())
}

export function detectProjectImageMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp"
  }
  return null
}

export function projectImageStoragePath(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("/api/project-images?")) {
    try {
      return new URL(trimmed, "https://buildsight.local").searchParams.get("path")
    } catch {
      return null
    }
  }

  const firstSegment = trimmed.split("/")[0] ?? ""
  if (UUID_PATTERN.test(firstSegment) && trimmed.includes("/") && !trimmed.includes("..") && !trimmed.startsWith("/")) {
    return trimmed
  }
  return null
}

export function projectImageDisplayUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === "/placeholder.svg" || trimmed === "/placeholder.jpg") return null
  if (trimmed.startsWith("/api/project-images?")) return trimmed

  const storagePath = projectImageStoragePath(trimmed)
  if (storagePath) return `/api/project-images?path=${encodeURIComponent(storagePath)}`
  return trimmed
}
