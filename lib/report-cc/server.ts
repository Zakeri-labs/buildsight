import "server-only"

import { assertProjectMember } from "@/lib/auth/guards"
import { roleLabel } from "@/lib/db/types"
import { getProjectParticipants } from "@/lib/db/project-participants"
import { createAdminClient } from "@/lib/supabase/admin"
import type {
  ProjectCcCandidate,
  ReportCcContext,
  ReportCcNotificationItem,
  ReportCcRecipient,
} from "@/lib/report-cc/types"

function personName(profile: any) {
  return profile?.full_name?.trim() || profile?.email?.trim() || "Project member"
}

function normalizedRole(value: string | null | undefined) {
  if (!value?.trim()) return "Project Member"
  return roleLabel(value.trim())
}

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function asUuid(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return UUID_PATTERN.test(normalized) ? normalized : null
}

function validUuidList(values: unknown[]): string[] {
  return Array.from(new Set(values.map(asUuid).filter((value): value is string => Boolean(value))))
}

export async function loadProjectCcCandidates(projectId: string): Promise<ProjectCcCandidate[]> {
  await assertProjectMember(projectId)
  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("supervising_organization_id")
    .eq("id", projectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project) return []

  const [{ data: participants, error: participantError }, { data: projectMembers, error: projectMemberError }, { data: orgMembers, error: orgMemberError }] = await Promise.all([
    admin
      .from("project_participants")
      .select("key_contact_user_id, participant_role_label, project_role, organization_name, status, key_contact_phone")
      .eq("project_id", projectId)
      .eq("status", "active")
      .not("key_contact_user_id", "is", null),
    admin
      .from("project_user_memberships")
      .select("user_id, access_role")
      .eq("project_id", projectId)
      .eq("status", "active"),
    admin
      .from("organization_memberships")
      .select("user_id, role")
      .eq("organization_id", project.supervising_organization_id)
      .eq("status", "active"),
  ])
  if (participantError) throw participantError
  if (projectMemberError) throw projectMemberError
  if (orgMemberError) throw orgMemberError

  const userIds = Array.from(new Set([
    ...(participants ?? []).map((row: any) => row.key_contact_user_id).filter(Boolean),
    ...(projectMembers ?? []).map((row: any) => row.user_id).filter(Boolean),
    ...(orgMembers ?? []).map((row: any) => row.user_id).filter(Boolean),
  ])) as string[]
  if (!userIds.length) return []

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, email, avatar_url, phone")
    .in("id", userIds)
  if (profileError) throw profileError

  const participantByUser = new Map<string, any>()
  for (const participant of participants ?? []) {
    if (!participant.key_contact_user_id || participantByUser.has(participant.key_contact_user_id)) continue
    participantByUser.set(participant.key_contact_user_id, participant)
  }
  const projectMemberByUser = new Map<string, any>((projectMembers ?? []).map((row: any) => [row.user_id as string, row]))
  const orgMemberByUser = new Map<string, any>((orgMembers ?? []).map((row: any) => [row.user_id as string, row]))

  return (profiles ?? [])
    .map((profile: any) => {
      const participant = participantByUser.get(profile.id)
      const projectMember = projectMemberByUser.get(profile.id)
      const orgMember = orgMemberByUser.get(profile.id)
      const rawRole = participant?.participant_role_label || participant?.project_role || projectMember?.access_role || orgMember?.role
      const phone = participant?.key_contact_phone?.trim() || profile?.phone?.trim() || null
      return {
        id: profile.id,
        name: personName(profile),
        email: profile.email ?? null,
        avatarUrl: profile.avatar_url ?? null,
        phone,
        isExternalContact: false,
        role: normalizedRole(rawRole),
        organizationName: participant?.organization_name?.trim() || null,
      } satisfies ProjectCcCandidate
    })
    .sort((left: ProjectCcCandidate, right: ProjectCcCandidate) => left.name.localeCompare(right.name))
}

/**
 * Returns only project participants (contractor, owner, consultant, etc.)
 * excluding internal team members and organization members.
 * Used for the Report to / CC to dropdowns.
 */
export async function loadProjectParticipantsOnly(projectId: string): Promise<ProjectCcCandidate[]> {
  await assertProjectMember(projectId)
  const participants = await getProjectParticipants(projectId)

  return participants
    .map((p, index) => {
      const id = p.keyContact.userId || p.id
      const savedContactName = p.keyContact.name?.trim() || ""
      const phone = p.keyContact.phone?.trim() || null
      const hasUsableContactName = Boolean(
        savedContactName &&
        savedContactName !== "Contact not provided" &&
        savedContactName !== phone,
      )
      const contactName = hasUsableContactName ? savedContactName : p.organization
      const roleText = p.contractorRoleLabel
        ? `${p.projectRole} (${p.contractorRoleLabel})`
        : p.projectRole

      return {
        id,
        name: contactName,
        email: p.keyContact.email ?? null,
        avatarUrl: p.keyContact.avatar ?? null,
        phone,
        isExternalContact: p.isExternalContact,
        role: roleText,
        roleKey: p.projectRole,
        defaultPriority: index,
        organizationName: p.organization,
      } satisfies ProjectCcCandidate
    })
    .sort((left: ProjectCcCandidate, right: ProjectCcCandidate) => left.name.localeCompare(right.name))
}

