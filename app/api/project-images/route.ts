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
  value: string | null,
  replacementPath?: string,
) {
  const oldPath = projectImageStoragePath(value)
  if (oldPath && oldPath !== replacementPath) {
    await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([oldPath]).catch(() => undefined)
  }
}

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path")?.trim()
  if (!path) return new NextResponse("Missing image path", { status: 400 })

  const parts = path.split("/")
  const projectId = parts[0]
  if (!projectId || parts.length < 3 || path.includes("..") || path.startsWith("/")) {
    return new NextResponse("Invalid image path", { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (!project) return new NextResponse("Forbidden", { status: 403 })

  // Read through the service-role client after the authenticated project check.
  // This avoids false "resource does not exist" responses caused by Storage
  // RLS while still keeping the object private from unauthorised users.
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
      "Cache-Control": "private, max-age=60, must-revalidate",
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
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, image, supervising_organization_id")
      .eq("id", body.projectId)
      .maybeSingle()
    if (projectError) throw projectError
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
      if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) {
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

      const imageUrl = `/api/project-images?path=${encodeURIComponent(storagePath)}&v=${Date.now()}`
      const { error: updateError } = await admin
        .from("projects")
        .update({ image: storagePath, updated_at: new Date().toISOString() })
        .eq("id", body.projectId)
      if (updateError) {
        await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([storagePath]).catch(() => undefined)
        throw updateError
      }

      await removeStoredProjectImage(admin, project.image, storagePath)
      await audit({
        actorId,
        action: "project.image_updated",
        entityType: "project",
        entityId: body.projectId,
        organizationId: project.supervising_organization_id,
        projectId: body.projectId,
        metadata: { storagePath, size, contentType },
      })

      revalidatePath("/")
      revalidatePath("/projects")
      revalidatePath(`/projects/${body.projectId}`)
      return NextResponse.json({ imageUrl }, { headers: { "Cache-Control": "no-store" } })
    }

    const oldImage = project.image as string | null
    const { error: removeError } = await admin
      .from("projects")
      .update({ image: null, updated_at: new Date().toISOString() })
      .eq("id", body.projectId)
    if (removeError) throw removeError

    await removeStoredProjectImage(admin, oldImage)
    await audit({
      actorId,
      action: "project.image_removed",
      entityType: "project",
      entityId: body.projectId,
      organizationId: project.supervising_organization_id,
      projectId: body.projectId,
    })

    revalidatePath("/")
    revalidatePath("/projects")
    revalidatePath(`/projects/${body.projectId}`)
    return NextResponse.json({ imageUrl: null }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the project image." },
      { status, headers: { "Cache-Control": "no-store" } },
    )
  }
}
