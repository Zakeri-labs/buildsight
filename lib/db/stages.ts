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


export type StageTermRecord = {
  id: string
  stageId: string
  parentTermId: string | null
  reportName: string
  required: boolean
  approvalRequired: boolean
  responseType: import("@/lib/stages/execution").SubtermResponseType
  instructions: string | null
  status: "active" | "disabled"
  sortOrder: number
  createdAt: string
  updatedAt: string
  subterms: StageTermRecord[]
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
  terms: StageTermRecord[]
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
    .maybeSingle()

  if (orgMembershipError) return false
  if (orgMembership) return true

  const { data: projectMemberships, error: membershipError } = await admin
    .from("project_user_memberships")
    .select("project_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("access_role", ["project_admin", "project_manager"])
  if (membershipError) return false

  const projectIds = (projectMemberships ?? []).map((membership: any) => membership.project_id as string)
  if (projectIds.length === 0) return false

  const { data: managedProject, error: projectError } = await admin
    .from("projects")
    .select("id")
    .in("id", projectIds)
    .eq("supervising_organization_id", organizationId)
    .limit(1)
    .maybeSingle()

  return !projectError && Boolean(managedProject)
}

export async function loadStageManagement(organizationId: string): Promise<StageManagementData> {
  const admin = createAdminClient()

  const [{ data: stageRows, error: stageError }, { data: termRows, error: termError }] = await Promise.all([
    admin
      .from("stages")
      .select("id, organization_id, name, description, is_active, sort_order, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("stage_terms")
      .select(
        "id, stage_id, parent_term_id, report_name, is_required, approval_required, response_type, instructions, status, sort_order, created_at, updated_at, stages!inner(organization_id, is_active)",
      )
      .eq("stages.organization_id", organizationId)
      .eq("stages.is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ])

  if (stageError) throw stageError
  if (termError) throw termError

  const termMap = new Map<string, StageTermRecord>()
  for (const term of termRows ?? []) {
    termMap.set(term.id, {
      id: term.id,
      stageId: term.stage_id,
      parentTermId: term.parent_term_id,
      reportName: term.report_name,
      required: term.is_required,
      approvalRequired: term.approval_required,
      responseType: term.response_type ?? "combined",
      instructions: typeof term.instructions === "string" && term.instructions.trim() ? term.instructions : null,
      status: term.status,
      sortOrder: term.sort_order,
      createdAt: term.created_at,
      updatedAt: term.updated_at,
      subterms: [],
    })
  }

  for (const term of termMap.values()) {
    if (!term.parentTermId) continue
    const parent = termMap.get(term.parentTermId)
    if (parent && parent.stageId === term.stageId) parent.subterms.push(term)
  }
  for (const term of termMap.values()) {
    term.subterms.sort((a, b) => a.sortOrder - b.sortOrder || a.reportName.localeCompare(b.reportName))
  }

  const termsByStage = new Map<string, StageTermRecord[]>()
  for (const term of termMap.values()) {
    if (term.parentTermId) continue
    const current = termsByStage.get(term.stageId) ?? []
    current.push(term)
    termsByStage.set(term.stageId, current)
  }
  for (const terms of termsByStage.values()) {
    terms.sort((a, b) => a.sortOrder - b.sortOrder || a.reportName.localeCompare(b.reportName))
  }

  return {
    stages: (stageRows ?? []).map((stage: any) => ({
      id: stage.id,
      organizationId: stage.organization_id,
      name: stage.name,
      description: stage.description,
      active: stage.is_active,
      sortOrder: stage.sort_order,
      createdAt: stage.created_at,
      updatedAt: stage.updated_at,
      terms: termsByStage.get(stage.id) ?? [],
    })),
  }
}