export async function loadReportCcRecipients(
  projectId: string,
  responseId: string,
  context: ReportCcContext,
): Promise<ReportCcRecipient[]> {
  await assertProjectMember(projectId)
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from("report_cc_recipients")
    .select("id, recipient_context, recipient_type, user_id, external_name, external_email, external_company, external_role, created_at")
    .eq("project_id", projectId)
    .eq("response_id", responseId)
    .eq("recipient_context", context)
    .order("created_at", { ascending: true })
  if (error) {
    if (error.code === "42P01") return []
    throw error
  }

  const userIds = Array.from(new Set((rows ?? []).map((row: any) => row.user_id).filter(Boolean))) as string[]
  const [{ data: profiles, error: profileError }, candidates] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id, full_name, email, avatar_url, phone").in("id", userIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    userIds.length
      ? Promise.all([loadProjectCcCandidates(projectId), loadProjectParticipantsOnly(projectId)]).then(([c1, c2]) => {
          const map = new Map<string, ProjectCcCandidate>()
          c1.forEach((c) => map.set(c.id, c))
          c2.forEach((c) => map.set(c.id, c))
          return Array.from(map.values())
        })
      : Promise.resolve([] as ProjectCcCandidate[]),
  ])
  if (profileError) throw profileError
  const profileById = new Map<string, any>((profiles ?? []).map((profile: any) => [profile.id as string, profile]))
  const candidateById = new Map<string, ProjectCcCandidate>(candidates.map((candidate) => [candidate.id, candidate]))

  return (rows ?? []).map((row: any) => {
    const profile = row.user_id ? profileById.get(row.user_id) : null
    const candidate = row.user_id ? candidateById.get(row.user_id) : null
    return {
      id: row.id,
      context: row.recipient_context,
      type: row.recipient_type,
      userId: row.user_id ?? null,
      name: row.recipient_type === "internal" ? personName(profile) : row.external_name,
      email: row.recipient_type === "internal" ? profile?.email ?? null : row.external_email,
      company: row.recipient_type === "internal" ? candidate?.organizationName ?? null : row.external_company ?? null,
      role: row.recipient_type === "internal" ? candidate?.role ?? null : row.external_role ?? null,
      avatarUrl: row.recipient_type === "internal" ? profile?.avatar_url ?? null : null,
      phone: row.recipient_type === "internal" ? candidate?.phone ?? profile?.phone ?? null : (row.external_phone ?? null),
      createdAt: row.created_at,
    } satisfies ReportCcRecipient
  })
}

async function accessibleProjectIdsForUser(userId: string) {
  const validUserId = asUuid(userId)
  if (!validUserId) return []

  const admin = createAdminClient()
  const [{ data: projectMemberships, error: projectMembershipError }, { data: orgMemberships, error: orgMembershipError }, { data: ownerRows, error: ownerError }] = await Promise.all([
    admin.from("project_user_memberships").select("project_id").eq("user_id", validUserId).eq("status", "active"),
    admin.from("organization_memberships").select("organization_id, role").eq("user_id", validUserId).eq("status", "active"),
    admin.from("project_owners").select("project_id").eq("viewer_user_id", validUserId),
  ])
  if (projectMembershipError) throw projectMembershipError
  if (orgMembershipError) throw orgMembershipError
  if (ownerError) throw ownerError

  const viewerOrgIds = new Set(
    (orgMemberships ?? [])
      .filter((row: any) => row.role === "viewer")
      .map((row: any) => row.organization_id as string),
  )
  const nonViewerOrgIds = validUuidList(
    (orgMemberships ?? [])
      .filter((row: any) => row.role !== "viewer")
      .map((row: any) => row.organization_id),
  )
  const viewerOwnedIds = new Set(validUuidList((ownerRows ?? []).map((row: any) => row.project_id)))

  const { data: orgProjects, error: orgProjectsError } = nonViewerOrgIds.length
    ? await admin.from("projects").select("id").in("supervising_organization_id", nonViewerOrgIds)
    : { data: [] as any[], error: null }
  if (orgProjectsError) throw orgProjectsError

  const directProjectIds = validUuidList((projectMemberships ?? []).map((row: any) => row.project_id))
  const { data: directProjects, error: directProjectsError } = directProjectIds.length
    ? await admin.from("projects").select("id, supervising_organization_id").in("id", directProjectIds)
    : { data: [] as any[], error: null }
  if (directProjectsError) throw directProjectsError

  const allowedDirectIds = (directProjects ?? [])
    .filter((project: any) => !viewerOrgIds.has(project.supervising_organization_id) || viewerOwnedIds.has(project.id))
    .map((project: any) => project.id)

  return validUuidList([
    ...(orgProjects ?? []).map((row: any) => row.id),
    ...allowedDirectIds,
    ...Array.from(viewerOwnedIds),
  ])
}

