import { slugify } from "./validation"
import type { DesignStatus } from "./types"

/** Which form field a Postgres unique violation belongs to, if any. */
export function uniqueViolationField(error: { code?: string; message?: string } | null | undefined): "slug" | "code" | null {
  if (!error || error.code !== "23505") return null
  const message = error.message ?? ""
  if (message.includes("designs_org_slug_unique")) return "slug"
  if (message.includes("designs_org_code_unique")) return "code"
  return null
}

/** A design can go public only with a cover image. Drafts and archive are always allowed. */
export function canChangeStatus(target: DesignStatus, imageCount: number): "ok" | "needsImage" {
  if (target === "published" && imageCount < 1) return "needsImage"
  return "ok"
}

/** Candidate public slugs for a new organization gallery: name-based, then numbered, then id-based. */
export function siteSlugCandidates(organizationName: string, organizationId: string): string[] {
  const base = slugify(organizationName).slice(0, 40).replace(/-+$/g, "")
  const fallback = `org-${organizationId.replace(/-/g, "").slice(0, 8).toLowerCase()}`
  if (!base) return [fallback]
  return [base, `${base}-2`, `${base}-3`, fallback]
}

/** The database refused because a published design must keep at least one image (079 triggers). */
export function isNeedsImageError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message?.includes("design_needs_image"))
}

/** replace_design_image_order refused the list (stale or tampered), as opposed to a database failure. */
export function isImageOrderMismatch(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message?.includes("exactly once"))
}
