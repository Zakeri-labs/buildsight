"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertOrgAdmin, audit, AuthzError } from "@/lib/auth/guards"
import { createClient } from "@/lib/supabase/server"
import { authUserExistsByEmail } from "@/lib/auth/auth-users"
import { resolveSiteOrigin } from "@/lib/auth/site-origin"
import { resolveInvitationEmailConfiguration } from "@/lib/email/config"
import {
  sendInvitationEmail,
  type InvitationEmailFailureCategory,
  type InvitationEmailResult,
} from "@/lib/email/invitations"
import type { OrganizationRole, ProjectAccessRole } from "@/lib/db/types"
import { ORGANIZATION_ROLES, PROJECT_ACCESS_ROLES } from "@/lib/db/types"

const INVITE_TTL_DAYS = 14
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

export type InvitationDeliveryStatus = "sent" | "provider_error" | "not_configured"
export type InvitationDeliveryErrorCategory = InvitationEmailFailureCategory | "site_origin_unavailable"

export type InvitationActionData = {
  invitationId: string
  invitationUrl: string | null
  userExists: boolean
  emailStatus: InvitationDeliveryStatus
  emailErrorCategory?: InvitationDeliveryErrorCategory
}

function redactEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return "***"
  return `${local.slice(0, 1) || "*"}***@${domain}`
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
}

async function buildInvitationUrl(token: string): Promise<{ origin: string | null; url: string | null }> {
  if (!INVITATION_TOKEN_PATTERN.test(token)) return { origin: null, url: null }

  const resolvedOrigin = await resolveSiteOrigin()
  if (!resolvedOrigin) return { origin: null, url: null }

  try {
    const originUrl = new URL(resolvedOrigin)
    const origin = originUrl.origin
    const invitationUrl = new URL(`/invite/${token}`, `${origin}/`)
    const productionDeployment =
      process.env.VERCEL_ENV === "production" ||
      (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV)

    if (invitationUrl.origin !== origin || !invitationUrl.toString().startsWith(origin)) {
      return { origin, url: null }
    }
    if (productionDeployment && (invitationUrl.protocol !== "https:" || isLocalHostname(invitationUrl.hostname))) {
      return { origin, url: null }
    }
    if (process.env.NODE_ENV === "production" && isLocalHostname(invitationUrl.hostname)) {
      return { origin, url: null }
    }

    return { origin, url: invitationUrl.toString() }
  } catch {
    return { origin: null, url: null }
  }
}

function mapEmailResult(result: InvitationEmailResult): Pick<InvitationActionData, "emailStatus" | "emailErrorCategory"> {
  if (result.status === "sent") return { emailStatus: "sent" }
  return { emailStatus: result.status, emailErrorCategory: result.category }
}

