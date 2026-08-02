import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { ORGANIZATION_REVIEW_ROLES, PROJECT_REVIEW_ACCESS_ROLES } from "@/lib/auth/guards"
import type { ReviewSubmissionFeed, ReviewSubmissionItem, ReviewSubmissionStatus } from "@/lib/review-submissions/types"

function displayPerson(profile: any) { return profile?.full_name?.trim() || profile?.email?.trim() || "Unknown user" }

export async function getReviewSubmissionFeed(input: { userId: string; organizationId: string; projectId: string | null }): Promise<ReviewSubmissionFeed> {
  const admin = createAdminClient()
  let projectQuery = admin.from("projects").select("id, name").eq("supervising_organization_id", input.organizationId)
  if (input.projectId) projectQuery = projectQuery.eq("id", input.projectId)
  const { data: scopedProjects, error: projectsError } = await projectQuery
  if (projectsError) throw projectsError
  const projects = scopedProjects ?? []
  const candidateProjectIds = projects.map((project: any) => project.id as string)
  if (!candidateProjectIds.length) return { canReview: false, items: [] }

  const { data: orgMembership, error: orgError } = await admin.from("organization_memberships").select("id").eq("organization_id", input.organizationId).eq("user_id", input.userId).eq("status", "active").in("role", [...ORGANIZATION_REVIEW_ROLES]).limit(1).maybeSingle()
  if (orgError) throw orgError
  let reviewableProjectIds = candidateProjectIds
  if (!orgMembership) {
    const { data: memberships, error } = await admin.from("project_user_memberships").select("project_id").eq("user_id", input.userId).eq("status", "active").in("access_role", [...PROJECT_REVIEW_ACCESS_ROLES]).in("project_id", candidateProjectIds)
    if (error) throw error
    reviewableProjectIds = Array.from(new Set((memberships ?? []).map((row: any) => row.project_id as string)))
  }
  if (!reviewableProjectIds.length) return { canReview: false, items: [] }

  const { data: responses, error: responseError } = await admin.from("term_responses").select("id, project_id, project_stage_id, report_number, report_title, status, submitted_at, updated_at, created_by, updated_by").in("project_id", reviewableProjectIds).in("status", ["submitted", "under_review"])
  if (responseError) throw responseError
  if (!responses?.length) return { canReview: true, items: [] }

  const stageIds = Array.from(new Set(responses.map((row: any) => row.project_stage_id as string).filter(Boolean)))
  const submitterIds = Array.from(new Set(responses.map((row: any) => (row.updated_by || row.created_by) as string).filter(Boolean)))
  const [{ data: stages, error: stageError }, { data: profiles, error: profileError }] = await Promise.all([
    admin.from("project_stages").select("id, project_id, name").in("id", stageIds),
    submitterIds.length ? admin.from("profiles").select("id, full_name, email").in("id", submitterIds) : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (stageError) throw stageError
  if (profileError) throw profileError
  const projectById = new Map<string, string>(projects.map((project: any) => [project.id as string, project.name as string]))
  const stageById = new Map<string, { id: string; project_id: string; name: string }>(
    (stages ?? []).map((stage: any) => [stage.id as string, stage]),
  )
  const profileById = new Map<string, { id: string; full_name?: string | null; email?: string | null }>(
    (profiles ?? []).map((profile: any) => [profile.id as string, profile]),
  )

  const items: ReviewSubmissionItem[] = []
  for (const response of responses as any[]) {
    const stage = stageById.get(response.project_stage_id)
    if (!stage || stage.project_id !== response.project_id) continue
    const submittedAt = response.submitted_at || response.updated_at
    const submittedById = response.updated_by || response.created_by || null
    items.push({
      id: response.id,
      notificationKey: `${response.id}:${submittedAt}`,
      projectId: response.project_id,
      projectName: projectById.get(response.project_id) ?? "Unknown project",
      stageId: stage.id,
      stageName: stage.name,
      submittedById,
      submittedBy: displayPerson(submittedById ? profileById.get(submittedById) : null),
      submittedAt,
      status: response.status as ReviewSubmissionStatus,
      reportNumber: response.report_number ?? null,
      reportTitle: response.report_title || "Report",
      href: `/projects/${response.project_id}/stages/${stage.id}/reports/${response.id}`,
    })
  }
  items.sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
  return { canReview: true, items }
}
