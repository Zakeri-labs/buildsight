import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { assertProjectAdmin, audit, AuthzError } from "@/lib/auth/guards"
import {
  detectParticipantAvatarMimeType,
  isAllowedParticipantAvatarType,
  PARTICIPANT_AVATAR_BUCKET,
  PARTICIPANT_AVATAR_MAX_BYTES,
  participantAvatarDisplayUrl,
  participantAvatarStoragePath,
  validateParticipantAvatarFile,
} from "@/lib/projects/participant-avatar"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { resolveParticipantProfile } from "@/lib/projects/participant-user-resolution"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ParticipantAvatarAction = "prepare" | "finalize" | "remove"

type ParticipantAvatarRequest = {
  action?: ParticipantAvatarAction
  projectId?: string
  participantId?: string
  filename?: string
  contentType?: string
  size?: number
  storagePath?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value)
}

function safeExtension(contentType: string) {
  if (contentType === "image/png") return "png"
  if (contentType === "image/webp") return "webp"
  return "jpg"
}

async function removeStoredParticipantAvatar(
  admin: ReturnType<typeof createAdminClient>,
  value: string | null,
  replacementPath?: string,
) {
  const oldPath = participantAvatarStoragePath(value)
  if (oldPath && oldPath !== replacementPath) {
    await admin.storage.from(PARTICIPANT_AVATAR_BUCKET).remove([oldPath]).catch(() => undefined)
  }
}

async function downloadAndValidateAvatar(
  admin: ReturnType<typeof createAdminClient>,
  storagePath: string,
) {
  const { data, error } = await admin.storage.from(PARTICIPANT_AVATAR_BUCKET).download(storagePath)
  if (error || !data) {
    throw new Error(error?.message || "The uploaded participant image could not be found in Storage.")
  }

  const size = data.size
  if (!Number.isFinite(size) || size <= 0 || size > PARTICIPANT_AVATAR_MAX_BYTES) {
    throw new Error("The uploaded participant image is empty or exceeds the 5 MB limit.")
  }

  const bytes = new Uint8Array(await data.arrayBuffer())
  const contentType = detectParticipantAvatarMimeType(bytes)
  if (!contentType || !isAllowedParticipantAvatarType(contentType)) {
    throw new Error("The uploaded file is not a valid JPG, PNG, or WEBP image.")
  }

  return { size, contentType }
}

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path")?.trim()
  const parts = path?.split("/") ?? []
  const projectId = parts[0]
  const participantId = parts[1]

  if (
    !path ||
    !isUuid(projectId) ||
    !isUuid(participantId) ||
    parts.length < 3 ||
    path.includes("..") ||
    path.startsWith("/")
  ) {
    return new NextResponse("Invalid participant image path", { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const { data: participant, error: participantError } = await supabase
    .from("project_participants")
    .select("id")
    .eq("id", participantId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (participantError || !participant) return new NextResponse("Forbidden", { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(PARTICIPANT_AVATAR_BUCKET).createSignedUrl(path, 60 * 10)
  if (error || !data?.signedUrl) return new NextResponse("Image not found", { status: 404 })

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=300" },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as ParticipantAvatarRequest | null
    if (!body?.action || !isUuid(body.projectId) || !isUuid(body.participantId)) {
      return NextResponse.json({ error: "Invalid participant image request." }, { status: 400 })
    }

    const actorId = await assertProjectAdmin(body.projectId)
    const admin = createAdminClient()
    const [{ data: participant, error: participantError }, { data: project, error: projectError }] = await Promise.all([
      admin
        .from("project_participants")
        .select("id, project_id, organization_id, key_contact_user_id, key_contact_name, key_contact_email, avatar_url")
        .eq("id", body.participantId)
        .eq("project_id", body.projectId)
        .maybeSingle(),
      admin
        .from("projects")
        .select("id, supervising_organization_id")
        .eq("id", body.projectId)
        .maybeSingle(),
    ])
    if (participantError) throw participantError
    if (projectError) throw projectError
    if (!participant) return NextResponse.json({ error: "Project participant not found." }, { status: 404 })
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 })

    const linkedProfile = await resolveParticipantProfile(admin, body.projectId, participant)
    if (linkedProfile) {
      return NextResponse.json(
        { error: "This participant is linked to a platform user. Update the user profile avatar instead." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      )
    }

    if (body.action === "prepare") {
      const contentType = String(body.contentType ?? "").toLowerCase()
      const size = Number(body.size ?? 0)
      const filename = String(body.filename ?? "participant-avatar")
      const validationError = validateParticipantAvatarFile({ name: filename, size, type: contentType })
      if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

      const storagePath = `${body.projectId}/${body.participantId}/${randomUUID()}.${safeExtension(contentType)}`
      const { data, error } = await admin.storage.from(PARTICIPANT_AVATAR_BUCKET).createSignedUploadUrl(storagePath)
      if (error || !data?.token) throw new Error(error?.message || "Unable to prepare participant image upload.")

      return NextResponse.json(
        { storagePath, token: data.token },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    if (body.action === "finalize") {
      const storagePath = String(body.storagePath ?? "")
      const expectedPrefix = `${body.projectId}/${body.participantId}/`
      if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) {
        return NextResponse.json({ error: "Invalid uploaded participant image path." }, { status: 400 })
      }

      let verified: { size: number; contentType: string }
      try {
        verified = await downloadAndValidateAvatar(admin, storagePath)
      } catch (error) {
        await admin.storage.from(PARTICIPANT_AVATAR_BUCKET).remove([storagePath]).catch(() => undefined)
        throw error
      }

      const { error: updateError } = await admin
        .from("project_participants")
        .update({ avatar_url: storagePath, updated_at: new Date().toISOString() })
        .eq("id", body.participantId)
        .eq("project_id", body.projectId)
      if (updateError) {
        await admin.storage.from(PARTICIPANT_AVATAR_BUCKET).remove([storagePath]).catch(() => undefined)
        throw updateError
      }

      await removeStoredParticipantAvatar(admin, participant.avatar_url as string | null, storagePath)
      await audit({
        actorId,
        action: "project_participant.avatar_updated",
        entityType: "project_participant",
        entityId: body.participantId,
        organizationId: project.supervising_organization_id,
        projectId: body.projectId,
        metadata: { storagePath, ...verified },
      })

      revalidatePath("/")
      revalidatePath(`/projects/${body.projectId}`)
      return NextResponse.json(
        { avatarUrl: participantAvatarDisplayUrl(storagePath) ?? null },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    const oldAvatar = participant.avatar_url as string | null
    const { error: removeError } = await admin
      .from("project_participants")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("id", body.participantId)
      .eq("project_id", body.projectId)
    if (removeError) throw removeError

    await removeStoredParticipantAvatar(admin, oldAvatar)
    await audit({
      actorId,
      action: "project_participant.avatar_removed",
      entityType: "project_participant",
      entityId: body.participantId,
      organizationId: project.supervising_organization_id,
      projectId: body.projectId,
    })

    revalidatePath("/")
    revalidatePath(`/projects/${body.projectId}`)
    return NextResponse.json({ avatarUrl: null }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update participant image." },
      { status, headers: { "Cache-Control": "no-store" } },
    )
  }
}
