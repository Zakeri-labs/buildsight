export const OWNER_ID_CARD_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export const OWNER_ID_CARD_ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf"] as const
export const OWNER_ID_CARD_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/octet-stream",
] as const
export const OWNER_ID_CARD_ACCEPT = OWNER_ID_CARD_ALLOWED_EXTENSIONS
  .map((extension) => `.${extension}`)
  .join(",")

const allowedExtensions = new Set<string>(OWNER_ID_CARD_ALLOWED_EXTENSIONS)
const allowedMimeTypes = new Set<string>(OWNER_ID_CARD_ALLOWED_MIME_TYPES)

export function validateOwnerIdCardFile(file: {
  name: string
  size: number
  type?: string
}): string | null {
  const filename = file.name.trim()
  if (!filename) return "The selected owner ID card does not have a valid filename."
  if (file.size <= 0) return `${filename} is empty.`
  if (file.size > OWNER_ID_CARD_MAX_FILE_SIZE_BYTES) {
    return `${filename} exceeds the 10 MB owner ID card limit.`
  }

  const extension = filename.split(".").pop()?.toLowerCase() ?? ""
  if (!allowedExtensions.has(extension)) {
    return `${filename} must be a JPG, PNG, WebP, or PDF file.`
  }

  const mimeType = file.type?.trim().toLowerCase() || ""
  if (mimeType && !allowedMimeTypes.has(mimeType)) {
    return `${filename} has an unsupported owner ID card format.`
  }

  return null
}

export function isImageIdCard(mimeType: string | null | undefined, filename: string | null | undefined): boolean {
  const mime = mimeType?.trim().toLowerCase()
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return true
  if (mime === "application/pdf") return false
  const ext = filename?.trim().split(".").pop()?.toLowerCase()
  if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp") return true
  return false
}

export function ownerIdCardDisplayUrl(storagePath: string | null | undefined): string | undefined {
  const trimmed = storagePath?.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith("/api/document-images?")) return trimmed
  return `/api/document-images?path=${encodeURIComponent(trimmed)}`
}
