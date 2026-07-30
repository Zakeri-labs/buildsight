import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  PARTICIPANT_AVATAR_BUCKET,
  participantAvatarDisplayUrl,
  participantAvatarStoragePath,
} from "@/lib/projects/participant-avatar"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"
import { resolveParticipantProfiles } from "@/lib/projects/participant-user-resolution"
import { roleLabel } from "@/lib/db/types"
import type {
  ProjectParticipantRole,
  ProjectParticipantUserOption,
  ProjectParticipantView,
} from "@/lib/projects/project-participant-types"

const CUSTOM_PARTICIPANT_ROLES = new Set<ProjectParticipantRole>([
  "Consultant",
  "Client / Owner",
  "Contractor",
  "Project Manager",
  "Site Engineer",
  "QA/QC Engineer",
  "HSE Officer",
  "Supplier",
  "Subcontractor",
  "Other",
])

type ParticipantRow = {
  id: string
  organization_id: string | null
  organization_name: string
  participant_type: string
  project_role: string
  participant_role_label: string | null
  key_contact_user_id: string | null
  key_contact_name: string | null
  key_contact_email: string | null
  key_contact_phone: string | null
  avatar_url: string | null
  status: string
}

type MembershipRow = {
  organization_id: string
  user_id: string
  role: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
}

function initials(value: string): string {
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "—"
}

function projectRole(value: string, displayRole: string | null): ProjectParticipantRole {
  const normalizedDisplayRole = displayRole?.trim() as ProjectParticipantRole | undefined
  if (normalizedDisplayRole && CUSTOM_PARTICIPANT_ROLES.has(normalizedDisplayRole)) return normalizedDisplayRole

  switch (value) {
    case "client":
      return "Client"
    case "contractor":
    case "subcontractor":
      return "Contractor"
    case "government":
      return "Government"
    case "third_party":
    case "supplier":
      return "Third Party"
    default:
      return "Consultant"
  }
}

function organizationType(value: string): string {
  switch (value) {
    case "client":
      return "Client"
    case "contractor":
      return "Contractor"
    case "subcontractor":
      return "Subcontractor"
    case "government":
      return "Government"
    case "supplier":
      return "Supplier"
    case "third_party":
      return "Third Party"
    default:
      return "Consultancy"
  }
}

function logoTone(role: ProjectParticipantRole): NonNullable<ProjectParticipantView["logoTone"]> {
  switch (role) {
    case "Client":
    case "Client / Owner":
      return "violet"
    case "Contractor":
    case "Subcontractor":
      return "amber"
    case "Government":
      return "emerald"
    case "Third Party":
    case "Supplier":
    case "Other":
      return "cyan"
    default:
      return "blue"
  }
}

function membershipPriority(role: string): number {
  return role === "org_admin" ? 0 : role === "org_manager" ? 1 : role === "org_member" ? 2 : 3
}

export async function getProjectParticipantUserOptions(projectId: string): Promise<ProjectParticipantUserOption[]> {
  const admin = createAdminClient()
  const [projectResult, projectOrganizationsResult, membershipsResult, existingParticipantsResult] = await Promise.all([
    admin.from("projects").select("supervising_organization_id").eq("id", projectId).maybeSingle(),
    admin.from("project_organization_memberships").select("organization_id").eq("project_id", projectId).eq("status", "active"),
    admin.from("organization_memberships").select("organization_id, user_id, role").eq("status", "active"),
    admin
      .from("project_participants")
      .select("key_contact_user_id")
      .eq("project_id", projectId)
      .eq("status", "active")
      .not("key_contact_user_id", "is", null),
  ])

  if (projectResult.error) throw projectResult.error
  if (projectOrganizationsResult.error) throw projectOrganizationsResult.error
  if (membershipsResult.error) throw membershipsResult.error
  if (existingParticipantsResult.error) throw existingParticipantsResult.error
  if (!projectResult.data) return []

  const existingParticipantRows = (existingParticipantsResult.data ?? []) as Array<{ key_contact_user_id: string | null }>
  const existingUserIds = new Set(
    existingParticipantRows
      .map((row) => row.key_contact_user_id)
      .filter((id): id is string => Boolean(id)),
  )
  const membershipRows = (membershipsResult.data ?? []) as MembershipRow[]
  const availableMemberships = membershipRows.filter((membership) => !existingUserIds.has(membership.user_id))
  const userIds = Array.from(new Set(availableMemberships.map((membership) => membership.user_id)))
  const organizationIds = Array.from(new Set(availableMemberships.map((membership) => membership.organization_id)))
  if (userIds.length === 0 || organizationIds.length === 0) return []

  const [profilesResult, organizationsResult] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, avatar_url").in("id", userIds),
    admin.from("organizations").select("id, name").in("id", organizationIds),
  ])
  if (profilesResult.error) throw profilesResult.error
  if (organizationsResult.error) throw organizationsResult.error

  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile] as const))
  const organizationRows = (organizationsResult.data ?? []) as Array<{ id: string; name: string }>
  const organizations = new Map(organizationRows.map((organization) => [organization.id, organization.name] as const))
  const projectOrganizationRows = (projectOrganizationsResult.data ?? []) as Array<{ organization_id: string }>
  const relatedOrganizationIds = new Set<string>([
    projectResult.data.supervising_organization_id as string,
    ...projectOrganizationRows.map((row) => row.organization_id),
  ])
  const membershipsByUser = new Map<string, MembershipRow[]>()
  for (const membership of availableMemberships) {
    const rows = membershipsByUser.get(membership.user_id) ?? []
    rows.push(membership)
    membershipsByUser.set(membership.user_id, rows)
  }

  const options: ProjectParticipantUserOption[] = []
  for (const userId of userIds) {
    const profile = profiles.get(userId)
    if (!profile) continue
    const membership = [...(membershipsByUser.get(userId) ?? [])].sort((a, b) => {
      const aRelated = relatedOrganizationIds.has(a.organization_id) ? 0 : 1
      const bRelated = relatedOrganizationIds.has(b.organization_id) ? 0 : 1
      return aRelated - bRelated || membershipPriority(a.role) - membershipPriority(b.role)
    })[0]
    if (!membership) continue
    const organizationName = organizations.get(membership.organization_id)
    if (!organizationName) continue

    options.push({
      id: profile.id,
      name: profile.full_name?.trim() || profile.email?.trim() || "Platform user",
      email: profile.email?.trim() || "",
      avatarUrl: profileAvatarDisplayUrl(profile.avatar_url),
      organizationId: membership.organization_id,
      organizationName,
      organizationRole: roleLabel(membership.role),
    })
  }

  return options.sort((a, b) => a.name.localeCompare(b.name) || a.organizationName.localeCompare(b.organizationName))
}

