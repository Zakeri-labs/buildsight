"use server"

import { redirect } from "next/navigation"

import { requireOnboarded } from "@/lib/auth/session"
import { resolveExplicitSupervisorProjectScope } from "@/lib/calendar/server"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

export async function startReportEntryAction(formData: FormData) {
  const session = await requireOnboarded()
  const membership = session.memberships[0]
  if (membership?.role !== "org_member") redirect("/")

  const projectId = formData.get("projectId")
  const stageId = formData.get("stageId")
  if (!isUuid(projectId) || !isUuid(stageId)) redirect("/report-entry?error=invalid-selection")

  const supervisedProjects = await resolveExplicitSupervisorProjectScope(session.userId)
  if (!supervisedProjects.some((project) => project.id === projectId)) {
    redirect("/report-entry?error=unauthorized-project")
  }

  const admin = createAdminClient()
  const { data: stage, error } = await admin
    .from("project_stages")
    .select("id, project_id, status")
    .eq("id", stageId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!stage || stage.status === "disabled") redirect("/report-entry?error=invalid-stage")

  redirect(`/projects/${projectId}/stages/${stageId}/reports/new`)
}
