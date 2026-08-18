import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

export type UserEffectiveRole = "admin" | "member" | "viewer" | "unonboarded_creator"

export type EffectiveRoleResolution = {
  role: UserEffectiveRole
  destination: string
  organizationId: string | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export async function autoAcceptPendingInvitations(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: string,
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !userId) return false

  try {
    const { data: rpcRes, error: rpcErr } = await admin.rpc("accept_pending_invitations_for_user", {
      p_user_id: userId,
    })
    if (!rpcErr && rpcRes && typeof rpcRes === "object" && (rpcRes as any).ok) {
      return ((rpcRes as any).count ?? 0) > 0
    }
  } catch {
    // Fall back to direct JS auto-acceptance if RPC is not installed yet
  }

  const { data: invites, error: inviteErr } = await admin
    .from("invitations")
    .select("id, organization_id, project_id, organization_role, project_access_role, invited_by, expires_at, status")
    .eq("email", normalizedEmail)
    .eq("status", "pending")

  if (inviteErr || !invites || invites.length === 0) return false

  const validInvites = invites.filter((inv) => new Date(inv.expires_at).getTime() > Date.now())
  if (validInvites.length === 0) return false

  const { data: profile } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle()
  if (!profile) {
    let fullName: string | null = null
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(userId)
      fullName = authUser?.user?.user_metadata?.full_name || authUser?.user?.user_metadata?.name || null
    } catch {}

    await admin.from("profiles").upsert(
      { id: userId, email: normalizedEmail, full_name: fullName, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    )
  }

  let acceptedAny = false

  for (const invite of validInvites) {
    const { data: existingOrgMem } = await admin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", invite.organization_id)
      .eq("user_id", userId)
      .maybeSingle()

    if (!existingOrgMem) {
      await admin.from("organization_memberships").insert({
        organization_id: invite.organization_id,
        user_id: userId,
        role: invite.organization_role,
        status: "active",
      })
    } else {
      await admin
        .from("organization_memberships")
        .update({ role: invite.organization_role, status: "active", updated_at: new Date().toISOString() })
        .eq("id", existingOrgMem.id)
    }

    await admin
      .from("organizations")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", invite.organization_id)
      .in("status", ["pending", "invited"])

    if (invite.project_id && invite.project_access_role) {
      const { data: existingProjMem } = await admin
        .from("project_user_memberships")
        .select("id")
        .eq("project_id", invite.project_id)
        .eq("user_id", userId)
        .eq("organization_id", invite.organization_id)
        .maybeSingle()

      if (!existingProjMem) {
        await admin.from("project_user_memberships").insert({
          project_id: invite.project_id,
          user_id: userId,
          organization_id: invite.organization_id,
          access_role: invite.project_access_role,
          status: "active",
          created_by: invite.invited_by,
        })
      } else {
        await admin
          .from("project_user_memberships")
          .update({ access_role: invite.project_access_role, status: "active", updated_at: new Date().toISOString() })
          .eq("id", existingProjMem.id)
      }
    }

    if (invite.organization_role === "viewer") {
      await admin
        .from("project_owners")
        .update({ viewer_user_id: userId, updated_at: new Date().toISOString() })
        .eq("viewer_invitation_id", invite.id)
    }

    await admin
      .from("invitations")
      .update({ status: "accepted", accepted_by: userId, updated_at: new Date().toISOString() })
      .eq("id", invite.id)
      .eq("status", "pending")

    try {
      await admin.from("audit_logs").insert({
        actor_id: userId,
        action: "invitation.accepted",
        entity_type: "invitation",
        entity_id: invite.id,
        organization_id: invite.organization_id,
        project_id: invite.project_id,
        metadata: { email: normalizedEmail, auto_accepted: true },
      })
    } catch {}

    acceptedAny = true
  }

  return acceptedAny
}

