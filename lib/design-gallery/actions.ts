"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { audit, AuthzError } from "@/lib/auth/guards"
import {
  detectProjectImageMimeType,
  isAllowedProjectImageType,
  PROJECT_IMAGE_MAX_SIZE_BYTES,
} from "@/lib/projects/project-image"
import { DESIGN_GALLERY_BUCKET, designImageStoragePath, isDesignImagePathFor } from "./images"
import { canChangeStatus, isImageOrderMismatch, isNeedsImageError, siteSlugCandidates, uniqueViolationField } from "./rules"
import { loadCategories, loadDesign, loadSite, requireDesignGalleryAdmin, type DesignGalleryAdminContext } from "./server"
import { DESIGN_STATUSES, type Design, type DesignImage, type DesignInput, type DesignStatus } from "./types"
import { isUuid, validateDesignInput, validateSiteInput, type DesignFieldError } from "./validation"

// All writes to the design gallery go through these actions: the database
// grants no write access to API users (see 079_design_gallery.sql). Every
// action authorizes itself with requireDesignGalleryAdmin(), takes the
// organization from the session (never from the client), and scopes every
// query to that organization.

export type DesignGalleryActionError =
  | "forbidden"
  | "notFound"
  | "invalid"
  | "stale"
  | "needsImage"
  | "invalidImage"
  | "uploadFailed"
  | "failed"

export type DesignGalleryActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: DesignGalleryActionError; fieldErrors?: Record<string, DesignFieldError> }

type ImagesResult = DesignGalleryActionResult<{ images: DesignImage[] }>

const ADMIN_PATH = "/design-gallery"

function fail(error: unknown): { ok: false; error: DesignGalleryActionError } {
  unstable_rethrow(error) // let Next.js redirects (e.g. signed out → login) through
  if (error instanceof AuthzError) return { ok: false, error: "forbidden" }
  console.error("design gallery action failed:", error instanceof Error ? error.message : error)
  return { ok: false, error: "failed" }
}

function refresh(designId?: string) {
  revalidatePath(ADMIN_PATH)
  if (designId) revalidatePath(`${ADMIN_PATH}/${designId}`)
  revalidatePath("/designs", "layout")
}

async function findDesign(ctx: DesignGalleryAdminContext, designId: unknown): Promise<Design | null> {
  if (!isUuid(designId)) return null
  return loadDesign(ctx.admin, ctx.org.id, designId)
}

async function currentImages(ctx: DesignGalleryAdminContext, designId: string): Promise<DesignImage[]> {
  return (await loadDesign(ctx.admin, ctx.org.id, designId))?.images ?? []
}

/**
 * Removes files from the bucket. supabase-js reports failures in the result
 * instead of throwing, so check it; a failure is logged with the paths so the
 * files can be cleaned up, and never undoes the database change already made.
 */
async function removeFiles(ctx: DesignGalleryAdminContext, paths: string[]) {
  if (!paths.length) return
  try {
    const { error } = await ctx.admin.storage.from(DESIGN_GALLERY_BUCKET).remove(paths)
    if (error) console.error("design gallery: could not remove files", paths, error.message)
  } catch (error) {
    console.error("design gallery: could not remove files", paths, error instanceof Error ? error.message : error)
  }
}

function toRow(input: DesignInput) {
  return {
    category_id: input.categoryId,
    slug: input.slug,
    code: input.code,
    title_ar: input.titleAr,
    title_en: input.titleEn,
    summary_ar: input.summaryAr,
    summary_en: input.summaryEn,
    description_ar: input.descriptionAr,
    description_en: input.descriptionEn,
    floors_ar: input.floorsAr,
    floors_en: input.floorsEn,
    built_area_sqm: input.builtAreaSqm,
    bedrooms: input.bedrooms,
    service_ar: input.serviceAr,
    service_en: input.serviceEn,
    is_bookable: input.isBookable,
    sort_order: input.sortOrder,
  }
}

