import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"
import type { Organization, OrganizationRole, Profile } from "@/lib/db/types"

export type OrgMembership = {
  organization: Organization
  role: OrganizationRole
}

export type SessionContext = {
  userId: string
  email: string
  profile: Profile | null
  memberships: OrgMembership[]
  supervisingOrg: Organization | null
}

/**
 * Returns the authenticated user's identity and organization memberships.
 * Reads run through the RLS-scoped server client, so results are already
 * limited to what the user is allowed to see.
 * Deduplicated per-request via React cache().
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey || url.includes("placeholder")) {
    return null
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const [{ data: profile }, { data: memberRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase
        .from("organization_memberships")
        .select("role, organizations(*)")
        .eq("user_id", user.id)
        .eq("status", "active"),
    ])

    const memberships: OrgMembership[] = (memberRows ?? []).map((row: any) => ({
      role: row.role,
      organization: row.organizations,
    }))

    const supervisingOrg =
      memberships.find((m) => m.organization?.type === "supervising")?.organization ?? null

    return {
      userId: user.id,
      email: user.email ?? "",
      profile: (profile as Profile) ?? null,
      memberships,
      supervisingOrg,
    }
  } catch (error) {
    console.error(
      "getSession failed to resolve the request-scoped user:",
      error instanceof Error ? error.message : "Unknown error",
    )
    return null
  }
})

/** Require a signed-in user or redirect to login. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession()
  if (!session) redirect("/auth/login")
  return session
}

/** Require the user to belong to an org or invitation/project role, else send to onboarding. */
export async function requireOnboarded(): Promise<SessionContext> {
  const session = await requireSession()
  const resolution = await resolveUserEffectiveRole(session.userId, session.email)
  if (resolution.role === "unonboarded_creator") {
    redirect("/onboarding")
  }
  return session
}

export function isOrgAdmin(session: SessionContext, organizationId: string): boolean {
  return session.memberships.some(
    (m) => m.organization?.id === organizationId && m.role === "org_admin",
  )
}

/** Display name derived from profile.full_name, falling back to the email. */
export function displayName(session: SessionContext): string {
  return session.profile?.full_name?.trim() || session.email
}
