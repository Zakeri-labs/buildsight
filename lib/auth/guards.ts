import "server-only"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export class AuthzError extends Error {
  constructor(message = "Not authorized") {
    super(message)
    this.name = "AuthzError"
  }
}

/** Returns the authenticated user id or throws. */
export async function getUserIdOrThrow(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new AuthzError("Not authenticated")
  return user.id
}

/**
 * Confirm the current user is an active org_admin of `organizationId`.
 * Uses the service-role client to read membership authoritatively, then
 * checks it against the *server-derived* user id (never a client value).
 */
export async function assertOrgAdmin(organizationId: string): Promise<string> {
  const userId = await getUserIdOrThrow()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("role", "org_admin")
    .eq("status", "active")
    .maybeSingle()
  if (error) throw error
  if (!data) throw new AuthzError("You must be an organization admin")
  return userId
}

/**
 * Confirm the current user can administer `projectId`: either a project_admin
 * user membership, or an org_admin of the project's supervising organization.
 */
export async function assertProjectAdmin(projectId: string): Promise<string> {
  const userId = await getUserIdOrThrow()
  const admin = createAdminClient()

  const { data: pum } = await admin
    .from("project_user_memberships")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("access_role", "project_admin")
    .eq("status", "active")
    .maybeSingle()
  if (pum) return userId

  const { data: project } = await admin
    .from("projects")
    .select("supervising_organization_id")
    .eq("id", projectId)
    .maybeSingle()
  if (!project) throw new AuthzError("Project not found")

  const { data: orgAdmin } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", project.supervising_organization_id)
    .eq("user_id", userId)
    .eq("role", "org_admin")
    .eq("status", "active")
    .maybeSingle()
  if (!orgAdmin) throw new AuthzError("You must be a project admin")
  return userId
}


/**
 * Confirm the current user can manage organization-level stage templates.
 * Organization admins/managers and project admins/managers within the
 * supervising organization are permitted.
 */
export async function assertStageManager(organizationId: string): Promise<string> {
  const userId = await getUserIdOrThrow()
  const admin = createAdminClient()

  const { data: orgManager, error: orgError } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["org_admin", "org_manager"])
    .maybeSingle()
  if (orgError) throw orgError
  if (orgManager) return userId

  const { data: projectMemberships, error: membershipError } = await admin
    .from("project_user_memberships")
    .select("project_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("access_role", ["project_admin", "project_manager"])
  if (membershipError) throw membershipError

  const projectIds = (projectMemberships ?? []).map((membership: any) => membership.project_id as string)
  if (projectIds.length > 0) {
    const { data: managedProject, error: projectError } = await admin
      .from("projects")
      .select("id")
      .in("id", projectIds)
      .eq("supervising_organization_id", organizationId)
      .limit(1)
      .maybeSingle()
    if (projectError) throw projectError
    if (managedProject) return userId
  }

  throw new AuthzError("You do not have permission to manage project stages")
}

/** Write an audit log entry (best-effort). */
export async function audit(entry: {
  actorId: string
  action: string
  entityType: string
  entityId?: string | null
  organizationId?: string | null
  projectId?: string | null
  metadata?: Record<string, unknown>
}) {
  const admin = createAdminClient()
  await admin.from("audit_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    organization_id: entry.organizationId ?? null,
    project_id: entry.projectId ?? null,
    metadata: entry.metadata ?? {},
  })
}
