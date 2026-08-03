import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { ORGANIZATION_REVIEW_ROLES, PROJECT_REVIEW_ACCESS_ROLES } from "@/lib/auth/guards"
import type { ReviewSubmissionFeed, ReviewSubmissionItem, ReviewSubmissionStatus } from "@/lib/review-submissions/types"

function displayPerson(profile: any) {
  return profile?.full_name?.trim() || profile?.email?.trim() || "Unknown user"
}

async function processReviewResponses(
  responses: any[],
  projects: any[],
  admin: ReturnType<typeof createAdminClient>,
): Promise<ReviewSubmissionFeed> {
  const termIds = Array.from(new Set(responses.map((r: any) => r.project_stage_term_id as string).filter(Boolean)))
  if (!termIds.length) return { canReview: true, items: [] }

  const { data: termRows, error: termError } = await admin
    .from("project_stage_terms")
    .select("id, report_name, parent_term_id, project_stage_id")
    .in("id", termIds)
  if (termError) throw termError

  const parentIds = Array.from(new Set((termRows ?? []).map((term: any) => term.parent_term_id as string | null).filter(Boolean))) as string[]
  const stageIds = Array.from(new Set((termRows ?? []).map((term: any) => term.project_stage_id as string)))

  let parentRows: any[] = []
  let stageRows: any[] = []
  if (parentIds.length) {
    const { data, error } = await admin.from("project_stage_terms").select("id, report_name").in("id", parentIds)
    if (error) throw error
    parentRows = data ?? []
  }
  if (stageIds.length) {
    const { data, error } = await admin.from("project_stages").select("id, project_id, name").in("id", stageIds)
    if (error) throw error
    stageRows = data ?? []
  }

  const submitterIds = Array.from(new Set(responses.map((r: any) => (r.updated_by || r.created_by) as string | null).filter(Boolean))) as string[]
  let profiles: any[] = []
  if (submitterIds.length) {
    const { data, error } = await admin.from("profiles").select("id, full_name, email").in("id", submitterIds)
    if (error) throw error
    profiles = data ?? []
  }

  const projectById = new Map<string, string>(projects.map((p: any) => [p.id as string, p.name as string]))
  const termById = new Map<string, any>((termRows ?? []).map((t: any) => [t.id as string, t]))
  const parentById = new Map<string, any>(parentRows.map((t: any) => [t.id as string, t]))
  const stageById = new Map<string, any>(stageRows.map((s: any) => [s.id as string, s]))
  const profileById = new Map<string, any>(profiles.map((p: any) => [p.id as string, p]))

  const items: ReviewSubmissionItem[] = []
  for (const response of responses) {
    const term = termById.get(response.project_stage_term_id)
    if (!term) continue
    const stage = stageById.get(term.project_stage_id)
    if (!stage || stage.project_id !== response.project_id) continue
    const submittedAt = response.submitted_at || response.updated_at
    const submitterId = (response.updated_by || response.created_by || null) as string | null
    const parent = term.parent_term_id ? parentById.get(term.parent_term_id) : null
    items.push({
      id: response.id,
      notificationKey: `${response.id}:${submittedAt}`,
      projectId: response.project_id,
      projectName: projectById.get(response.project_id) ?? "Unknown project",
      stageId: stage.id,
      stageName: stage.name,
      termId: term.id,
      parentTermName: parent?.report_name ?? term.report_name,
      subtermName: parent ? term.report_name : null,
      submittedById: submitterId,
      submittedBy: displayPerson(submitterId ? profileById.get(submitterId) : null),
      submittedAt,
      status: response.status as ReviewSubmissionStatus,
      reportNumber: response.report_number ?? null,
      reportTitle: response.report_title || term.report_name,
      href: `/projects/${response.project_id}/stages/${stage.id}/terms/${term.id}/reports/${response.id}`,
    })
  }

  items.sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
  return { canReview: true, items }
}

export async function getReviewSubmissionFeed(input: {
  userId: string
  organizationId: string
  projectId: string | null
}): Promise<ReviewSubmissionFeed> {
  try {
    const admin = createAdminClient()
    let projectQuery = admin
      .from("projects")
      .select("id, name")
      .eq("supervising_organization_id", input.organizationId)

    if (input.projectId) projectQuery = projectQuery.eq("id", input.projectId)
    const { data: scopedProjects, error: projectsError } = await projectQuery
    if (projectsError) throw projectsError

    const projects = scopedProjects ?? []
    const candidateProjectIds = projects.map((p: any) => p.id as string)
    if (!candidateProjectIds.length) return { canReview: false, items: [] }

    const { data: orgMembership, error: orgError } = await admin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.userId)
      .eq("status", "active")
      .in("role", [...ORGANIZATION_REVIEW_ROLES])
      .limit(1)
      .maybeSingle()
    if (orgError) throw orgError

    let reviewableProjectIds = candidateProjectIds
    if (!orgMembership) {
      const { data: memberships, error: membershipError } = await admin
        .from("project_user_memberships")
        .select("project_id")
        .eq("user_id", input.userId)
        .eq("status", "active")
        .in("access_role", [...PROJECT_REVIEW_ACCESS_ROLES])
        .in("project_id", candidateProjectIds)
      if (membershipError) throw membershipError
      reviewableProjectIds = Array.from(new Set((memberships ?? []).map((m: any) => m.project_id as string)))
    }

    if (!reviewableProjectIds.length) return { canReview: false, items: [] }

    const { data: responses, error: responseError } = await admin
      .from("term_responses")
      .select("id, project_id, project_stage_term_id, report_number, report_title, status, submitted_at, updated_at, created_by, updated_by")
      .in("project_id", reviewableProjectIds)
      .in("status", ["submitted", "under_review"])

    if (responseError) {
      // PostgreSQL error 42703 = column does not exist
      // Fall back to minimal columns for forward/backward compatibility
      const errMsg = String((responseError as any).message || "")
      if ((responseError as any).code === "42703" || errMsg.includes("column") || errMsg.includes("does not exist")) {
        const { data: fallback, error: fallbackError } = await admin
          .from("term_responses")
          .select("id, project_id, project_stage_term_id, status, updated_at, created_by, updated_by")
          .in("project_id", reviewableProjectIds)
          .in("status", ["submitted", "under_review"])
        if (fallbackError) throw fallbackError
        if (!fallback?.length) return { canReview: true, items: [] }
        const patched = (fallback as any[]).map((r) => ({ ...r, report_number: null, report_title: null, submitted_at: null }))
        return processReviewResponses(patched, projects, admin)
      }
      throw responseError
    }

    if (!responses?.length) return { canReview: true, items: [] }
    return processReviewResponses(responses as any[], projects, admin)
  } catch (error) {
    const errInfo =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : typeof error === "object" && error !== null
          ? { message: (error as any).message, code: (error as any).code, hint: (error as any).hint, details: (error as any).details }
          : String(error)
    console.error("getReviewSubmissionFeed error:", JSON.stringify(errInfo, null, 2))
    return { canReview: false, items: [] }
  }
}
