import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertOrgAdmin, audit, AuthzError, getUserIdOrThrow } from "@/lib/auth/guards"
import {
  isAllowedProfileAvatarType,
  isStoredProfileAvatar,
  PROFILE_AVATAR_BUCKET,
  PROFILE_AVATAR_MAX_BYTES,
} from "@/lib/profile-avatar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type AvatarAction = "prepare" | "finalize" | "remove"

type AvatarRequest = {
  action?: AvatarAction
  targetUserId?: string
  organizationId?: string | null
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

async function authorizeTarget(targetUserId: string, organizationId?: string | null) {
  const actorId = await getUserIdOrThrow()
  if (actorId === targetUserId) return { actorId, organizationId: null as string | null }

  if (!isUuid(organizationId)) throw new AuthzError("An organization administrator is required to edit this avatar.")
  await assertOrgAdmin(organizationId)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId)
    .eq("status", "active")
    .maybeSingle()
  if (error) throw error
  if (!data) throw new AuthzError("The selected user is not an active member of this organization.")

  return { actorId, organizationId }
}

async function getProfile(admin: ReturnType<typeof createAdminClient>, targetUserId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, avatar_url")
    .eq("id", targetUserId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("User profile not found.")
  return data as { id: string; avatar_url: string | null }
}

export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get("path")?.trim()
    if (!path || path.includes("..") || path.startsWith("/")) {
      return NextResponse.json({ error: "Invalid avatar path." }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 })

    // This RLS-scoped lookup proves the caller may see the profile before the
    // service-role client creates a short-lived Storage URL.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, avatar_url")
      .eq("avatar_url", path)
      .limit(1)
      .maybeSingle()
    if (profileError || !profile) {
      return NextResponse.json({ error: "Avatar not found." }, { status: 404 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(PROFILE_AVATAR_BUCKET).createSignedUrl(path, 60 * 60)
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Avatar image is unavailable." }, { status: 404 })
    }

    return NextResponse.redirect(data.signedUrl, {
      status: 302,
      headers: { "Cache-Control": "private, max-age=300" },
    })
  } catch (error) {
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load avatar." },
      { status, headers: { "Cache-Control": "no-store" } },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as AvatarRequest | null
    if (!body || !body.action || !isUuid(body.targetUserId)) {
      return NextResponse.json({ error: "Invalid avatar request." }, { status: 400 })
    }

    const { actorId, organizationId } = await authorizeTarget(body.targetUserId, body.organizationId)
    const admin = createAdminClient()
    const profile = await getProfile(admin, body.targetUserId)

    if (body.action === "prepare") {
      const contentType = String(body.contentType ?? "").toLowerCase()
      const size = Number(body.size ?? 0)
      if (!isAllowedProfileAvatarType(contentType)) {
        return NextResponse.json({ error: "Only JPG, PNG, and WEBP images are allowed." }, { status: 400 })
      }
      if (!Number.isFinite(size) || size <= 0 || size > PROFILE_AVATAR_MAX_BYTES) {
        return NextResponse.json({ error: "Profile images must be 5 MB or smaller." }, { status: 400 })
      }

      const storagePath = `${body.targetUserId}/${randomUUID()}.${safeExtension(contentType)}`
      const { data, error } = await admin.storage.from(PROFILE_AVATAR_BUCKET).createSignedUploadUrl(storagePath)
      if (error || !data?.token) throw new Error(error?.message || "Unable to prepare avatar upload.")

      return NextResponse.json(
        { storagePath, token: data.token },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    if (body.action === "finalize") {
      const storagePath = String(body.storagePath ?? "")
      if (!storagePath.startsWith(`${body.targetUserId}/`) || storagePath.includes("..")) {
        return NextResponse.json({ error: "Invalid uploaded avatar path." }, { status: 400 })
      }

      const bucket = admin.storage.from(PROFILE_AVATAR_BUCKET) as any
      const { data: info, error: infoError } = await bucket.info(storagePath)
      const size = Number(info?.size ?? info?.metadata?.size ?? 0)
      const contentType = String(
        info?.contentType ?? info?.metadata?.mimetype ?? info?.metadata?.contentType ?? "",
      ).toLowerCase()

      if (infoError || !info || size <= 0 || size > PROFILE_AVATAR_MAX_BYTES || !isAllowedProfileAvatarType(contentType)) {
        await admin.storage.from(PROFILE_AVATAR_BUCKET).remove([storagePath]).catch(() => undefined)
        throw new Error(infoError?.message || "Supabase Storage did not confirm a valid avatar image.")
      }

      const { error: updateError } = await admin
        .from("profiles")
        .update({ avatar_url: storagePath, updated_at: new Date().toISOString() })
        .eq("id", body.targetUserId)
      if (updateError) {
        await admin.storage.from(PROFILE_AVATAR_BUCKET).remove([storagePath]).catch(() => undefined)
        throw updateError
      }

      if (isStoredProfileAvatar(profile.avatar_url) && profile.avatar_url !== storagePath) {
        await admin.storage.from(PROFILE_AVATAR_BUCKET).remove([profile.avatar_url]).catch(() => undefined)
      }

      await audit({
        actorId,
        action: "profile.avatar_updated",
        entityType: "profile",
        entityId: body.targetUserId,
        organizationId,
        metadata: { storagePath, size, contentType },
      })

      revalidatePath("/")
      revalidatePath("/settings")
      revalidatePath("/users")
      return NextResponse.json({ avatarUrl: storagePath }, { headers: { "Cache-Control": "no-store" } })
    }

    const oldAvatarPath = isStoredProfileAvatar(profile.avatar_url) ? profile.avatar_url : null
    const { error: removeError } = await admin
      .from("profiles")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("id", body.targetUserId)
    if (removeError) throw removeError

    if (oldAvatarPath) {
      await admin.storage.from(PROFILE_AVATAR_BUCKET).remove([oldAvatarPath]).catch(() => undefined)
    }

    await audit({
      actorId,
      action: "profile.avatar_removed",
      entityType: "profile",
      entityId: body.targetUserId,
      organizationId,
    })

    revalidatePath("/")
    revalidatePath("/settings")
    revalidatePath("/users")
    return NextResponse.json({ avatarUrl: null }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = error instanceof AuthzError ? 403 : 400
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update profile image." },
      { status, headers: { "Cache-Control": "no-store" } },
    )
  }
}
