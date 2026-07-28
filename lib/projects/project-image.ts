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

function validStoragePath(candidate: string | null | undefined): string | null {
  if (!candidate) return null
  let decoded = candidate.trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // Keep the original value when legacy data contains a literal percent sign.
  }

  decoded = decoded.replace(/^\/+/, "")
  if (decoded.startsWith(`${PROJECT_IMAGE_BUCKET}/`)) {
    decoded = decoded.slice(PROJECT_IMAGE_BUCKET.length + 1)
  }

  const firstSegment = decoded.split("/")[0] ?? ""
  if (
    UUID_PATTERN.test(firstSegment) &&
    decoded.includes("/") &&
    !decoded.includes("..") &&
    !decoded.includes("\\")
  ) {
    return decoded
  }
  return null
}

export function projectImageStoragePath(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("/api/project-images?")) {
    try {
      return validStoragePath(new URL(trimmed, "https://buildsight.local").searchParams.get("path"))
    } catch {
      return null
    }
  }

  try {
    const url = new URL(trimmed)
    const pathname = decodeURIComponent(url.pathname)
    if (pathname === "/api/project-images") {
      return validStoragePath(url.searchParams.get("path"))
    }
    const markers = [
      `/storage/v1/object/public/${PROJECT_IMAGE_BUCKET}/`,
      `/storage/v1/object/sign/${PROJECT_IMAGE_BUCKET}/`,
      `/storage/v1/object/authenticated/${PROJECT_IMAGE_BUCKET}/`,
      `/storage/v1/render/image/public/${PROJECT_IMAGE_BUCKET}/`,
      `/storage/v1/render/image/authenticated/${PROJECT_IMAGE_BUCKET}/`,
    ]
    for (const marker of markers) {
      const index = pathname.indexOf(marker)
      if (index >= 0) return validStoragePath(pathname.slice(index + marker.length))
    }
  } catch {
    // Plain Storage paths are handled below.
  }

  return validStoragePath(trimmed)
}

export function projectImageDisplayUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === "/placeholder.svg" || trimmed === "/placeholder.jpg") return null
  if (trimmed.startsWith("/api/project-images?")) return trimmed

  const storagePath = projectImageStoragePath(trimmed)
  if (storagePath) return `/api/project-images?path=${encodeURIComponent(storagePath)}`
  return trimmed
}