/** Turns the gallery on for the caller's organization: site row (disabled) + default categories. */
export async function activateDesignGallery(): Promise<DesignGalleryActionResult<{ slug: string }>> {
  try {
    const ctx = await requireDesignGalleryAdmin()
    const existing = await loadSite(ctx.admin, ctx.org.id)
    if (existing) return { ok: true, data: { slug: existing.slug } }

    for (const slug of siteSlugCandidates(ctx.org.name, ctx.org.id)) {
      const { error } = await ctx.admin.rpc("provision_design_gallery", {
        p_organization_id: ctx.org.id,
        p_slug: slug,
        p_display_name_ar: null,
        p_display_name_en: ctx.org.name,
      })
      if (!error) {
        await audit({
          actorId: ctx.userId,
          action: "design_gallery.activated",
          entityType: "design_gallery_site",
          entityId: ctx.org.id,
          organizationId: ctx.org.id,
          metadata: { slug },
        }).catch(() => undefined)
        refresh()
        return { ok: true, data: { slug } }
      }
      if (error.code !== "23505") throw error
    }
    return { ok: false, error: "failed" }
  } catch (error) {
    return fail(error)
  }
}

export async function saveDesignGallerySite(raw: Record<string, unknown>): Promise<DesignGalleryActionResult> {
  try {
    const ctx = await requireDesignGalleryAdmin()
    const parsed = validateSiteInput(raw)
    if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors as Record<string, DesignFieldError> }

    const { data, error } = await ctx.admin
      .from("design_gallery_sites")
      .update({
        is_enabled: parsed.value.isEnabled,
        display_name_ar: parsed.value.displayNameAr,
        display_name_en: parsed.value.displayNameEn,
        whatsapp_phone: parsed.value.whatsappPhone,
        website_url: parsed.value.websiteUrl,
      })
      .eq("organization_id", ctx.org.id)
      .select("organization_id")
    if (error) throw error
    if (!data?.length) return { ok: false, error: "notFound" }

    await audit({
      actorId: ctx.userId,
      action: "design_gallery.site_updated",
      entityType: "design_gallery_site",
      entityId: ctx.org.id,
      organizationId: ctx.org.id,
      metadata: { isEnabled: parsed.value.isEnabled },
    }).catch(() => undefined)
    refresh()
    return { ok: true, data: undefined }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Creates (designId null) or updates a design. New designs start as drafts.
 * Updates must send `expectedUpdatedAt` (the version the form was loaded
 * with); if someone saved in between, nothing is written and "stale" comes back.
 */
export async function saveDesign(
  designId: string | null,
  raw: Record<string, unknown>,
): Promise<DesignGalleryActionResult<{ id: string; updatedAt: string }>> {
  try {
    const ctx = await requireDesignGalleryAdmin()
    if (designId !== null && !(await findDesign(ctx, designId))) return { ok: false, error: "notFound" }
    const expectedUpdatedAt = typeof raw.expectedUpdatedAt === "string" ? raw.expectedUpdatedAt : ""
    if (designId !== null && !expectedUpdatedAt) return { ok: false, error: "stale" }

    const categories = await loadCategories(ctx.admin, ctx.org.id)
    const parsed = validateDesignInput(raw, categories.map((c) => c.id))
    if (!parsed.ok) return { ok: false, error: "invalid", fieldErrors: parsed.errors as Record<string, DesignFieldError> }

    const row = { ...toRow(parsed.value), updated_by: ctx.userId }
    const { data, error } = designId
      ? await ctx.admin
          .from("designs")
          .update(row)
          .eq("organization_id", ctx.org.id)
          .eq("id", designId)
          .eq("updated_at", expectedUpdatedAt)
          .select("id, updated_at")
      : await ctx.admin
          .from("designs")
          .insert({ ...row, organization_id: ctx.org.id, status: "draft", created_by: ctx.userId })
          .select("id, updated_at")
    const taken = uniqueViolationField(error)
    if (taken) return { ok: false, error: "invalid", fieldErrors: { [taken]: "taken" } }
    if (error) throw error
    const saved = Array.isArray(data) ? data[0] : null
    if (!saved) return { ok: false, error: designId ? "stale" : "failed" }

    await audit({
      actorId: ctx.userId,
      action: designId ? "design_gallery.design_updated" : "design_gallery.design_created",
      entityType: "design",
      entityId: saved.id,
      organizationId: ctx.org.id,
      metadata: { slug: parsed.value.slug, code: parsed.value.code },
    }).catch(() => undefined)
    refresh(saved.id)
    return { ok: true, data: { id: saved.id, updatedAt: saved.updated_at } }
  } catch (error) {
    return fail(error)
  }
}

export async function setDesignStatus(
  designId: string,
  status: DesignStatus,
): Promise<DesignGalleryActionResult<{ updatedAt: string }>> {
  try {
    const ctx = await requireDesignGalleryAdmin()
    if (!DESIGN_STATUSES.includes(status)) return { ok: false, error: "invalid" }
    const design = await findDesign(ctx, designId)
    if (!design) return { ok: false, error: "notFound" }
    if (canChangeStatus(status, design.images.length) === "needsImage") return { ok: false, error: "needsImage" }

    const { data, error } = await ctx.admin
      .from("designs")
      .update({
        status,
        published_at: status === "published" ? design.publishedAt ?? new Date().toISOString() : design.publishedAt,
        updated_by: ctx.userId,
      })
      .eq("organization_id", ctx.org.id)
      .eq("id", design.id)
      .select("updated_at")
    // The database re-checks the image rule under a row lock (an image may have been removed meanwhile).
    if (isNeedsImageError(error)) return { ok: false, error: "needsImage" }
    if (error) throw error

    await audit({
      actorId: ctx.userId,
      action: "design_gallery.design_status_changed",
      entityType: "design",
      entityId: design.id,
      organizationId: ctx.org.id,
      metadata: { from: design.status, to: status },
    }).catch(() => undefined)
    refresh(design.id)
    const updatedAt = Array.isArray(data) && data[0]?.updated_at ? String(data[0].updated_at) : design.updatedAt
    return { ok: true, data: { updatedAt } }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteDesign(designId: string): Promise<DesignGalleryActionResult> {
  try {
    const ctx = await requireDesignGalleryAdmin()
    const design = await findDesign(ctx, designId)
    if (!design) return { ok: false, error: "notFound" }

    const { error } = await ctx.admin.from("designs").delete().eq("organization_id", ctx.org.id).eq("id", design.id)
    if (error) throw error

    // Everything in the design's own folder, including uploads that were never finalized.
    const folder = `${ctx.org.id}/${design.id}`
    const { data: files } = await ctx.admin.storage.from(DESIGN_GALLERY_BUCKET).list(folder, { limit: 1000 })
    const paths = (files ?? [])
      .map((file: { name: string }) => `${folder}/${file.name}`)
      .filter((path: string) => isDesignImagePathFor(path, ctx.org.id, design.id))
    await removeFiles(ctx, paths)

    await audit({
      actorId: ctx.userId,
      action: "design_gallery.design_deleted",
      entityType: "design",
      entityId: design.id,
      organizationId: ctx.org.id,
      metadata: { slug: design.slug, code: design.code },
    }).catch(() => undefined)
    refresh()
    return { ok: true, data: undefined }
  } catch (error) {
    return fail(error)
  }
}

/** Step 1 of an image upload: returns a one-time signed upload token for a server-chosen path. */
export async function prepareDesignImageUpload(
  designId: string,
  file: { name: string; size: number; type: string },
): Promise<DesignGalleryActionResult<{ storagePath: string; token: string }>> {
  try {
    const ctx = await requireDesignGalleryAdmin()
    const design = await findDesign(ctx, designId)
    if (!design) return { ok: false, error: "notFound" }
    const type = String(file?.type ?? "").toLowerCase()
    const size = Number(file?.size ?? 0)
    if (!isAllowedProjectImageType(type) || !(size > 0) || size > PROJECT_IMAGE_MAX_SIZE_BYTES) {
      return { ok: false, error: "invalidImage" }
    }

    const storagePath = designImageStoragePath(ctx.org.id, design.id, randomUUID(), type)
    const { data, error } = await ctx.admin.storage.from(DESIGN_GALLERY_BUCKET).createSignedUploadUrl(storagePath)
    if (error || !data?.token) return { ok: false, error: "uploadFailed" }
    return { ok: true, data: { storagePath, token: data.token } }
  } catch (error) {
    return fail(error)
  }
}

/** Step 2: checks the uploaded bytes really are an allowed image, then adds it at the end. */
export async function finalizeDesignImageUpload(designId: string, storagePath: string): Promise<ImagesResult> {
  try {
    const ctx = await requireDesignGalleryAdmin()
    const design = await findDesign(ctx, designId)
    if (!design) return { ok: false, error: "notFound" }
    if (typeof storagePath !== "string" || !isDesignImagePathFor(storagePath, ctx.org.id, design.id)) {
      return { ok: false, error: "invalidImage" }
    }
    if (design.images.some((image) => image.storagePath === storagePath)) {
      return { ok: true, data: { images: design.images } }
    }

    const { data: file, error: downloadError } = await ctx.admin.storage.from(DESIGN_GALLERY_BUCKET).download(storagePath)
    if (downloadError || !file) return { ok: false, error: "uploadFailed" }

    const detected = detectProjectImageMimeType(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
    if (!detected || !isAllowedProjectImageType(detected) || file.size <= 0 || file.size > PROJECT_IMAGE_MAX_SIZE_BYTES) {
      await removeFiles(ctx, [storagePath])
      return { ok: false, error: "invalidImage" }
    }

    // Appends under a lock on the design row; a repeated path returns the existing image.
    const { error } = await ctx.admin.rpc("append_design_image", {
      p_organization_id: ctx.org.id,
      p_design_id: design.id,
      p_storage_path: storagePath,
    })
    if (error) {
      await removeFiles(ctx, [storagePath])
      if (error.message?.includes("design not found")) return { ok: false, error: "notFound" }
      throw error
    }

    await audit({
      actorId: ctx.userId,
      action: "design_gallery.image_uploaded",
      entityType: "design",
      entityId: design.id,
      organizationId: ctx.org.id,
      metadata: { storagePath, size: file.size, contentType: detected },
    }).catch(() => undefined)
    refresh(design.id)
    return { ok: true, data: { images: await currentImages(ctx, design.id) } }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteDesignImage(designId: string, imageId: string): Promise<ImagesResult> {
  try {
    const ctx = await requireDesignGalleryAdmin()
    const design = await findDesign(ctx, designId)
    const image = design?.images.find((i) => i.id === imageId)
    if (!design || !image) return { ok: false, error: "notFound" }
    if (design.status === "published" && design.images.length === 1) return { ok: false, error: "needsImage" }

    const { error } = await ctx.admin
      .from("design_images")
      .delete()
      .eq("organization_id", ctx.org.id)
      .eq("design_id", design.id)
      .eq("id", image.id)
    // The database re-checks under a row lock, in case another image was removed at the same time.
    if (isNeedsImageError(error)) return { ok: false, error: "needsImage" }
    if (error) throw error
    if (isDesignImagePathFor(image.storagePath, ctx.org.id, design.id)) await removeFiles(ctx, [image.storagePath])

    await audit({
      actorId: ctx.userId,
      action: "design_gallery.image_removed",
      entityType: "design",
      entityId: design.id,
      organizationId: ctx.org.id,
      metadata: { storagePath: image.storagePath },
    }).catch(() => undefined)
    refresh(design.id)
    return { ok: true, data: { images: await currentImages(ctx, design.id) } }
  } catch (error) {
    return fail(error)
  }
}

/** Saves a new image order; the first image becomes the cover. */
export async function reorderDesignImages(designId: string, imageIds: string[]): Promise<ImagesResult> {
  try {
    const ctx = await requireDesignGalleryAdmin()
    const design = await findDesign(ctx, designId)
    if (!design) return { ok: false, error: "notFound" }
    if (!Array.isArray(imageIds) || !imageIds.every(isUuid)) return { ok: false, error: "invalid" }

    const { error } = await ctx.admin.rpc("replace_design_image_order", {
      p_design_id: design.id,
      p_image_ids: imageIds,
    })
    // A list that no longer matches the images (someone else changed them) is "stale", not a failure.
    if (isImageOrderMismatch(error)) return { ok: false, error: "stale" }
    if (error) throw error
    refresh(design.id)
    return { ok: true, data: { images: await currentImages(ctx, design.id) } }
  } catch (error) {
    return fail(error)
  }
}
