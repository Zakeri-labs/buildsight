"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertOrgAdmin, audit, AuthzError } from "@/lib/auth/guards"
import { createClient } from "@/lib/supabase/server"
import { authUserExistsByEmail } from "@/lib/auth/auth-users"
import type { OrganizationRole, ProjectAccessRole } from "@/lib/db/types"
import { ORGANIZATION_ROLES, PROJECT_ACCESS_ROLES } from "@/lib/db/types"

const INVITE_TTL_DAYS = 14

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

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
    let revokeQuery = admin
      .from("invitations")
      .update({ status: "revoked" })
      .eq("email", email)
      .eq("organization_id", input.organizationId)
      .eq("status", "pending")

    revokeQuery = input.projectId
      ? revokeQuery.eq("project_id", input.projectId)
      : revokeQuery.is("project_id", null)

    const { error: revokeError } = await revokeQuery
    if (revokeError) throw revokeError

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

    const userExists = await authUserExistsByEmail(email)

    await audit({
      actorId,
      action: "invitation.created",
      entityType: "invitation",
      entityId: invite.id,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      metadata: { email, userExists },
    })

    revalidatePath("/users")
    return { ok: true, data: { invitationId: invite.id, token, userExists } }
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
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not revoke invitation." }
  }
}

/**
 * Accept an invitation through a database transaction. Identity comes only
 * from the request-scoped Supabase session, while the database function
 * validates the invitation email and applies membership changes atomically.
 */
export async function acceptInvitation(token: string): Promise<ActionResult<{ redirect: string }>> {
  try {
    if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) {
      return { ok: false, error: "This invitation is no longer valid." }
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { ok: false, error: "Sign in with the invited email to continue." }
    }

    const { data, error } = await supabase.rpc("accept_invitation_atomic", { p_token: token })
    if (error) {
      console.error("acceptInvitation RPC failed:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      return { ok: false, error: "Could not accept this invitation. Please try again." }
    }

    const result = data as { ok?: boolean; code?: string; redirect?: string } | null
    if (!result?.ok) {
      const messages: Record<string, string> = {
        not_authenticated: "Sign in with the invited email to continue.",
        invalid: "This invitation is no longer valid.",
        expired: "This invitation has expired.",
        revoked: "This invitation has been revoked.",
        accepted: "This invitation has already been used.",
        email_mismatch: "Sign in with the exact email address that received this invitation.",
        profile_unavailable: "Your account is not ready yet. Please try again.",
      }
      return { ok: false, error: messages[result?.code ?? ""] ?? "Could not accept this invitation." }
    }

    revalidatePath("/users")
    return { ok: true, data: { redirect: result.redirect ?? "/" } }
  } catch (err) {
    console.error("acceptInvitation failed:", err instanceof Error ? err.message : "Unknown error")
    return { ok: false, error: "Could not accept this invitation. Please try again." }
  }
}

/**
 * Sign out only the current browser session and continue through an
 * invitation-aware login route without losing the invitation destination.
 */
export async function switchInvitationAccount(token: string): Promise<never> {
  const safeToken = /^[A-Za-z0-9_-]+$/.test(token) ? token : ""

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut({ scope: "local" })
    if (error) {
      console.error("Invitation account switch sign-out failed:", error.message)
    }
  } catch (error) {
    console.error(
      "Invitation account switch could not clear the current request session:",
      error instanceof Error ? error.message : "Unknown error",
    )
  }

  let invitedEmail = ""
  if (safeToken) {
    try {
      const admin = createAdminClient()
      const { data: invite, error } = await admin
        .from("invitations")
        .select("email")
        .eq("token", safeToken)
        .maybeSingle()
      if (!error) invitedEmail = invite?.email?.trim().toLowerCase() ?? ""
    } catch (error) {
      console.error(
        "Invitation account switch could not resolve the invited email:",
        error instanceof Error ? error.message : "Unknown error",
      )
    }
  }

  const next = safeToken ? `/invite/${safeToken}` : "/"
  const query = new URLSearchParams({ next })
  if (invitedEmail) query.set("email", invitedEmail)
  redirect(`/auth/login?${query.toString()}`)
}
