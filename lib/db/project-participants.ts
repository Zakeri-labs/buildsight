import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  PARTICIPANT_AVATAR_BUCKET,
  participantAvatarDisplayUrl,
  participantAvatarStoragePath,
} from "@/lib/projects/participant-avatar"
import { profileAvatarDisplayUrl } from "@/lib/profile-avatar"
import { resolveParticipantProfiles } from "@/lib/projects/participant-user-resolution"
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

  const organizationIds = Array.from(
    new Set(rows.map((row) => row.organization_id).filter((id): id is string => Boolean(id))),
  )

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

  // Persist only uniquely resolved legacy contacts. Once a participant is
  // linked, its profile avatar becomes canonical and any old participant-only
  // avatar is cleared to prevent duplicate files and duplicate management.
  await Promise.allSettled(
    rows
      .filter((row) => resolvedProfiles.has(row.id) && (!row.key_contact_user_id || row.avatar_url))
      .map(async (row) => {
        const resolved = resolvedProfiles.get(row.id)!
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (!row.key_contact_user_id) update.key_contact_user_id = resolved.id
        if (row.avatar_url) update.avatar_url = null

        let query = admin
          .from("project_participants")
          .update(update)
          .eq("id", row.id)
          .eq("project_id", projectId)
        if (!row.key_contact_user_id) query = query.is("key_contact_user_id", null)
        const { error: updateError } = await query
        if (updateError) return

        const oldPath = participantAvatarStoragePath(row.avatar_url)
        if (oldPath) {
          await admin.storage.from(PARTICIPANT_AVATAR_BUCKET).remove([oldPath]).catch(() => undefined)
        }
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
    const role = projectRole(row.project_role)

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
      usersWithAccess: row.organization_id
        ? accessByOrganization.get(row.organization_id)?.size ?? 0
        : 0,
      status: row.status === "active" ? "Active" : "Limited Access",
      logoTone: logoTone(role),
    }
  })
}
