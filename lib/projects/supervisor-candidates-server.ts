import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  isProjectSupervisorOrganizationRole,
  type ProjectSupervisorCandidate,
} from "@/lib/projects/supervisor-candidates"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function getProjectSupervisorCandidates(organizationId: string): Promise<ProjectSupervisorCandidate[]> {
  const normalizedOrganizationId = organizationId.trim()
  if (!UUID_PATTERN.test(normalizedOrganizationId)) return []

  const admin = createAdminClient()
  const { data: memberships, error: membershipError } = await admin
    .from("organization_memberships")
    .select("user_id, role")
    .eq("organization_id", normalizedOrganizationId)
    .eq("status", "active")
  if (membershipError) throw membershipError

  const eligibleMemberships = (memberships ?? []).filter((membership) =>
    UUID_PATTERN.test(membership.user_id) && isProjectSupervisorOrganizationRole(membership.role),
  )
  const userIds = Array.from(new Set(eligibleMemberships.map((membership) => membership.user_id)))
  if (!userIds.length) return []

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds)
  if (profileError) throw profileError

  const roleByUser = new Map(eligibleMemberships.map((membership) => [membership.user_id, membership.role] as const))
  return (profiles ?? [])
    .filter((profile) => UUID_PATTERN.test(profile.id) && roleByUser.has(profile.id))
    .map((profile) => ({
      id: profile.id,
      name: profile.full_name?.trim() || profile.email?.trim() || "Organization member",
      email: profile.email?.trim() || "",
      organizationRole: roleByUser.get(profile.id)!,
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.email.localeCompare(right.email))
}
