import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"


export type StageManagementOrganization = {
  id: string
  name: string
  type: string
}

/**
 * Resolve the supervising organization whose stage library the current user
 * may manage. This supports both organization-level managers and users whose
 * permission comes only from a project admin/manager membership.
 */
export async function resolveStageManagementOrganization(
  userId: string,
  preferredOrganizationId?: string | null,
): Promise<StageManagementOrganization | null> {
  const admin = createAdminClient()

  async function readOrganization(organizationId: string) {
    const { data, error } = await admin
      .from("organizations")
      .select("id, name, type")
      .eq("id", organizationId)
      .eq("type", "supervising")
      .maybeSingle()
    if (error) return null
    return (data as StageManagementOrganization | null) ?? null
  }

  if (preferredOrganizationId && (await canManageStageTemplates(preferredOrganizationId, userId))) {
    const preferred = await readOrganization(preferredOrganizationId)
    if (preferred) return preferred
  }

  const { data: organizationMemberships, error: organizationMembershipError } = await admin
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["org_admin", "org_manager"])
  if (!organizationMembershipError) {
    for (const membership of organizationMemberships ?? []) {
      const organization = await readOrganization(membership.organization_id)
      if (organization) return organization
    }
  }

  const { data: projectMemberships, error: projectMembershipError } = await admin
    .from("project_user_memberships")
    .select("project_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("access_role", ["project_admin", "project_manager"])
  if (projectMembershipError) return null

  const projectIds = Array.from(
    new Set((projectMemberships ?? []).map((membership: any) => membership.project_id as string)),
  )
  if (projectIds.length === 0) return null

  const { data: projects, error: projectError } = await admin
    .from("projects")
    .select("supervising_organization_id")
    .in("id", projectIds)
    .order("created_at", { ascending: true })
  if (projectError) return null

  for (const project of projects ?? []) {
    const organization = await readOrganization(project.supervising_organization_id)
    if (organization) return organization
  }

  return null
}


export type StageRecord = {
  id: string
  organizationId: string
  name: string
  description: string | null
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type StageManagementData = {
  stages: StageRecord[]
}

export async function canManageStageTemplates(organizationId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: orgMembership, error: orgMembershipError } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["org_admin", "org_manager"])
    .limit(1)
    .maybeSingle()
  if (!orgMembershipError && orgMembership) return true

  const { data: projects, error: projectsError } = await admin
    .from("projects")
    .select("id")
    .eq("supervising_organization_id", organizationId)
  if (projectsError || !projects?.length) return false
  const { data: membership, error: membershipError } = await admin
    .from("project_user_memberships")
    .select("id")
    .in("project_id", projects.map((project: any) => project.id))
    .eq("user_id", userId)
    .eq("status", "active")
    .in("access_role", ["project_admin", "project_manager"])
    .limit(1)
    .maybeSingle()
  return !membershipError && Boolean(membership)
}

export async function loadStageManagement(organizationId: string): Promise<StageManagementData> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("stages")
    .select("id, organization_id, name, description, is_active, sort_order, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true })
  if (error) throw error
  return {
    stages: (data ?? []).map((stage: any) => ({
      id: stage.id,
      organizationId: stage.organization_id,
      name: stage.name,
      description: stage.description,
      active: stage.is_active !== false,
      sortOrder: stage.sort_order,
      createdAt: stage.created_at,
      updatedAt: stage.updated_at,
    })),
  }
}