export async function resolveUserEffectiveRole(
  userId: string,
  userEmail?: string | null,
): Promise<EffectiveRoleResolution> {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : ""
  if (!UUID_PATTERN.test(normalizedUserId)) {
    return { role: "unonboarded_creator", destination: "/onboarding", organizationId: null }
  }

  const admin = createAdminClient()

  // 1. Check active organization memberships FIRST (fast path for existing members)
  const { data: memberships } = await admin
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("user_id", normalizedUserId)
    .eq("status", "active")

  if (memberships && memberships.length > 0) {
    const roles = new Set(memberships.map((m) => m.role))
    if (roles.has("org_admin") || roles.has("org_manager")) {
      const orgId = memberships.find((m) => m.role === "org_admin" || m.role === "org_manager")?.organization_id ?? null
      return { role: "admin", destination: "/", organizationId: orgId }
    }
    if (roles.has("org_member")) {
      const orgId = memberships.find((m) => m.role === "org_member")?.organization_id ?? null
      return { role: "member", destination: "/memberhomepage", organizationId: orgId }
    }
    if (roles.has("viewer")) {
      const orgId = memberships.find((m) => m.role === "viewer")?.organization_id ?? null
      return { role: "viewer", destination: "/projects", organizationId: orgId }
    }
  }

  // 2. Resolve email and auto-accept any pending invitations for new accounts
  let email = userEmail?.trim().toLowerCase()
  if (!email) {
    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", normalizedUserId)
      .maybeSingle()
    if (profile?.email) {
      email = profile.email.trim().toLowerCase()
    }
  }

  if (email) {
    const acceptedAny = await autoAcceptPendingInvitations(admin, normalizedUserId, email)
    if (acceptedAny) {
      const { data: freshMemberships } = await admin
        .from("organization_memberships")
        .select("organization_id, role")
        .eq("user_id", normalizedUserId)
        .eq("status", "active")

      if (freshMemberships && freshMemberships.length > 0) {
        const roles = new Set(freshMemberships.map((m) => m.role))
        if (roles.has("org_admin") || roles.has("org_manager")) {
          const orgId = freshMemberships.find((m) => m.role === "org_admin" || m.role === "org_manager")?.organization_id ?? null
          return { role: "admin", destination: "/", organizationId: orgId }
        }
        if (roles.has("org_member")) {
          const orgId = freshMemberships.find((m) => m.role === "org_member")?.organization_id ?? null
          return { role: "member", destination: "/memberhomepage", organizationId: orgId }
        }
        if (roles.has("viewer")) {
          const orgId = freshMemberships.find((m) => m.role === "viewer")?.organization_id ?? null
          return { role: "viewer", destination: "/projects", organizationId: orgId }
        }
      }
    }
  }

  // 3. Fallback checks in parallel (project owners, participants, invitations)
  const [projectOwnersRes, projectParticipantsRes, invitesRes] = await Promise.all([
    admin
      .from("project_owners")
      .select("project_id")
      .eq("viewer_user_id", normalizedUserId)
      .limit(1),
    admin
      .from("project_participants")
      .select("organization_id, participant_type, participant_role_label")
      .eq("key_contact_user_id", normalizedUserId)
      .eq("status", "active"),
    email
      ? admin
          .from("invitations")
          .select("organization_id, organization_role, status")
          .eq("email", email)
          .in("status", ["pending", "accepted"])
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
  ])

  if (projectOwnersRes.data && projectOwnersRes.data.length > 0) {
    return { role: "viewer", destination: "/projects", organizationId: null }
  }

  if (projectParticipantsRes.data && projectParticipantsRes.data.length > 0) {
    const isClientParticipant = projectParticipantsRes.data.some(
      (p) =>
        p.participant_type === "client" ||
        (p.participant_role_label &&
          ["client", "client / owner", "owner", "project owner"].includes(p.participant_role_label.toLowerCase().trim())),
    )
    if (isClientParticipant) {
      return { role: "viewer", destination: "/projects", organizationId: projectParticipantsRes.data[0].organization_id ?? null }
    }
    return { role: "member", destination: "/memberhomepage", organizationId: projectParticipantsRes.data[0].organization_id ?? null }
  }

  if (invitesRes.data && invitesRes.data.length > 0) {
    const invite = invitesRes.data[0]
    if (invite.organization_role === "org_admin" || invite.organization_role === "org_manager") {
      return { role: "admin", destination: "/", organizationId: invite.organization_id }
    }
    if (invite.organization_role === "viewer") {
      return { role: "viewer", destination: "/projects", organizationId: invite.organization_id }
    }
    if (invite.organization_role === "org_member") {
      return { role: "member", destination: "/memberhomepage", organizationId: invite.organization_id }
    }
  }

  return { role: "unonboarded_creator", destination: "/onboarding", organizationId: null }
}

