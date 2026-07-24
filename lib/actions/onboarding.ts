"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { audit } from "@/lib/auth/guards"

type Result = { ok: true } | { ok: false; error: string }

/**
 * Bootstrap: the platform's first Supervising Organization and its first
 * Organization Admin. Only allowed when the current user has no memberships.
 */
export async function createSupervisingOrganization(name: string): Promise<Result> {
  const trimmed = name.trim()
  if (trimmed.length < 2) return { ok: false, error: "Organization name is too short" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Not authenticated" }

  const admin = createAdminClient()

  // Guard: user must not already belong to an organization.
  const { count } = await admin
    .from("organization_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active")
  if ((count ?? 0) > 0) return { ok: false, error: "You already belong to an organization" }

  // There can only be one supervising organization on the platform. If one
  // already exists, this user must be invited into it rather than bootstrapping.
  const { count: supervisingCount } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .eq("type", "supervising")
  if ((supervisingCount ?? 0) > 0) {
    return {
      ok: false,
      error:
        "A supervising consultancy already exists on this platform. Ask an administrator to invite you.",
    }
  }

  // Prevent duplicate organization (case-insensitive).
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .ilike("name", trimmed)
    .maybeSingle()
  if (existing) return { ok: false, error: "An organization with this name already exists" }

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: trimmed, type: "supervising", status: "active", created_by: user.id })
    .select("id")
    .single()
  if (orgErr) return { ok: false, error: orgErr.message }

  const { error: memErr } = await admin.from("organization_memberships").insert({
    organization_id: org.id,
    user_id: user.id,
    role: "org_admin",
    status: "active",
  })
  if (memErr) return { ok: false, error: memErr.message }

  await audit({
    actorId: user.id,
    action: "organization.created",
    entityType: "organization",
    entityId: org.id,
    organizationId: org.id,
    metadata: { type: "supervising", name: trimmed },
  })

  revalidatePath("/", "layout")
  return { ok: true }
}