export async function getReportCcNotificationFeed(input: {
  userId: string
  projectId: string | null
}): Promise<{ canNotify: boolean; items: ReportCcNotificationItem[] }> {
  const validUserId = asUuid(input.userId)
  if (!validUserId) return { canNotify: false, items: [] }

  const requestedProjectId = input.projectId === null ? null : asUuid(input.projectId)
  if (input.projectId !== null && !requestedProjectId) return { canNotify: false, items: [] }

  const admin = createAdminClient()
  let projectIds = await accessibleProjectIdsForUser(validUserId)
  if (requestedProjectId) projectIds = projectIds.filter((id) => id === requestedProjectId)
  if (!projectIds.length) return { canNotify: false, items: [] }

  const { data: recipientRows, error: recipientError } = await admin
    .from("report_cc_recipients")
    .select("id, project_id, response_id, recipient_context, added_by, created_at")
    .eq("recipient_type", "internal")
    .eq("user_id", validUserId)
    .in("project_id", projectIds)
    .order("created_at", { ascending: false })
    .limit(50)
  if (recipientError) {
    if (recipientError.code === "42P01") return { canNotify: false, items: [] }
    throw recipientError
  }
  if (!recipientRows?.length) return { canNotify: true, items: [] }

  const responseIds = validUuidList(recipientRows.map((row: any) => row.response_id))
  if (!responseIds.length) return { canNotify: true, items: [] }

  const { data: responses, error: responseError } = await admin
    .from("term_responses")
    .select("id, project_id, project_stage_id, project_stage_term_id, report_number, report_title")
    .in("id", responseIds)
  if (responseError) throw responseError

  // Stage-based responses intentionally have no project_stage_term_id. Filter
  // nullable term ids before the UUID query and resolve their stage directly.
  const termIds = validUuidList((responses ?? []).map((row: any) => row.project_stage_term_id))
  const { data: terms, error: termError } = termIds.length
    ? await admin.from("project_stage_terms").select("id, report_name, project_stage_id").in("id", termIds)
    : { data: [] as any[], error: null }
  if (termError) throw termError

  const stageIds = validUuidList([
    ...(terms ?? []).map((row: any) => row.project_stage_id),
    ...(responses ?? []).map((row: any) => row.project_stage_id),
  ])
  const actorIds = validUuidList(recipientRows.map((row: any) => row.added_by))
  const [{ data: stages, error: stageError }, { data: projects, error: projectError }, { data: actors, error: actorError }] = await Promise.all([
    stageIds.length ? admin.from("project_stages").select("id, name").in("id", stageIds) : Promise.resolve({ data: [] as any[], error: null }),
    admin.from("projects").select("id, name").in("id", projectIds),
    actorIds.length ? admin.from("profiles").select("id, full_name, email").in("id", actorIds) : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (stageError) throw stageError
  if (projectError) throw projectError
  if (actorError) throw actorError

  const responseById = new Map<string, any>((responses ?? []).map((row: any) => [row.id as string, row]))
  const termById = new Map<string, any>((terms ?? []).map((row: any) => [row.id as string, row]))
  const stageById = new Map<string, any>((stages ?? []).map((row: any) => [row.id as string, row]))
  const projectById = new Map<string, any>((projects ?? []).map((row: any) => [row.id as string, row]))
  const actorById = new Map<string, any>((actors ?? []).map((row: any) => [row.id as string, row]))

  const items: ReportCcNotificationItem[] = []
  for (const recipient of recipientRows as any[]) {
    const response = responseById.get(recipient.response_id)
    if (!response || response.project_id !== recipient.project_id) continue

    const termId = asUuid(response.project_stage_term_id)
    const term = termId ? termById.get(termId) : null
    const stageId = asUuid(term?.project_stage_id) ?? asUuid(response.project_stage_id)
    const stage = stageId ? stageById.get(stageId) : null
    const project = projectById.get(response.project_id)
    if (!stage || !project) continue

    const actor = recipient.added_by ? actorById.get(recipient.added_by) : null
    const translateSuffix = recipient.recipient_context === "translation" ? "/translate" : ""
    const reportPath = term
      ? `/projects/${response.project_id}/stages/${stage.id}/terms/${term.id}/reports/${response.id}`
      : `/projects/${response.project_id}/stages/${stage.id}/reports/${response.id}`

    items.push({
      id: recipient.id,
      notificationKey: `report-cc:${recipient.id}:${recipient.created_at}`,
      context: recipient.recipient_context,
      projectId: response.project_id,
      projectName: project.name,
      stageName: stage.name,
      termName: term?.report_name ?? response.report_title ?? stage.name,
      reportId: response.id,
      reportNumber: response.report_number ?? "",
      reportTitle: response.report_title ?? stage.name,
      addedById: recipient.added_by ?? null,
      addedByName: personName(actor),
      createdAt: recipient.created_at,
      href: `${reportPath}${translateSuffix}`,
    })
  }
  return { canNotify: true, items }
}