async function loadInvitationNames(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  projectId: string | null,
): Promise<{ organizationName: string; projectName: string | null }> {
  const [{ data: organization, error: organizationError }, projectResult] = await Promise.all([
    admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    projectId
      ? admin.from("projects").select("name").eq("id", projectId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (organizationError) throw organizationError
  if (!organization?.name) throw new Error("Organization not found")
  if (projectResult.error) throw projectResult.error
  if (projectId && !projectResult.data?.name) throw new Error("Project not found")

  return {
    organizationName: organization.name,
    projectName: projectResult.data?.name ?? null,
  }
}

async function submitInvitationEmail(input: {
  token: string
  email: string
  organizationName: string
  organizationRole: OrganizationRole
  projectName: string | null
  expiresAt: string
}): Promise<{
  invitationUrl: string | null
  emailStatus: InvitationDeliveryStatus
  emailErrorCategory?: InvitationDeliveryErrorCategory
}> {
  const { url } = await buildInvitationUrl(input.token)

  if (!url) {
    const emailConfiguration = resolveInvitationEmailConfiguration()
    console.error("Invitation email not submitted because the trusted site origin is unavailable", {
      operation: "organization_invitation_email",
      failureCategory: "site_origin_unavailable",
      providerHttpStatus: null,
      runtimeEnvironment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
      environmentVariablesPresent: {
        ...emailConfiguration.environmentPresence,
        NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim()),
        NEXT_PUBLIC_APP_URL: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()),
        APP_URL: Boolean(process.env.APP_URL?.trim()),
        SITE_URL: Boolean(process.env.SITE_URL?.trim()),
        BASE_URL: Boolean(process.env.BASE_URL?.trim()),
        VERCEL_PROJECT_PRODUCTION_URL: Boolean(process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()),
      },
      selectedSenderVariable: emailConfiguration.senderVariable,
      providerDetails: null,
    })
    return {
      invitationUrl: null,
      emailStatus: "provider_error",
      emailErrorCategory: "site_origin_unavailable",
    }
  }

  const emailResult = await sendInvitationEmail({
    to: input.email,
    organizationName: input.organizationName,
    organizationRole: input.organizationRole,
    projectName: input.projectName,
    expiresAt: input.expiresAt,
    invitationUrl: url,
  })

  return { invitationUrl: url, ...mapEmailResult(emailResult) }
}

/**
 * Create or refresh a custom organization invitation and submit its email.
 * Only an active organization Admin may call this action. A provider-accepted
 * email request is reported separately from the invitation's pending state.
 */
export async function createInvitation(input: {
  email: string
  organizationId: string
  organizationRole: OrganizationRole
  projectId?: string | null
  projectAccessRole?: ProjectAccessRole | null
}): Promise<ActionResult<InvitationActionData>> {
  try {
    const email = input.email.trim().toLowerCase()
    const organizationId = input.organizationId.trim()
    const projectId = input.projectId?.trim() || null

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Enter a valid email address." }
    }
    if (!UUID_PATTERN.test(organizationId)) {
      return { ok: false, error: "Invalid organization." }
    }
    if (projectId && !UUID_PATTERN.test(projectId)) {
      return { ok: false, error: "Invalid project." }
    }
    if (!ORGANIZATION_ROLES.includes(input.organizationRole)) {
      return { ok: false, error: "Invalid organization role." }
    }
    if (input.projectAccessRole && !PROJECT_ACCESS_ROLES.includes(input.projectAccessRole)) {
      return { ok: false, error: "Invalid project access role." }
    }

    const actorId = await assertOrgAdmin(organizationId)
    const admin = createAdminClient()
    const { organizationName, projectName } = await loadInvitationNames(admin, organizationId, projectId)

    let pendingQuery = admin
      .from("invitations")
      .select("id, email, token")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })

    pendingQuery = projectId ? pendingQuery.eq("project_id", projectId) : pendingQuery.is("project_id", null)
    const { data: existingPending, error: pendingError } = await pendingQuery
    if (pendingError) throw pendingError

    const pendingInvitations = ((existingPending ?? []) as Array<{ id: string; email: string; token: string }>).filter(
      (invite) => invite.email.trim().toLowerCase() === email,
    )
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString()
    const reusableInvite = pendingInvitations.find((invite) => INVITATION_TOKEN_PATTERN.test(invite.token)) ?? null
    let invitationId: string
    let token: string
    let auditAction: "invitation.created" | "invitation.refreshed"

    if (reusableInvite) {
      invitationId = reusableInvite.id
      token = reusableInvite.token
      auditAction = "invitation.refreshed"

      const { error: updateError } = await admin
        .from("invitations")
        .update({
          organization_role: input.organizationRole,
          project_access_role: input.projectAccessRole ?? null,
          invited_by: actorId,
          expires_at: expiresAt,
        })
        .eq("id", invitationId)
        .eq("status", "pending")
      if (updateError) throw updateError

      const duplicateIds = pendingInvitations
        .filter((invite) => invite.id !== invitationId)
        .map((invite) => invite.id)
      if (duplicateIds.length) {
        const { error: revokeDuplicateError } = await admin
          .from("invitations")
          .update({ status: "revoked" })
          .in("id", duplicateIds)
          .eq("status", "pending")
        if (revokeDuplicateError) throw revokeDuplicateError
      }
    } else {
      if (pendingInvitations.length) {
        const { error: revokeInvalidError } = await admin
          .from("invitations")
          .update({ status: "revoked" })
          .in(
            "id",
            pendingInvitations.map((invite) => invite.id),
          )
          .eq("status", "pending")
        if (revokeInvalidError) throw revokeInvalidError
      }

      token = randomBytes(24).toString("base64url")
      const { data: invite, error: insertError } = await admin
        .from("invitations")
        .insert({
          email,
          organization_id: organizationId,
          project_id: projectId,
          organization_role: input.organizationRole,
          project_access_role: input.projectAccessRole ?? null,
          token,
          status: "pending",
          invited_by: actorId,
          expires_at: expiresAt,
        })
        .select("id")
        .single()
      if (insertError) throw insertError

      invitationId = invite.id
      auditAction = "invitation.created"
    }

    let userExists = false
    try {
      userExists = await authUserExistsByEmail(email)
    } catch (error) {
      console.error("Invitation Auth-user lookup failed", {
        email: redactEmail(email),
        organizationId,
        message: error instanceof Error ? error.message : "Unknown error",
      })
    }

    const delivery = await submitInvitationEmail({
      token,
      email,
      organizationName,
      organizationRole: input.organizationRole,
      projectName,
      expiresAt,
    })

    try {
      await audit({
        actorId,
        action: auditAction,
        entityType: "invitation",
        entityId: invitationId,
        organizationId,
        projectId,
        metadata: {
          email,
          userExists,
          emailSubmission: delivery.emailStatus,
          emailErrorCategory: delivery.emailErrorCategory ?? null,
        },
      })
    } catch (auditError) {
      console.error("Invitation audit write failed", {
        invitationId,
        action: auditAction,
        message: auditError instanceof Error ? auditError.message : "Unknown error",
      })
    }

    revalidatePath("/users")
    return {
      ok: true,
      data: {
        invitationId,
        invitationUrl: delivery.invitationUrl,
        userExists,
        emailStatus: delivery.emailStatus,
        emailErrorCategory: delivery.emailErrorCategory,
      },
    }
  } catch (err) {
    console.error("createInvitation failed", {
      operation: "organization_invitation",
      message: err instanceof Error ? err.message : "Unknown error",
    })
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not create invitation." }
  }
}

