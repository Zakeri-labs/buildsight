type MembershipLike = {
  role: string
  organization: { id: string; name: string; type: string } | null
}

export type DesignGalleryAdminOrg = { id: string; name: string }

export function isDesignGalleryAdminRole(role: string | null | undefined): boolean {
  return role === "org_admin" || role === "architect_administrator"
}

/**
 * The organization whose design gallery the signed-in user may manage:
 * one where they are org_admin or architect_administrator, preferring the supervising organization
 * (the consultancy that owns the gallery). Never taken from client input.
 */
export function pickDesignGalleryAdminOrg(memberships: readonly MembershipLike[]): DesignGalleryAdminOrg | null {
  // Sorted so the same user always gets the same organization, whatever order the database returns.
  const adminOf = memberships
    .filter((m) => isDesignGalleryAdminRole(m.role) && m.organization?.id)
    .sort((a, b) => (a.organization!.id < b.organization!.id ? -1 : 1))
  const preferred = adminOf.find((m) => m.organization?.type === "supervising") ?? adminOf[0]
  return preferred?.organization ? { id: preferred.organization.id, name: preferred.organization.name } : null
}
