"use server"

import { revalidatePath } from "next/cache"
import { randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertOrgAdmin, getUserIdOrThrow, audit, AuthzError } from "@/lib/auth/guards"
import { createClient } from "@/lib/supabase/server"
import type { OrganizationRole, ProjectAccessRole } from "@/lib/db/types"
import { ORGANIZATION_ROLES, PROJECT_ACCESS_ROLES } from "@/lib/db/types"

const INVITE_TTL_DAYS = 14

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

/** Find an existing auth user by email without creating one (GitHub-style). */
async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  const admin = createAdminClient()
  const target = email.trim().toLowerCase()
  // Scan paginated auth users. Fine for the scale of a supervision tenant.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target)
    if (match) return { id: match.id }
    if (data.users.length < 200) break
  }
  return null
}

/**
 * Create (or refresh) an invitation for an organization, optionally tied to a
 * project. Only an active org_admin of `organizationId` may call this.
 * Never trusts a caller-supplied user id — identity comes from the session.
 */
export async function createInvitation(input: {
  email: string
  organizationId: string
  organizationRole: OrganizationRole
  projectId?: string | null
  projectAccessRole?: ProjectAccessRole | null
}): Promise<ActionResult<{ invitationId: string; token: string; userExists: boolean }>> {
  try {
    const email = input.email.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Enter a valid email address." }
    }
    if (!ORGANIZATION_ROLES.includes(input.organizationRole)) {
      return { ok: false, error: "Invalid organization role." }
    }
    if (input.projectAccessRole && !PROJECT_ACCESS_ROLES.includes(input.projectAccessRole)) {
      return { ok: false, error: "Invalid project access role." }
    }

    const actorId = await assertOrgAdmin(input.organizationId)
    const admin = createAdminClient()

    // Revoke any prior pending invite for the same email+org+project scope.
    await admin
      .from("invitations")
      .update({ status: "revoked" })
      .eq("email", email)
      .eq("organization_id", input.organizationId)
      .eq("status", "pending")
      .is("project_id", input.projectId ?? null)

    const token = randomBytes(24).toString("base64url")
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString()

    const { data: invite, error } = await admin
      .from("invitations")
      .insert({
        email,
        organization_id: input.organizationId,
        project_id: input.projectId ?? null,
        organization_role: input.organizationRole,
        project_access_role: input.projectAccessRole ?? null,
        token,
        status: "pending",
        invited_by: actorId,
        expires_at: expiresAt,
      })
      .select("id")
      .single()
    if (error) throw error

    const existing = await findAuthUserByEmail(email)

    await audit({
      actorId,
      action: "invitation.created",
      entityType: "invitation",
      entityId: invite.id,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      metadata: { email, userExists: Boolean(existing) },
    })

    revalidatePath("/users-roles")
    return { ok: true, data: { invitationId: invite.id, token, userExists: Boolean(existing) } }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not create invitation." }
  }
}

/** Revoke a pending invitation. Caller must administer the invite's org. */
export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  try {
    const admin = createAdminClient()
    const { data: invite, error } = await admin
      .from("invitations")
      .select("id, organization_id, status")
      .eq("id", invitationId)
      .maybeSingle()
    if (error) throw error
    if (!invite) return { ok: false, error: "Invitation not found." }

    const actorId = await assertOrgAdmin(invite.organization_id)
    await admin.from("invitations").update({ status: "revoked" }).eq("id", invitationId)

    await audit({
      actorId,
      action: "invitation.revoked",
      entityType: "invitation",
      entityId: invitationId,
      organizationId: invite.organization_id,
    })
    revalidatePath("/users-roles")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not revoke invitation." }
  }
}

/**
 * Accept an invitation. The caller must be signed in AND their email must match
 * the invitation email (GitHub-style binding). Creates the org membership and,
 * when present, the project user membership. Idempotent on active memberships.
 */
export async function acceptInvitation(token: string): Promise<ActionResult<{ redirect: string }>> {
  try {
    const userId = await getUserIdOrThrow()
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const userEmail = (user?.email ?? "").toLowerCase()

    const admin = createAdminClient()
    const { data: invite, error } = await admin
      .from("invitations")
      .select("*")
      .eq("token", token)
      .maybeSingle()
    if (error) throw error
    if (!invite) return { ok: false, error: "This invitation is no longer valid." }
    if (invite.status !== "pending") return { ok: false, error: `Invitation already ${invite.status}.` }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await admin.from("invitations").update({ status: "expired" }).eq("id", invite.id)
      return { ok: false, error: "This invitation has expired." }
    }
    if (invite.email.toLowerCase() !== userEmail) {
      return {
        ok: false,
        error: `This invitation was sent to ${invite.email}. Sign in with that email to accept.`,
      }
    }

    // Org membership (unique active per user+org enforced by DB index).
    const { data: existingOrg } = await admin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", invite.organization_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle()
    if (!existingOrg) {
      const { error: omErr } = await admin.from("organization_memberships").insert({
        organization_id: invite.organization_id,
        user_id: userId,
        role: invite.organization_role,
        status: "active",
      })
      if (omErr) throw omErr
    }

    // Activate the organization if it was still pending/invited.
    await admin
      .from("organizations")
      .update({ status: "active" })
      .eq("id", invite.organization_id)
      .in("status", ["pending", "invited"])

    // Optional project user membership.
    if (invite.project_id && invite.project_access_role) {
      const { data: existingPum } = await admin
        .from("project_user_memberships")
        .select("id")
        .eq("project_id", invite.project_id)
        .eq("user_id", userId)
        .eq("organization_id", invite.organization_id)
        .eq("status", "active")
        .maybeSingle()
      if (!existingPum) {
        const { error: pumErr } = await admin.from("project_user_memberships").insert({
          project_id: invite.project_id,
          user_id: userId,
          organization_id: invite.organization_id,
          access_role: invite.project_access_role,
          status: "active",
        })
        if (pumErr) throw pumErr
      }
    }

    await admin
      .from("invitations")
      .update({ status: "accepted", accepted_by: userId })
      .eq("id", invite.id)

    await audit({
      actorId: userId,
      action: "invitation.accepted",
      entityType: "invitation",
      entityId: invite.id,
      organizationId: invite.organization_id,
      projectId: invite.project_id,
    })

    revalidatePath("/users-roles")
    return { ok: true, data: { redirect: invite.project_id ? "/dashboard" : "/dashboard" } }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not accept invitation." }
  }
}
