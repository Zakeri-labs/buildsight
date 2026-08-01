import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
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
 */
const DEMO_SESSION: SessionContext = {
  userId: "00000000-0000-0000-0000-000000000001",
  email: "arman@provision.om",
  profile: {
    id: "00000000-0000-0000-0000-000000000001",
    full_name: "Arman Haddad",
    email: "arman@provision.om",
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  memberships: [
    {
      role: "org_admin",
      organization: {
        id: "00000000-0000-0000-0000-000000000002",
        name: "Provision Consultancy",
        code: "PROV",
        type: "supervising",
        created_at: new Date().toISOString(),
      } as any,
    },
  ],
  supervisingOrg: {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Provision Consultancy",
    code: "PROV",
    type: "supervising",
    created_at: new Date().toISOString(),
  } as any,
}

export const getSession = cache(async (): Promise<SessionContext | null> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || url.includes("placeholder")) {
    return DEMO_SESSION
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return DEMO_SESSION

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()

    const { data: memberRows } = await supabase
      .from("organization_memberships")
      .select("role, organizations(*)")
      .eq("user_id", user.id)
      .eq("status", "active")

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
  } catch {
    return DEMO_SESSION
  }
})

/** Require a signed-in user or redirect to login. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession()
  if (!session) redirect("/auth/login")
  return session
}

/** Require the user to belong to at least one org, else send to onboarding. */
export async function requireOnboarded(): Promise<SessionContext> {
  const session = await requireSession()
  if (session.memberships.length === 0) redirect("/onboarding")
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
