type MembershipLike = {
  role: string
  organization: { id: string; name: string; type: string } | null
}

export type DesignGalleryAdminOrg = { id: string; name: string }

/**
 * The organization whose design gallery the signed-in user may manage:
 * one where they are org_admin, preferring the supervising organization
 * (the consultancy that owns the gallery). Never taken from client input.
 */
export function pickDesignGalleryAdminOrg(memberships: readonly MembershipLike[]): DesignGalleryAdminOrg | null {
  // Sorted so the same user always gets the same organization, whatever order the database returns.
  const adminOf = memberships
    .filter((m) => m.role === "org_admin" && m.organization?.id)
    .sort((a, b) => (a.organization!.id < b.organization!.id ? -1 : 1))
  const preferred = adminOf.find((m) => m.organization?.type === "supervising") ?? adminOf[0]
  return preferred?.organization ? { id: preferred.organization.id, name: preferred.organization.name } : null
}
