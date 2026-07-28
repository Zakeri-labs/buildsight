import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { participantAvatarDisplayUrl } from "@/lib/projects/participant-avatar"
import type {
  ProjectParticipantRole,
  ProjectParticipantView,
} from "@/lib/projects/project-participant-types"

type ParticipantRow = {
  id: string
  organization_id: string | null
  organization_name: string
  participant_type: string
  project_role: string
  key_contact_user_id: string | null
  key_contact_name: string | null
  key_contact_email: string | null
  key_contact_phone: string | null
  avatar_url: string | null
  status: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
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

function projectRole(value: string): ProjectParticipantRole {
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
      return "violet"
    case "Contractor":
      return "amber"
    case "Government":
      return "emerald"
    case "Third Party":
      return "cyan"
    default:
      return "blue"
  }
}

export async function getProjectParticipants(projectId: string): Promise<ProjectParticipantView[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("project_participants")
    .select(
      "id, organization_id, organization_name, participant_type, project_role, key_contact_user_id, key_contact_name, key_contact_email, key_contact_phone, avatar_url, status",
    )
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  if (error) throw error
  const rows = (data ?? []) as ParticipantRow[]
  if (rows.length === 0) return []

  const contactUserIds = Array.from(
    new Set(rows.map((row) => row.key_contact_user_id).filter((id): id is string => Boolean(id))),
  )
  const organizationIds = Array.from(
    new Set(rows.map((row) => row.organization_id).filter((id): id is string => Boolean(id))),
  )

  let profileRows: ProfileRow[] = []
  if (contactUserIds.length) {
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", contactUserIds)
    if (profileError) throw profileError
    profileRows = (profiles ?? []) as ProfileRow[]
  }

  let membershipRows: Array<{ organization_id: string; user_id: string }> = []
  if (organizationIds.length) {
    const { data: memberships, error: membershipError } = await admin
      .from("project_user_memberships")
      .select("organization_id, user_id")
      .eq("project_id", projectId)
      .eq("status", "active")
      .in("organization_id", organizationIds)
    if (membershipError) throw membershipError
    membershipRows = memberships ?? []
  }

  const profilesById = new Map(
    profileRows.map((profile) => [profile.id, profile] as const),
  )
  const accessByOrganization = new Map<string, Set<string>>()
  for (const membership of membershipRows) {
    const users = accessByOrganization.get(membership.organization_id) ?? new Set<string>()
    users.add(membership.user_id)
    accessByOrganization.set(membership.organization_id, users)
  }

  return rows.map((row) => {
    const profile = row.key_contact_user_id ? profilesById.get(row.key_contact_user_id) : undefined
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
    const role = projectRole(row.project_role)

    return {
      id: row.id,
      organization: row.organization_name,
      organizationId: row.organization_id ?? undefined,
      organizationType: organizationType(row.participant_type),
      projectRole: role,
      keyContact: {
        userId: row.key_contact_user_id ?? undefined,
        name: contactName,
        email: profile?.email?.trim() || row.key_contact_email?.trim() || undefined,
        initials: initials(contactName),
        avatar: participantAvatarDisplayUrl(row.avatar_url),
        detail: contactDetail || undefined,
      },
      usersWithAccess: row.organization_id
        ? accessByOrganization.get(row.organization_id)?.size ?? 0
        : 0,
      status: row.status === "active" ? "Active" : "Limited Access",
      logoTone: logoTone(role),
    }
  })
}