/** Re-submit the email for an existing pending invitation without creating another invitation row. */
export async function resendInvitationEmail(invitationId: string): Promise<ActionResult<InvitationActionData>> {
  try {
    if (!UUID_PATTERN.test(invitationId)) return { ok: false, error: "Invalid invitation." }

    const admin = createAdminClient()
    const { data: invite, error } = await admin
      .from("invitations")
      .select(
        "id, email, organization_id, project_id, organization_role, token, status, expires_at",
      )
      .eq("id", invitationId)
      .maybeSingle()
    if (error) throw error
    if (!invite || invite.status !== "pending" || !INVITATION_TOKEN_PATTERN.test(invite.token)) {
      return { ok: false, error: "This invitation is no longer available to resend." }
    }

    const actorId = await assertOrgAdmin(invite.organization_id)
    const { organizationName, projectName } = await loadInvitationNames(
      admin,
      invite.organization_id,
      invite.project_id,
    )

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000).toISOString()
    const { error: refreshError } = await admin
      .from("invitations")
      .update({ expires_at: expiresAt, invited_by: actorId })
      .eq("id", invite.id)
      .eq("status", "pending")
    if (refreshError) throw refreshError

    let userExists = false
    try {
      userExists = await authUserExistsByEmail(invite.email)
    } catch (lookupError) {
      console.error("Invitation resend Auth-user lookup failed", {
        email: redactEmail(invite.email),
        organizationId: invite.organization_id,
        message: lookupError instanceof Error ? lookupError.message : "Unknown error",
      })
    }

    const delivery = await submitInvitationEmail({
      token: invite.token,
      email: invite.email,
      organizationName,
      organizationRole: invite.organization_role,
      projectName,
      expiresAt,
    })

    try {
      await audit({
        actorId,
        action: "invitation.email_resubmitted",
        entityType: "invitation",
        entityId: invite.id,
        organizationId: invite.organization_id,
        projectId: invite.project_id,
        metadata: {
          email: invite.email,
          userExists,
          emailSubmission: delivery.emailStatus,
          emailErrorCategory: delivery.emailErrorCategory ?? null,
        },
      })
    } catch (auditError) {
      console.error("Invitation resend audit write failed", {
        invitationId: invite.id,
        action: "invitation.email_resubmitted",
        message: auditError instanceof Error ? auditError.message : "Unknown error",
      })
    }

    revalidatePath("/users")
    return {
      ok: true,
      data: {
        invitationId: invite.id,
        invitationUrl: delivery.invitationUrl,
        userExists,
        emailStatus: delivery.emailStatus,
        emailErrorCategory: delivery.emailErrorCategory,
      },
    }
  } catch (err) {
    console.error("resendInvitationEmail failed", {
      operation: "organization_invitation_resend",
      message: err instanceof Error ? err.message : "Unknown error",
    })
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not resend invitation email." }
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
    if (!token || !INVITATION_TOKEN_PATTERN.test(token)) {
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
  const safeToken = INVITATION_TOKEN_PATTERN.test(token) ? token : ""

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
