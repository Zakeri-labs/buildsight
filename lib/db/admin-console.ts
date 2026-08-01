import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import type {
  MembershipStatus,
  OrganizationCategory,
  OrganizationRole,
  OrganizationStatus,
  ProjectAccessRole,
  ProjectOrgRole,
} from "@/lib/db/types"

export type OrgRow = {
  id: string
  name: string
  type: "supervising" | "external"
  organizationCategory: OrganizationCategory | null
  contactPerson: string | null
  email: string | null
  phone: string | null
  registrationNumber: string | null
  address: string | null
  postalCode: string | null
  website: string | null
  status: OrganizationStatus
  memberCount: number
}

export type ProjectRow = {
  id: string
  name: string
  code: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  status: string
}

export type ProjectOrgRow = {
  id: string
  projectId: string
  organizationId: string
  organizationName: string
  projectRole: ProjectOrgRole
  status: MembershipStatus
}

export type ProjectUserRow = {
  id: string
  projectId: string
  organizationId: string
  organizationName: string
  userId: string
  userName: string
  userEmail: string
  avatarUrl: string | null
  accessRole: ProjectAccessRole
  status: MembershipStatus
}

export type MemberRow = {
  id: string
  organizationId: string
  userId: string
  userName: string
  userEmail: string
  avatarUrl: string | null
  organizationName: string
  role: OrganizationRole
  status: MembershipStatus
}

export type InvitationRow = {
  id: string
  email: string
  organizationId: string
  organizationName: string
  projectId: string | null
  projectName: string | null
  organizationRole: OrganizationRole
  projectAccessRole: ProjectAccessRole | null
  status: string
  token: string
  expiresAt: string
  createdAt: string
}

export type AdminConsoleData = {
  organizations: OrgRow[]
  projects: ProjectRow[]
  projectOrgs: ProjectOrgRow[]
  projectUsers: ProjectUserRow[]
  members: MemberRow[]
  invitations: InvitationRow[]
}

/**
 * Loads all admin-console data for a supervising organization using the
 * service-role client. The caller MUST be verified as an admin of
 * `supervisingOrgId` before invoking this (see the /users page).
 */
export async function loadAdminConsole(supervisingOrgId: string): Promise<AdminConsoleData> {
  const admin = createAdminClient()

  const [{ data: orgs }, { data: projects }, { data: profiles }] = await Promise.all([
    admin.from("organizations").select("id, name, type, organization_category, contact_person, email, phone, registration_number, address, postal_code, website, status").order("name"),
    admin
      .from("projects")
      .select("id, name, code, location, latitude, longitude, status")
      .eq("supervising_organization_id", supervisingOrgId)
      .order("name"),
    admin.from("profiles").select("id, full_name, email, avatar_url"),
  ])

  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]))
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]))
  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      { name: p.full_name ?? p.email ?? "Unknown", email: p.email ?? "", avatarUrl: p.avatar_url ?? null },
    ]),
  )
  const projectIds = (projects ?? []).map((p) => p.id)

  const [{ data: orgMembers }, { data: pom }, { data: pum }, { data: invites }] = await Promise.all([
    admin.from("organization_memberships").select("id, organization_id, user_id, role, status"),
    projectIds.length
      ? admin
          .from("project_organization_memberships")
          .select("id, project_id, organization_id, project_role, status")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as any[] }),
    projectIds.length
      ? admin
          .from("project_user_memberships")
          .select("id, project_id, organization_id, user_id, access_role, status")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as any[] }),
    admin
      .from("invitations")
      .select(
        "id, email, organization_id, project_id, organization_role, project_access_role, status, token, expires_at, created_at",
      )
      .order("created_at", { ascending: false }),
  ])

  const memberCounts = new Map<string, number>()
  for (const m of orgMembers ?? []) {
    if (m.status === "active") memberCounts.set(m.organization_id, (memberCounts.get(m.organization_id) ?? 0) + 1)
  }

  const organizations: OrgRow[] = (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    type: o.type,
    organizationCategory: o.organization_category,
    contactPerson: o.contact_person,
    email: o.email,
    phone: o.phone,
    registrationNumber: o.registration_number,
    address: o.address,
    postalCode: o.postal_code,
    website: o.website,
    status: o.status,
    memberCount: memberCounts.get(o.id) ?? 0,
  }))

  const members: MemberRow[] = (orgMembers ?? [])
    .filter((m) => m.status === "active")
    .map((m) => ({
      id: m.id,
      organizationId: m.organization_id,
      userId: m.user_id,
      userName: profileMap.get(m.user_id)?.name ?? "Unknown",
      userEmail: profileMap.get(m.user_id)?.email ?? "",
      avatarUrl: profileMap.get(m.user_id)?.avatarUrl ?? null,
      organizationName: orgName.get(m.organization_id) ?? "Unknown",
      role: m.role,
      status: m.status,
    }))

  const projectOrgs: ProjectOrgRow[] = (pom ?? [])
    .filter((r) => r.status === "active")
    .map((r) => ({
      id: r.id,
      projectId: r.project_id,
      organizationId: r.organization_id,
      organizationName: orgName.get(r.organization_id) ?? "Unknown",
      projectRole: r.project_role,
      status: r.status,
    }))

  const projectUsers: ProjectUserRow[] = (pum ?? [])
    .filter((r) => r.status === "active")
    .map((r) => ({
      id: r.id,
      projectId: r.project_id,
      organizationId: r.organization_id,
      organizationName: orgName.get(r.organization_id) ?? "Unknown",
      userId: r.user_id,
      userName: profileMap.get(r.user_id)?.name ?? "Unknown",
      userEmail: profileMap.get(r.user_id)?.email ?? "",
      avatarUrl: profileMap.get(r.user_id)?.avatarUrl ?? null,
      accessRole: r.access_role,
      status: r.status,
    }))

  const invitations: InvitationRow[] = (invites ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    organizationId: i.organization_id,
    organizationName: orgName.get(i.organization_id) ?? "Unknown",
    projectId: i.project_id,
    projectName: i.project_id ? projectName.get(i.project_id) ?? null : null,
    organizationRole: i.organization_role,
    projectAccessRole: i.project_access_role,
    status: i.status,
    token: i.token,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  }))

  return { organizations, projects: projects ?? [], projectOrgs, projectUsers, members, invitations }
}
