"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { assertOrgAdmin, AuthzError } from "@/lib/auth/guards"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ProjectOwnerVisitorOption = {
  id: string
  name: string
  email: string
  phone: string
  address: string
  organizationId: string
  organizationName: string
}

type ProjectOwnerVisitorResult =
  | { ok: true; data: ProjectOwnerVisitorOption[] }
  | { ok: false; error: string }

/**
 * Loads fresh registered client/owner contacts for the Add Project wizard.
 *
 * The current schema has no separate Visitor table or Visitor role. A registered
 * owner/client user is represented by an active profile membership in an active
 * external organization whose canonical category is `client`. Scope is limited
 * to client organizations already created by this supervising organization or
 * actively assigned as a client to one of its projects.
 */
export async function loadProjectOwnerVisitors(input: {
  supervisingOrgId: string
}): Promise<ProjectOwnerVisitorResult> {
  try {
    const supervisingOrgId = input.supervisingOrgId.trim()
    if (!UUID_PATTERN.test(supervisingOrgId)) {
      return { ok: false, error: "Unable to load registered visitors." }
    }

    await assertOrgAdmin(supervisingOrgId)
    const admin = createAdminClient()

    const [{ data: supervisingMembers, error: memberError }, { data: projects, error: projectError }] = await Promise.all([
      admin
        .from("organization_memberships")
        .select("user_id")
        .eq("organization_id", supervisingOrgId)
        .eq("status", "active"),
      admin
        .from("projects")
        .select("id")
        .eq("supervising_organization_id", supervisingOrgId),
    ])

    if (memberError) throw memberError
    if (projectError) throw projectError

    const supervisingMemberIds = Array.from(
      new Set((supervisingMembers ?? []).map((row) => row.user_id).filter((id): id is string => UUID_PATTERN.test(id ?? ""))),
    )
    const projectIds = Array.from(
      new Set((projects ?? []).map((row) => row.id).filter((id): id is string => UUID_PATTERN.test(id ?? ""))),
    )

    const linkedClientMemberships = projectIds.length > 0
      ? await admin
          .from("project_organization_memberships")
          .select("organization_id")
          .in("project_id", projectIds)
          .eq("project_role", "client")
          .eq("status", "active")
      : { data: [] as Array<{ organization_id: string }>, error: null }

    if (linkedClientMemberships.error) throw linkedClientMemberships.error

    const linkedClientOrgIds = Array.from(
      new Set(
        (linkedClientMemberships.data ?? [])
          .map((row) => row.organization_id)
          .filter((id): id is string => UUID_PATTERN.test(id ?? "")),
      ),
    )

    const [createdClientResult, linkedClientResult] = await Promise.all([
      supervisingMemberIds.length > 0
        ? admin
            .from("organizations")
            .select("id, name, phone, address")
            .eq("type", "external")
            .eq("organization_category", "client")
            .eq("status", "active")
            .in("created_by", supervisingMemberIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; phone: string | null; address: string | null }>, error: null }),
      linkedClientOrgIds.length > 0
        ? admin
            .from("organizations")
            .select("id, name, phone, address")
            .eq("type", "external")
            .eq("organization_category", "client")
            .eq("status", "active")
            .in("id", linkedClientOrgIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; phone: string | null; address: string | null }>, error: null }),
    ])

    if (createdClientResult.error) throw createdClientResult.error
    if (linkedClientResult.error) throw linkedClientResult.error

    const clientOrganizations = Array.from(
      new Map(
        [...(createdClientResult.data ?? []), ...(linkedClientResult.data ?? [])]
          .filter((organization) => UUID_PATTERN.test(organization.id ?? ""))
          .map((organization) => [organization.id, organization] as const),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name))

    const clientOrganizationIds = clientOrganizations.map((organization) => organization.id)
    if (clientOrganizationIds.length === 0) return { ok: true, data: [] }

    const { data: visitorMemberships, error: visitorMembershipError } = await admin
      .from("organization_memberships")
      .select("organization_id, user_id")
      .in("organization_id", clientOrganizationIds)
      .eq("status", "active")

    if (visitorMembershipError) throw visitorMembershipError

    const visitorUserIds = Array.from(
      new Set(
        (visitorMemberships ?? [])
          .map((membership) => membership.user_id)
          .filter((id): id is string => UUID_PATTERN.test(id ?? "")),
      ),
    )
    if (visitorUserIds.length === 0) return { ok: true, data: [] }

    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", visitorUserIds)

    if (profileError) throw profileError

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile] as const))
    const organizationById = new Map(clientOrganizations.map((organization) => [organization.id, organization] as const))

    const candidates = (visitorMemberships ?? [])
      .map((membership) => {
        if (!UUID_PATTERN.test(membership.user_id ?? "") || !UUID_PATTERN.test(membership.organization_id ?? "")) return null
        const profile = profileById.get(membership.user_id)
        const organization = organizationById.get(membership.organization_id)
        if (!profile || !organization) return null

        const email = profile.email?.trim() || ""
        const name = profile.full_name?.trim() || email
        if (!name) return null

        return {
          id: profile.id,
          name,
          email,
          phone: organization.phone?.trim() || "",
          address: organization.address?.trim() || "",
          organizationId: organization.id,
          organizationName: organization.name.trim(),
        } satisfies ProjectOwnerVisitorOption
      })
      .filter((candidate): candidate is ProjectOwnerVisitorOption => Boolean(candidate))
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name)
        if (byName !== 0) return byName
        return a.organizationName.localeCompare(b.organizationName)
      })

    // A user may have more than one legacy/related membership. The selector is
    // user-based, so keep one deterministic option per canonical profile id.
    const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [candidate.id, candidate] as const)).values())

    return { ok: true, data: uniqueCandidates }
  } catch (error) {
    console.error("loadProjectOwnerVisitors failed", {
      operation: "project_owner_visitor_list",
      code: typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "",
      message: error instanceof Error ? error.message : "Unknown error",
      details: typeof error === "object" && error && "details" in error ? String((error as { details?: unknown }).details ?? "") : "",
      hint: typeof error === "object" && error && "hint" in error ? String((error as { hint?: unknown }).hint ?? "") : "",
    })
    return {
      ok: false,
      error: error instanceof AuthzError ? "You do not have permission to load registered visitors." : "Unable to refresh registered visitors.",
    }
  }
}
