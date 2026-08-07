"use server"

import { redirect } from "next/navigation"

import { requireOnboarded } from "@/lib/auth/session"
import { resolveExplicitSupervisorProjectScope } from "@/lib/calendar/server"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
}

function errorHref(code: string, siteVisitId?: string | null) {
  const params = new URLSearchParams({ error: code })
  if (siteVisitId && isUuid(siteVisitId)) params.set("siteVisitId", siteVisitId)
  return `/report-entry?${params.toString()}`
}

export async function startReportEntryAction(formData: FormData) {
  const session = await requireOnboarded()
  const membership = session.memberships[0]
  if (membership?.role !== "org_member") redirect("/")

  const projectId = formData.get("projectId")
  const stageId = formData.get("stageId")
  const rawSiteVisitId = formData.get("siteVisitId")
  const hasSiteVisitContext = typeof rawSiteVisitId === "string" && rawSiteVisitId.trim().length > 0
  const siteVisitId = hasSiteVisitContext && isUuid(rawSiteVisitId) ? rawSiteVisitId.trim() : null

  if (hasSiteVisitContext && !siteVisitId) redirect(errorHref("invalid-visit"))
  if (!isUuid(projectId) || !isUuid(stageId)) redirect(errorHref("invalid-selection", siteVisitId))

  const supervisedProjects = await resolveExplicitSupervisorProjectScope(session.userId)
  if (!supervisedProjects.some((project) => project.id === projectId)) {
    redirect(errorHref("unauthorized-project"))
  }

  const admin = createAdminClient()
  const { data: stage, error } = await admin
    .from("project_stages")
    .select("id, project_id, status")
    .eq("id", stageId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) throw error
  if (!stage || stage.status === "disabled") redirect(errorHref("invalid-stage", siteVisitId))

  if (siteVisitId) {
    const { data: siteVisit, error: siteVisitError } = await admin
      .from("site_visit_requests")
      .select("id, project_id, status")
      .eq("id", siteVisitId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (siteVisitError) throw siteVisitError
    if (!siteVisit || siteVisit.status !== "scheduled") redirect(errorHref("invalid-visit"))

    redirect(`/projects/${projectId}/stages/${stageId}/reports/new?siteVisitRequestId=${encodeURIComponent(siteVisitId)}`)
  }

  redirect(`/projects/${projectId}/stages/${stageId}/reports/new`)
}
