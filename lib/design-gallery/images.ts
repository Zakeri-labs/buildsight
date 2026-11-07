export const DESIGN_GALLERY_BUCKET = "design-gallery"

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const STORAGE_PATH_PATTERN = new RegExp(`^(${UUID})/(${UUID})/(${UUID})\\.(jpg|png|webp)$`, "i")
// Bundled demo images shipped in /public (used by the seed).
const STATIC_PATH_PATTERN = /^\/design-gallery\/samples\/[a-z0-9-]+\/[a-z0-9-]+\.(jpg|png|webp)$/

export function designImageExtension(contentType: string): "jpg" | "png" | "webp" {
  const type = contentType.toLowerCase()
  if (type === "image/png") return "png"
  if (type === "image/webp") return "webp"
  return "jpg"
}

/** `{organizationId}/{designId}/{fileId}.{ext}` inside the design-gallery bucket. */
export function designImageStoragePath(
  organizationId: string,
  designId: string,
  fileId: string,
  contentType: string,
): string {
  return `${organizationId}/${designId}/${fileId}.${designImageExtension(contentType)}`
}

/** True only for an uploaded file that belongs to exactly this organization and design. */
export function isDesignImagePathFor(path: string, organizationId: string, designId: string): boolean {
  const match = STORAGE_PATH_PATTERN.exec(path)
  return Boolean(
    match && match[1].toLowerCase() === organizationId.toLowerCase() && match[2].toLowerCase() === designId.toLowerCase(),
  )
}

/**
 * Public URL for a stored image. Bundled sample paths (starting with "/") are
 * served by the app itself; uploaded files come from the public bucket.
 * Returns null for anything else so an unexpected value is never rendered.
 */
export function designImagePublicUrl(path: string, supabaseUrl: string | undefined): string | null {
  if (STATIC_PATH_PATTERN.test(path)) return path
  if (!STORAGE_PATH_PATTERN.test(path) || !supabaseUrl) return null
  const base = supabaseUrl.replace(/\/+$/, "")
  return `${base}/storage/v1/object/public/${DESIGN_GALLERY_BUCKET}/${path}`
}
