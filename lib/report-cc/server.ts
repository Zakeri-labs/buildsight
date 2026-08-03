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
      .select("key_contact_user_id, participant_role_label, project_role, organization_name, status")
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
    .select("id, full_name, email, avatar_url")
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
      return {
        id: profile.id,
        name: personName(profile),
        email: profile.email ?? null,
        avatarUrl: profile.avatar_url ?? null,
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
    .map((p) => {
      const id = p.keyContact.userId || p.id
      const contactName = p.keyContact.name && p.keyContact.name !== "Contact not provided"
        ? p.keyContact.name
        : p.organization
      const roleText = p.contractorRoleLabel
        ? `${p.projectRole} (${p.contractorRoleLabel})`
        : p.projectRole

      return {
        id,
        name: contactName,
        email: p.keyContact.email ?? null,
        avatarUrl: p.keyContact.avatar ?? null,
        role: roleText,
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
      ? admin.from("profiles").select("id, full_name, email, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    userIds.length ? loadProjectCcCandidates(projectId) : Promise.resolve([] as ProjectCcCandidate[]),
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
      createdAt: row.created_at,
    } satisfies ReportCcRecipient
  })
}

async function accessibleProjectIdsForUser(userId: string) {
  const admin = createAdminClient()
  const [{ data: projectMemberships }, { data: orgMemberships }] = await Promise.all([
    admin.from("project_user_memberships").select("project_id").eq("user_id", userId).eq("status", "active"),
    admin.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("status", "active"),
  ])
  const organizationIds = Array.from(new Set((orgMemberships ?? []).map((row: any) => row.organization_id as string)))
  const { data: orgProjects } = organizationIds.length
    ? await admin.from("projects").select("id").in("supervising_organization_id", organizationIds)
    : { data: [] as any[] }
  return Array.from(new Set([
    ...(projectMemberships ?? []).map((row: any) => row.project_id as string),
    ...(orgProjects ?? []).map((row: any) => row.id as string),
  ]))
}

export async function getReportCcNotificationFeed(input: {
  userId: string
  projectId: string | null
}): Promise<{ canNotify: boolean; items: ReportCcNotificationItem[] }> {
  const admin = createAdminClient()
  let projectIds = await accessibleProjectIdsForUser(input.userId)
  if (input.projectId) projectIds = projectIds.filter((id) => id === input.projectId)
  if (!projectIds.length) return { canNotify: false, items: [] }

  const { data: recipientRows, error: recipientError } = await admin
    .from("report_cc_recipients")
    .select("id, project_id, response_id, recipient_context, added_by, created_at")
    .eq("recipient_type", "internal")
    .eq("user_id", input.userId)
    .in("project_id", projectIds)
    .order("created_at", { ascending: false })
    .limit(50)
  if (recipientError) {
    if (recipientError.code === "42P01") return { canNotify: false, items: [] }
    throw recipientError
  }
  if (!recipientRows?.length) return { canNotify: true, items: [] }

  const responseIds = Array.from(new Set(recipientRows.map((row: any) => row.response_id as string)))
  const { data: responses, error: responseError } = await admin
    .from("term_responses")
    .select("id, project_id, project_stage_term_id, report_number, report_title")
    .in("id", responseIds)
  if (responseError) throw responseError
  const termIds = Array.from(new Set((responses ?? []).map((row: any) => row.project_stage_term_id as string)))
  const { data: terms, error: termError } = termIds.length
    ? await admin.from("project_stage_terms").select("id, report_name, project_stage_id").in("id", termIds)
    : { data: [] as any[], error: null }
  if (termError) throw termError
  const stageIds = Array.from(new Set((terms ?? []).map((row: any) => row.project_stage_id as string)))
  const actorIds = Array.from(new Set(recipientRows.map((row: any) => row.added_by as string).filter(Boolean)))
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
    const term = termById.get(response.project_stage_term_id)
    const stage = term ? stageById.get(term.project_stage_id) : null
    const project = projectById.get(response.project_id)
    if (!term || !stage || !project) continue
    const actor = recipient.added_by ? actorById.get(recipient.added_by) : null
    const translateSuffix = recipient.recipient_context === "translation" ? "/translate" : ""
    items.push({
      id: recipient.id,
      notificationKey: `report-cc:${recipient.id}:${recipient.created_at}`,
      context: recipient.recipient_context,
      projectId: response.project_id,
      projectName: project.name,
      stageName: stage.name,
      termName: term.report_name,
      reportId: response.id,
      reportNumber: response.report_number,
      reportTitle: response.report_title,
      addedById: recipient.added_by ?? null,
      addedByName: personName(actor),
      createdAt: recipient.created_at,
      href: `/projects/${response.project_id}/stages/${stage.id}/terms/${term.id}/reports/${response.id}${translateSuffix}`,
    })
  }
  return { canNotify: true, items }
}
