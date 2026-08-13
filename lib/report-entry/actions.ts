"use server"

import { redirect } from "next/navigation"

import { requireOnboarded } from "@/lib/auth/session"
import { resolveCalendarProjectScope, resolveExplicitSupervisorProjectScope } from "@/lib/calendar/server"
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

  const projectId = formData.get("projectId")
  const stageId = formData.get("stageId")
  const rawSiteVisitId = formData.get("siteVisitId")
  const hasSiteVisitContext = typeof rawSiteVisitId === "string" && rawSiteVisitId.trim().length > 0
  const siteVisitId = hasSiteVisitContext && isUuid(rawSiteVisitId) ? rawSiteVisitId.trim() : null

  if (hasSiteVisitContext && !siteVisitId) redirect(errorHref("invalid-visit"))
  if (!isUuid(projectId) || !isUuid(stageId)) redirect(errorHref("invalid-selection", siteVisitId))

  let supervisedProjects = await resolveExplicitSupervisorProjectScope(session.userId)
  if (!supervisedProjects.some((project) => project.id === projectId)) {
    supervisedProjects = await resolveCalendarProjectScope(session.userId)
  }
  if (!supervisedProjects.some((project) => project.id === projectId)) {
    redirect(errorHref("unauthorized-project"))
  }

  const admin = createAdminClient()
  let { data: stage } = await admin
    .from("project_stages")
    .select("id, project_id, status")
    .eq("id", stageId)
    .eq("project_id", projectId)
    .maybeSingle()

  let finalProjectStageId = stage?.id

  if (stage) {
    if (stage.status === "disabled") redirect(errorHref("invalid-stage", siteVisitId))
  } else {
    // Check if stageId matches a template stage ID
    const { data: templateStage } = await admin
      .from("stages")
      .select("id, name, description, sort_order, is_active")
      .eq("id", stageId)
      .maybeSingle()

    if (!templateStage || templateStage.is_active === false) redirect(errorHref("invalid-stage", siteVisitId))

    // Check if project_stages row already exists for this template stage
    const { data: existingPs } = await admin
      .from("project_stages")
      .select("id, status")
      .eq("project_id", projectId)
      .eq("template_stage_id", stageId)
      .maybeSingle()

    if (existingPs) {
      if (existingPs.status === "disabled") redirect(errorHref("invalid-stage", siteVisitId))
      finalProjectStageId = existingPs.id
    } else {
      // Instantiate missing project stage
      const { data: newPs, error: insertError } = await admin
        .from("project_stages")
        .insert({
          project_id: projectId,
          template_stage_id: templateStage.id,
          name: templateStage.name,
          description: templateStage.description,
          status: "not_started",
          sort_order: templateStage.sort_order,
        })
        .select("id")
        .single()

      if (insertError || !newPs) redirect(errorHref("invalid-stage", siteVisitId))
      finalProjectStageId = newPs.id
    }
  }

  if (siteVisitId) {
    const { data: siteVisit, error: siteVisitError } = await admin
      .from("site_visit_requests")
      .select("id, project_id, status")
      .eq("id", siteVisitId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (siteVisitError) throw siteVisitError
    if (!siteVisit || siteVisit.status !== "scheduled") redirect(errorHref("invalid-visit"))

    redirect(`/projects/${projectId}/stages/${finalProjectStageId}/reports/new?siteVisitRequestId=${encodeURIComponent(siteVisitId)}`)
  }

  redirect(`/projects/${projectId}/stages/${finalProjectStageId}/reports/new`)
}
