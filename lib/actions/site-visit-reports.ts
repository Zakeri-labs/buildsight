"use server"

import { revalidatePath } from "next/cache"
import { requireOnboarded } from "@/lib/auth/session"
import { resolveUserEffectiveRole } from "@/lib/auth/effective-role"
import { createAdminClient } from "@/lib/supabase/admin"

export async function softDeleteSiteVisitReportAction(input: {
  reportId: string
  projectId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireOnboarded()
    const reportId = input.reportId?.trim()
    const projectId = input.projectId?.trim()

    if (!reportId || !projectId) {
      return { ok: false, error: "Missing required report or project identifier." }
    }

    // 1. Authenticate user and resolve effective role - must be canonical admin
    const roleResolution = await resolveUserEffectiveRole(session.userId, session.email)
    if (roleResolution.role !== "admin") {
      return { ok: false, error: "Only administrators are authorized to remove site visit reports." }
    }

    const admin = createAdminClient()

    // 2. Verify project exists and get supervising organization
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, supervising_organization_id")
      .eq("id", projectId)
      .maybeSingle()

    if (projectError || !project) {
      return { ok: false, error: "Project not found or you do not have permission to access it." }
    }

    // 3. Strict check for canonical admin role on this project:
    // User must be org_admin of the project's supervising organization OR project_admin on this project.
    // Managers (org_manager, project_manager), members, and viewers are explicitly denied.
    const { data: orgMembership } = await admin
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", project.supervising_organization_id)
      .eq("user_id", session.userId)
      .eq("status", "active")
      .maybeSingle()

    const isOrgAdmin = orgMembership?.role === "org_admin"

    const { data: projectMembership } = await admin
      .from("project_user_memberships")
      .select("access_role")
      .eq("project_id", projectId)
      .eq("user_id", session.userId)
      .eq("status", "active")
      .maybeSingle()

    const isProjectAdmin = projectMembership?.access_role === "project_admin"

    if (!isOrgAdmin && !isProjectAdmin) {
      return { ok: false, error: "You must be an administrator to remove site visit reports." }
    }

    // 4. Verify report exists and belongs to the specified project
    const { data: report, error: reportError } = await admin
      .from("term_responses")
      .select("id, project_id, project_stage_id, report_title, report_number, deleted_at")
      .eq("id", reportId)
      .eq("project_id", projectId)
      .maybeSingle()

    if (reportError || !report) {
      return { ok: false, error: "Site visit report not found in this project." }
    }

    if (report.deleted_at) {
      return { ok: true } // Already removed
    }

    // 5. Perform the soft delete (timestamp + deleted_by)
    // NOTE: This does NOT delete the report row, does NOT delete storage files,
    // does NOT delete report_credit_usage, and does NOT alter organization subscription credits.
    const now = new Date().toISOString()
    const { error: updateError } = await admin
      .from("term_responses")
      .update({
        deleted_at: now,
        deleted_by: session.userId,
        updated_at: now,
      })
      .eq("id", reportId)
      .eq("project_id", projectId)

    if (updateError) {
      console.error("[softDeleteSiteVisitReportAction] Update failed:", updateError)
      return { ok: false, error: "Failed to remove report from project: " + updateError.message }
    }

    // 6. Audit log entry
    try {
      await admin.from("audit_logs").insert({
        actor_id: session.userId,
        action: "site_visit_report.soft_deleted",
        entity_type: "term_response",
        entity_id: report.id,
        project_id: projectId,
        metadata: {
          report_title: report.report_title,
          report_number: report.report_number,
          stage_id: report.project_stage_id,
          soft_deleted_at: now,
        },
      })
    } catch (auditErr) {
      console.warn("[softDeleteSiteVisitReportAction] Audit log failed (non-fatal):", auditErr)
    }

    // 7. Revalidate relevant operational views
    revalidatePath(`/projects/${projectId}`)
    revalidatePath(`/projects/${projectId}/stages`)
    if (report.project_stage_id) {
      revalidatePath(`/projects/${projectId}/stages/${report.project_stage_id}`)
    }
    revalidatePath("/reports")
    revalidatePath("/dashboard")
    revalidatePath("/my-reports")

    return { ok: true }
  } catch (error) {
    console.error("[softDeleteSiteVisitReportAction] Unexpected error:", error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred while removing the report.",
    }
  }
}
