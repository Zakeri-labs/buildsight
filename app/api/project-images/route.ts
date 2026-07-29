import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { assertProjectAdmin, audit, AuthzError } from "@/lib/auth/guards"
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

type ProjectImageAction = "prepare" | "finalize" | "remove"

type ProjectImageRequest = {
  action?: ProjectImageAction
  projectId?: string
  filename?: string
  contentType?: string
  size?: number
  storagePath?: string
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function safeExtension(contentType: string) {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}

async function removeStoredProjectImage(
  admin: ReturnType<typeof createAdminClient>,
  value: string | null | undefined,
  projectId: string,
  replacementPath?: string,
) {
  const oldPath = projectImageStoragePath(value, projectId)
  if (oldPath && oldPath !== replacementPath) {
    await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([oldPath]).catch(() => undefined)
  }
}

async function refreshProjectImageRoutes(projectId: string) {
  revalidatePath("/", "layout")
  revalidatePath("/projects")
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/gallery`)
}

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path")?.trim()
  if (!path) return new NextResponse("Missing image path", { status: 400 })

  const storageProjectId = path.split("/")[0]
  const requestedProjectId = request.nextUrl.searchParams.get("projectId")?.trim() || storageProjectId
  if (
    !isUuid(requestedProjectId) ||
    requestedProjectId !== storageProjectId ||
    !projectImageStoragePath(path, requestedProjectId)
  ) {
    return new NextResponse("Invalid image path", { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const [{ data: project }, { data: imageRecord }] = await Promise.all([
    supabase.from("projects").select("id, image").eq("id", requestedProjectId).maybeSingle(),
    supabase
      .from("project_images")
      .select("id")
      .eq("project_id", requestedProjectId)
      .eq("storage_path", path)
      .maybeSingle(),
  ])
  if (!project) return new NextResponse("Forbidden", { status: 403 })

  const legacyAssignedPath = projectImageStoragePath(project.image, requestedProjectId)
  if (!imageRecord && legacyAssignedPath !== path) {
    return new NextResponse("Image not assigned to this project", { status: 404 })
  }

  const admin = createAdminClient()
  const { data: image, error: imageError } = await admin.storage.from(PROJECT_IMAGE_BUCKET).download(path)
  if (imageError || !image) return new NextResponse("Image not found", { status: 404 })

  const bytes = new Uint8Array(await image.arrayBuffer())
  const contentType = detectProjectImageMimeType(bytes) ?? image.type ?? "application/octet-stream"
  if (!isAllowedProjectImageType(contentType)) return new NextResponse("Image not found", { status: 404 })

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as ProjectImageRequest | null
    if (!body?.action || !isUuid(body.projectId)) {
      return NextResponse.json({ error: "Invalid project image request." }, { status: 400 })
    }

    const actorId = await assertProjectAdmin(body.projectId)
    const admin = createAdminClient()
    const [{ data: project, error: projectError }, { data: coverRecord, error: coverRecordError }] = await Promise.all([
      admin
        .from("projects")
        .select("id, image, supervising_organization_id")
        .eq("id", body.projectId)
        .maybeSingle(),
      admin
        .from("project_images")
        .select("id, storage_path, order_index")
        .eq("project_id", body.projectId)
        .order("order_index", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])
    if (projectError) throw projectError
    if (coverRecordError) throw coverRecordError
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 })

    if (body.action === "prepare") {
      const contentType = String(body.contentType ?? "").toLowerCase()
      const size = Number(body.size ?? 0)
      const filename = String(body.filename ?? "project-image")
      const validationError = validateProjectImageFile({ name: filename, size, type: contentType })
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

      const storagePath = `${body.projectId}/${actorId}/cover/${randomUUID()}.${safeExtension(contentType)}`
      const { data, error } = await admin.storage.from(PROJECT_IMAGE_BUCKET).createSignedUploadUrl(storagePath)
      if (error || !data?.token) throw new Error(error?.message || "Unable to prepare project image upload.")

      return NextResponse.json(
        { storagePath, token: data.token },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    if (body.action === "finalize") {
      const storagePath = String(body.storagePath ?? "")
      const expectedPrefix = `${body.projectId}/${actorId}/cover/`
      if (
        !storagePath.startsWith(expectedPrefix) ||
        storagePath.includes("..") ||
        !projectImageStoragePath(storagePath, body.projectId)
      ) {
        return NextResponse.json({ error: "Invalid uploaded project image path." }, { status: 400 })
      }

      const { data: uploadedFile, error: downloadError } = await admin.storage
        .from(PROJECT_IMAGE_BUCKET)
        .download(storagePath)
      if (downloadError || !uploadedFile) {
        await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([storagePath]).catch(() => undefined)
        throw new Error(downloadError?.message || "The uploaded project image could not be found in Storage.")
      }

      const size = uploadedFile.size
      const bytes = new Uint8Array(await uploadedFile.arrayBuffer())
      const contentType = detectProjectImageMimeType(bytes)
      if (
        !Number.isFinite(size) ||
        size <= 0 ||
        size > PROJECT_IMAGE_MAX_SIZE_BYTES ||
        !contentType ||
        !isAllowedProjectImageType(contentType)
      ) {
        await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([storagePath]).catch(() => undefined)
        throw new Error("The uploaded file is not a valid JPG, PNG, or WEBP project image.")
      }

      const oldImage = coverRecord?.storage_path ?? project.image
      if (coverRecord?.id) {
        const { error: assignError } = await admin
          .from("project_images")
          .update({ storage_path: storagePath, order_index: 0, updated_at: new Date().toISOString() })
          .eq("id", coverRecord.id)
          .eq("project_id", body.projectId)
        if (assignError) {
          await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([storagePath]).catch(() => undefined)
          throw assignError
        }
      } else {
        const { error: assignError } = await admin.from("project_images").insert({
          project_id: body.projectId,
          storage_path: storagePath,
          created_by: actorId,
          order_index: 0,
          updated_at: new Date().toISOString(),
        })
        if (assignError) {
          await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([storagePath]).catch(() => undefined)
          throw assignError
        }
      }

      await removeStoredProjectImage(admin, oldImage, body.projectId, storagePath)
      await audit({
        actorId,
        action: "project.image_updated",
        entityType: "project",
        entityId: body.projectId,
        organizationId: project.supervising_organization_id,
        projectId: body.projectId,
        metadata: { storagePath, size, contentType },
      }).catch(() => undefined)

      const imageUrl = projectImageDisplayUrl(storagePath, body.projectId)
      await refreshProjectImageRoutes(body.projectId)
      return NextResponse.json({ imageUrl }, { headers: { "Cache-Control": "no-store" } })
    }

    const oldImage = coverRecord?.storage_path ?? project.image
    if (coverRecord?.id) {
      const { error: deleteError } = await admin.rpc("delete_project_gallery_image", {
        p_project_id: body.projectId,
        p_image_id: coverRecord.id,
      })
      if (deleteError) throw deleteError
    } else {
      const { error: legacyRemoveError } = await admin
        .from("projects")
        .update({ image: null, updated_at: new Date().toISOString() })
        .eq("id", body.projectId)
      if (legacyRemoveError) throw legacyRemoveError
    }

    const { data: remainingRows, error: remainingError } = await admin
      .from("project_images")
      .select("id, storage_path, order_index")
      .eq("project_id", body.projectId)
      .order("order_index", { ascending: true })
    if (remainingError) throw remainingError

    const nextCover = remainingRows?.[0]?.storage_path ?? null
    await removeStoredProjectImage(admin, oldImage, body.projectId)
    await audit({
      actorId,
      action: "project.image_removed",
      entityType: "project",
      entityId: body.projectId,
      organizationId: project.supervising_organization_id,
      projectId: body.projectId,
      metadata: { promotedStoragePath: nextCover },
    }).catch(() => undefined)

    await refreshProjectImageRoutes(body.projectId)
    return NextResponse.json(
      { imageUrl: projectImageDisplayUrl(nextCover, body.projectId) },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the project image." },
      { status, headers: { "Cache-Control": "no-store" } },
    )
  }
}
