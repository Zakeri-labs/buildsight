import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

export type UserEffectiveRole = "admin" | "member" | "viewer" | "unonboarded_creator"

export type EffectiveRoleResolution = {
  role: UserEffectiveRole
  destination: string
  organizationId: string | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export async function resolveUserEffectiveRole(
  userId: string,
  userEmail?: string | null,
): Promise<EffectiveRoleResolution> {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : ""
  if (!UUID_PATTERN.test(normalizedUserId)) {
    return { role: "unonboarded_creator", destination: "/onboarding", organizationId: null }
  }

  const admin = createAdminClient()

  // 1. Check active organization memberships
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

  // 2. Check project owners (Viewer / Client link)
  const { data: projectOwners } = await admin
    .from("project_owners")
    .select("project_id")
    .eq("viewer_user_id", normalizedUserId)
    .limit(1)

  if (projectOwners && projectOwners.length > 0) {
    return { role: "viewer", destination: "/projects", organizationId: null }
  }

  // 3. Check project participants (active assignments)
  const { data: projectParticipants } = await admin
    .from("project_participants")
    .select("organization_id, participant_type, participant_role_label")
    .eq("key_contact_user_id", normalizedUserId)
    .eq("status", "active")

  if (projectParticipants && projectParticipants.length > 0) {
    const isClientParticipant = projectParticipants.some(
      (p) =>
        p.participant_type === "client" ||
        (p.participant_role_label &&
          ["client", "client / owner", "owner", "project owner"].includes(p.participant_role_label.toLowerCase().trim())),
    )
    if (isClientParticipant) {
      return { role: "viewer", destination: "/projects", organizationId: projectParticipants[0].organization_id ?? null }
    }
    return { role: "member", destination: "/memberhomepage", organizationId: projectParticipants[0].organization_id ?? null }
  }

  // 4. Resolve email from profiles if userEmail was not passed
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

  // 5. Check pending or accepted invitations for email
  if (email) {
    const { data: invites } = await admin
      .from("invitations")
      .select("organization_id, organization_role, status")
      .eq("email", email)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })

    if (invites && invites.length > 0) {
      const invite = invites[0]
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
  }

  return { role: "unonboarded_creator", destination: "/onboarding", organizationId: null }
}
