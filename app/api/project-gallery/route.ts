import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { assertProjectAdmin, audit, AuthzError } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  detectProjectImageMimeType,
  isAllowedProjectImageType,
  PROJECT_IMAGE_BUCKET,
  PROJECT_IMAGE_MAX_SIZE_BYTES,
  projectImageDisplayUrl,
  projectImageStoragePath,
  validateProjectImageFile,
} from "@/lib/projects/project-image"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type GalleryAction = "prepare" | "finalize" | "delete" | "reorder" | "set-cover"

type GalleryRequest = {
  action?: GalleryAction
  projectId?: string
  filename?: string
  contentType?: string
  size?: number
  storagePath?: string
  imageId?: string
  imageIds?: string[]
}

type GalleryRow = {
  id: string
  storage_path: string
  order_index: number
  created_at: string
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function safeExtension(contentType: string) {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}

function galleryPayload(projectId: string, rows: GalleryRow[]) {
  return rows.map((row, index) => ({
    id: row.id,
    projectId,
    storagePath: row.storage_path,
    imageUrl: projectImageDisplayUrl(row.storage_path, projectId),
    orderIndex: index,
    createdAt: row.created_at,
    isCover: index === 0,
  }))
}

async function loadGallery(admin: ReturnType<typeof createAdminClient>, projectId: string) {
  const { data, error } = await admin
    .from("project_images")
    .select("id, storage_path, order_index, created_at")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as GalleryRow[]
}

async function applyOrder(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  imageIds: string[],
) {
  const { error } = await admin.rpc("replace_project_gallery_order", {
    p_project_id: projectId,
    p_image_ids: imageIds,
  })
  if (error) throw error
}

async function revalidateGallery(projectId: string) {
  revalidatePath("/", "layout")
  revalidatePath("/projects")
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/gallery`)
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as GalleryRequest | null
    if (!body?.action || !isUuid(body.projectId)) {
      return NextResponse.json({ error: "Invalid project gallery request." }, { status: 400 })
    }

    const actorId = await assertProjectAdmin(body.projectId)
    const admin = createAdminClient()
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, supervising_organization_id")
      .eq("id", body.projectId)
      .maybeSingle()
    if (projectError) throw projectError
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 })

    if (body.action === "prepare") {
      const contentType = String(body.contentType ?? "").toLowerCase()
      const size = Number(body.size ?? 0)
      const filename = String(body.filename ?? "project-gallery-image")
      const validationError = validateProjectImageFile({ name: filename, size, type: contentType })
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

      const storagePath = `${body.projectId}/${actorId}/gallery/${randomUUID()}.${safeExtension(contentType)}`
      const { data, error } = await admin.storage.from(PROJECT_IMAGE_BUCKET).createSignedUploadUrl(storagePath)
      if (error || !data?.token) throw new Error(error?.message || "Unable to prepare gallery image upload.")

      return NextResponse.json({ storagePath, token: data.token }, { headers: { "Cache-Control": "no-store" } })
    }

    if (body.action === "finalize") {
      const storagePath = String(body.storagePath ?? "")
      const expectedPrefix = `${body.projectId}/${actorId}/gallery/`
      if (
        !storagePath.startsWith(expectedPrefix) ||
        storagePath.includes("..") ||
        !projectImageStoragePath(storagePath, body.projectId)
      ) {
        return NextResponse.json({ error: "Invalid uploaded gallery image path." }, { status: 400 })
      }

      const { data: uploadedFile, error: downloadError } = await admin.storage
        .from(PROJECT_IMAGE_BUCKET)
        .download(storagePath)
      if (downloadError || !uploadedFile) {
        await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([storagePath]).catch(() => undefined)
        throw new Error(downloadError?.message || "The uploaded gallery image could not be found in Storage.")
      }

      const bytes = new Uint8Array(await uploadedFile.arrayBuffer())
      const detectedType = detectProjectImageMimeType(bytes)
      if (
        uploadedFile.size <= 0 ||
        uploadedFile.size > PROJECT_IMAGE_MAX_SIZE_BYTES ||
        !detectedType ||
        !isAllowedProjectImageType(detectedType)
      ) {
        await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([storagePath]).catch(() => undefined)
        throw new Error("The uploaded file is not a valid JPG, PNG, or WEBP project image.")
      }

      const rows = await loadGallery(admin, body.projectId)
      const { error: insertError } = await admin.from("project_images").insert({
        project_id: body.projectId,
        storage_path: storagePath,
        created_by: actorId,
        order_index: rows.length,
        updated_at: new Date().toISOString(),
      })
      if (insertError) {
        await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([storagePath]).catch(() => undefined)
        throw insertError
      }

      const updatedRows = await loadGallery(admin, body.projectId)

      await audit({
        actorId,
        action: "project.gallery_image_uploaded",
        entityType: "project_image",
        entityId: updatedRows.find((row) => row.storage_path === storagePath)?.id ?? body.projectId,
        organizationId: project.supervising_organization_id,
        projectId: body.projectId,
        metadata: { storagePath, size: uploadedFile.size, contentType: detectedType },
      }).catch(() => undefined)

      await revalidateGallery(body.projectId)
      return NextResponse.json(
        { images: galleryPayload(body.projectId, updatedRows) },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    const rows = await loadGallery(admin, body.projectId)

    if (body.action === "delete") {
      if (!isUuid(body.imageId)) {
        return NextResponse.json({ error: "Select a valid gallery image." }, { status: 400 })
      }
      const target = rows.find((row) => row.id === body.imageId)
      if (!target) return NextResponse.json({ error: "Gallery image not found." }, { status: 404 })

      const { data: removedPath, error: deleteError } = await admin.rpc("delete_project_gallery_image", {
        p_project_id: body.projectId,
        p_image_id: target.id,
      })
      if (deleteError) throw deleteError

      await admin.storage
        .from(PROJECT_IMAGE_BUCKET)
        .remove([typeof removedPath === "string" ? removedPath : target.storage_path])
        .catch(() => undefined)
      await audit({
        actorId,
        action: "project.gallery_image_removed",
        entityType: "project_image",
        entityId: target.id,
        organizationId: project.supervising_organization_id,
        projectId: body.projectId,
        metadata: { storagePath: target.storage_path },
      }).catch(() => undefined)

      const updatedRows = await loadGallery(admin, body.projectId)
      await revalidateGallery(body.projectId)
      return NextResponse.json(
        { images: galleryPayload(body.projectId, updatedRows) },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    let requestedIds: string[]
    if (body.action === "set-cover") {
      if (!isUuid(body.imageId) || !rows.some((row) => row.id === body.imageId)) {
        return NextResponse.json({ error: "Select a valid cover image." }, { status: 400 })
      }
      requestedIds = [body.imageId, ...rows.filter((row) => row.id !== body.imageId).map((row) => row.id)]
    } else {
      requestedIds = Array.isArray(body.imageIds) ? body.imageIds.filter(isUuid) : []
    }

    await applyOrder(admin, body.projectId, requestedIds)
    const updatedRows = await loadGallery(admin, body.projectId)

    await audit({
      actorId,
      action: body.action === "set-cover" ? "project.gallery_cover_changed" : "project.gallery_reordered",
      entityType: "project",
      entityId: body.projectId,
      organizationId: project.supervising_organization_id,
      projectId: body.projectId,
      metadata: { imageIds: requestedIds },
    }).catch(() => undefined)

    await revalidateGallery(body.projectId)
    return NextResponse.json(
      { images: galleryPayload(body.projectId, updatedRows) },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the project gallery." },
      { status, headers: { "Cache-Control": "no-store" } },
    )
  }
}
