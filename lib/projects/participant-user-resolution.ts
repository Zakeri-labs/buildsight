import "server-only"

export type ParticipantIdentity = {
  id: string
  organization_id: string | null
  key_contact_user_id: string | null
  key_contact_name: string | null
  key_contact_email: string | null
}

export type ResolvedParticipantProfile = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  match: "linked" | "email" | "name"
}

type AdminClient = {
  from: (table: string) => any
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
}

function normalizeEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ""
}

function normalizeName(value: string | null | undefined): string {
  return value
    ?.normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en") ?? ""
}

function uniqueProfile(matches: ProfileRow[]): ProfileRow | null {
  const unique = new Map(matches.map((profile) => [profile.id, profile]))
  return unique.size === 1 ? Array.from(unique.values())[0] : null
}

/**
 * Resolves participant contacts to existing platform users without requiring a
 * duplicate participant avatar. Explicit links win, followed by unique exact
 * email matches and then unique exact name matches within the participant's
 * organisation/project access scope.
 */
export async function resolveParticipantProfiles(
  admin: AdminClient,
  projectId: string,
  participants: ParticipantIdentity[],
): Promise<Map<string, ResolvedParticipantProfile>> {
  if (participants.length === 0) return new Map()

  const organizationIds = Array.from(
    new Set(participants.map((participant) => participant.organization_id).filter((id): id is string => Boolean(id))),
  )
  const explicitlyLinkedIds = participants
    .map((participant) => participant.key_contact_user_id)
    .filter((id): id is string => Boolean(id))

  const [projectMembershipResult, organizationMembershipResult] = await Promise.all([
    admin
      .from("project_user_memberships")
      .select("organization_id, user_id")
      .eq("project_id", projectId)
      .eq("status", "active"),
    organizationIds.length
      ? admin
          .from("organization_memberships")
          .select("organization_id, user_id")
          .eq("status", "active")
          .in("organization_id", organizationIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (projectMembershipResult.error) throw projectMembershipResult.error
  if (organizationMembershipResult.error) throw organizationMembershipResult.error

  const projectMemberships = (projectMembershipResult.data ?? []) as Array<{
    organization_id: string | null
    user_id: string
  }>
  const organizationMemberships = (organizationMembershipResult.data ?? []) as Array<{
    organization_id: string
    user_id: string
  }>

  const candidateIds = Array.from(
    new Set([
      ...explicitlyLinkedIds,
      ...projectMemberships.map((membership) => membership.user_id),
      ...organizationMemberships.map((membership) => membership.user_id),
    ]),
  )

  if (candidateIds.length === 0) return new Map()

  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", candidateIds)
  if (profileError) throw profileError

  const profiles = (profileData ?? []) as ProfileRow[]
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile] as const))
  const projectUsers = new Set(projectMemberships.map((membership) => membership.user_id))
  const usersByOrganization = new Map<string, Set<string>>()

  for (const membership of [...projectMemberships, ...organizationMemberships]) {
    if (!membership.organization_id) continue
    const users = usersByOrganization.get(membership.organization_id) ?? new Set<string>()
    users.add(membership.user_id)
    usersByOrganization.set(membership.organization_id, users)
  }

  const resolved = new Map<string, ResolvedParticipantProfile>()

  for (const participant of participants) {
    const explicitlyLinked = participant.key_contact_user_id
      ? profilesById.get(participant.key_contact_user_id)
      : undefined
    if (explicitlyLinked) {
      resolved.set(participant.id, { ...explicitlyLinked, match: "linked" })
      continue
    }

    const permittedUserIds = participant.organization_id
      ? usersByOrganization.get(participant.organization_id) ?? new Set<string>()
      : projectUsers
    const scopedProfiles = profiles.filter((profile) => permittedUserIds.has(profile.id))

    const email = normalizeEmail(participant.key_contact_email)
    if (email) {
      const match = uniqueProfile(scopedProfiles.filter((profile) => normalizeEmail(profile.email) === email))
      if (match) {
        resolved.set(participant.id, { ...match, match: "email" })
        continue
      }
    }

    const name = normalizeName(participant.key_contact_name)
    if (name) {
      const match = uniqueProfile(scopedProfiles.filter((profile) => normalizeName(profile.full_name) === name))
      if (match) resolved.set(participant.id, { ...match, match: "name" })
    }
  }

  return resolved
}

export async function resolveParticipantProfile(
  admin: AdminClient,
  projectId: string,
  participant: ParticipantIdentity,
): Promise<ResolvedParticipantProfile | null> {
  return (await resolveParticipantProfiles(admin, projectId, [participant])).get(participant.id) ?? null
}