export async function getProjectParticipants(projectId: string): Promise<ProjectParticipantView[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("project_participants")
    .select(
      "id, organization_id, organization_name, participant_type, project_role, participant_role_label, key_contact_user_id, key_contact_name, key_contact_email, key_contact_phone, avatar_url, status",
    )
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) throw error
  const rows = (data ?? []) as ParticipantRow[]
  if (rows.length === 0) return []

  const organizationIds = Array.from(new Set(rows.map((row) => row.organization_id).filter((id): id is string => Boolean(id))))
  const [resolvedProfiles, membershipResult] = await Promise.all([
    resolveParticipantProfiles(admin, projectId, rows),
    organizationIds.length
      ? admin
          .from("project_user_memberships")
          .select("organization_id, user_id")
          .eq("project_id", projectId)
          .eq("status", "active")
          .in("organization_id", organizationIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (membershipResult.error) throw membershipResult.error
  const membershipRows = (membershipResult.data ?? []) as Array<{ organization_id: string; user_id: string }>

  await Promise.allSettled(
    rows
      .filter((row) => resolvedProfiles.has(row.id) && (!row.key_contact_user_id || row.avatar_url))
      .map(async (row) => {
        const resolved = resolvedProfiles.get(row.id)!
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (!row.key_contact_user_id) update.key_contact_user_id = resolved.id
        if (row.avatar_url) update.avatar_url = null

        let query = admin.from("project_participants").update(update).eq("id", row.id).eq("project_id", projectId)
        if (!row.key_contact_user_id) query = query.is("key_contact_user_id", null)
        const { error: updateError } = await query
        if (updateError) return

        const oldPath = participantAvatarStoragePath(row.avatar_url)
        if (oldPath) await admin.storage.from(PARTICIPANT_AVATAR_BUCKET).remove([oldPath]).catch(() => undefined)
      }),
  )

  const accessByOrganization = new Map<string, Set<string>>()
  for (const membership of membershipRows) {
    const users = accessByOrganization.get(membership.organization_id) ?? new Set<string>()
    users.add(membership.user_id)
    accessByOrganization.set(membership.organization_id, users)
  }

  return rows.map((row) => {
    const profile = resolvedProfiles.get(row.id)
    const participantAvatar = participantAvatarDisplayUrl(row.avatar_url)
    const profileAvatar = profileAvatarDisplayUrl(profile?.avatar_url)
    const contactName =
      row.key_contact_name?.trim() ||
      profile?.full_name?.trim() ||
      profile?.email?.trim() ||
      row.key_contact_email?.trim() ||
      row.key_contact_phone?.trim() ||
      "Contact not provided"
    const contactDetail = [row.key_contact_email?.trim(), row.key_contact_phone?.trim()]
      .filter((value): value is string => Boolean(value && value !== contactName))
      .join(" · ")
    const role = projectRole(row.project_role, row.participant_role_label)

    return {
      id: row.id,
      organization: row.organization_name,
      organizationId: row.organization_id ?? undefined,
      organizationType: organizationType(row.participant_type),
      projectRole: role,
      keyContact: {
        userId: profile?.id ?? undefined,
        linkedBy: profile?.match,
        name: contactName,
        email: profile?.email?.trim() || row.key_contact_email?.trim() || undefined,
        initials: initials(contactName),
        avatar: profile ? profileAvatar : participantAvatar ?? undefined,
        profileAvatar,
        participantAvatar: participantAvatar ?? undefined,
        detail: contactDetail || undefined,
      },
      usersWithAccess: row.organization_id ? accessByOrganization.get(row.organization_id)?.size ?? 0 : 0,
      status: row.status === "active" ? "Active" : "Limited Access",
      logoTone: logoTone(role),
    }
  })
}
