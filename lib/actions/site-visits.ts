"use server"

import { revalidatePath } from "next/cache"
import { audit, AuthzError } from "@/lib/auth/guards"
import { sendSiteVisitRequestEmails } from "@/lib/email/site-visit"
import { assertSiteVisitManager, assertSiteVisitRequester } from "@/lib/site-visits/access"
import type { SiteVisitPreferredTime, SiteVisitStatus } from "@/lib/site-visits/types"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const PREFERRED_TIMES = new Set<SiteVisitPreferredTime>(["morning", "afternoon", "any_time"])

export type SiteVisitActionResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string }

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}


type SupabaseErrorFields = {
  message?: string
  code?: string
  details?: string | null
  hint?: string | null
}

function getSupabaseErrorFields(error: unknown): SupabaseErrorFields {
  if (!error || typeof error !== "object") {
    return { message: error instanceof Error ? error.message : String(error ?? "Unknown error") }
  }
  const value = error as Record<string, unknown>
  return {
    message: typeof value.message === "string" ? value.message : undefined,
    code: typeof value.code === "string" ? value.code : undefined,
    details: typeof value.details === "string" ? value.details : null,
    hint: typeof value.hint === "string" ? value.hint : null,
  }
}

function logSiteVisitSupabaseError(operation: string, error: unknown) {
  const fields = getSupabaseErrorFields(error)
  console.error(`[site-visits] ${operation} failed`, {
    message: fields.message ?? "Unknown Supabase error",
    code: fields.code ?? null,
    details: fields.details ?? null,
    hint: fields.hint ?? null,
  })
}

function safeScheduleError(error: unknown) {
  const fields = getSupabaseErrorFields(error)
  const message = (fields.message ?? "").toLowerCase()

  if (fields.code === "PGRST202" || fields.code === "PGRST203" || fields.code === "42883" || message.includes("schedule_site_visit_request")) {
    return "Site visit scheduling is unavailable until the latest database migration is applied."
  }
  if (message.includes("not authorized") || message.includes("permission")) {
    return "You do not have permission to schedule this site visit."
  }
  if (message.includes("participant") || message.includes("assignee") || fields.code === "23503") {
    return "One or more selected participants can no longer be assigned to this project. Refresh and try again."
  }
  if (message.includes("request not found")) return "Site visit request not found."
  if (message.includes("can no longer be scheduled") || message.includes("status")) {
    return "This site visit request can no longer be scheduled. Refresh and try again."
  }
  if (message.includes("date and time") || fields.code === "22007") {
    return "Select a valid visit date and time."
  }

  return "The site visit could not be scheduled. Please refresh and try again."
}

function revalidateSiteVisitPaths(projectId: string, requestId?: string) {
  revalidatePath("/", "layout")
  revalidatePath("/")
  revalidatePath("/site-visits")
  revalidatePath(`/projects/${projectId}`)
  if (requestId) revalidatePath(`/site-visits/${requestId}`)
}

export async function createSiteVisitRequestAction(input: {
  projectId: string
  clientRequestId: string
  preferredMode: "date" | "asap"
  preferredDate?: string | null
  preferredTime: SiteVisitPreferredTime
  purpose: string
  notes?: string | null
}): Promise<SiteVisitActionResult> {
  if (!UUID_PATTERN.test(input.projectId) || !UUID_PATTERN.test(input.clientRequestId)) {
    return { ok: false, error: "Invalid site visit request." }
  }
  if (!PREFERRED_TIMES.has(input.preferredTime)) {
    return { ok: false, error: "Select a valid preferred time." }
  }
  const isAsap = input.preferredMode === "asap"
  const preferredDate = isAsap ? null : cleanText(input.preferredDate, 10)
  if (!isAsap && (!preferredDate || !DATE_PATTERN.test(preferredDate))) {
    return { ok: false, error: "Select a preferred visit date." }
  }
  if (preferredDate && preferredDate < new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: "Preferred visit date cannot be in the past." }
  }
  const purpose = cleanText(input.purpose, 2000)
  const notes = cleanText(input.notes, 4000)
  if (!purpose) return { ok: false, error: "Purpose of visit is required." }

  try {
    const actorId = await assertSiteVisitRequester(input.projectId)
    const admin = createAdminClient()

    const { data: existing, error: existingError } = await admin
      .from("site_visit_requests")
      .select("id")
      .eq("requested_by", actorId)
      .eq("project_id", input.projectId)
      .eq("client_request_id", input.clientRequestId)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      revalidateSiteVisitPaths(input.projectId, existing.id)
      return { ok: true, requestId: existing.id }
    }

    const { data: created, error: insertError } = await admin
      .from("site_visit_requests")
      .insert({
        project_id: input.projectId,
        requested_by: actorId,
        client_request_id: input.clientRequestId,
        status: "pending",
        preferred_date: preferredDate,
        is_asap: isAsap,
        preferred_time: input.preferredTime,
        purpose,
        notes: notes || null,
      })
      .select("id")
      .single()

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: retryExisting, error: retryError } = await admin
          .from("site_visit_requests")
          .select("id")
          .eq("requested_by", actorId)
          .eq("project_id", input.projectId)
          .eq("client_request_id", input.clientRequestId)
          .single()
        if (retryError) throw retryError
        revalidateSiteVisitPaths(input.projectId, retryExisting.id)
        return { ok: true, requestId: retryExisting.id }
      }
      throw insertError
    }

    const { data: profile } = await admin.from("profiles").select("full_name, email").eq("id", actorId).maybeSingle()
    const requestedByName = profile?.full_name?.trim() || profile?.email?.trim() || "Requester"
    let emailStatus = "skipped"
    try {
      const result = await sendSiteVisitRequestEmails({
        projectId: input.projectId,
        requestedById: actorId,
        requestedByName,
        preferredDate,
        isAsap,
        preferredTime: input.preferredTime,
        purpose,
      })
      emailStatus = result.status
    } catch {
      emailStatus = "failed"
    }

    await audit({
      actorId,
      action: "site_visit.requested",
      entityType: "site_visit_request",
      entityId: created.id,
      projectId: input.projectId,
      metadata: { isAsap, preferredDate, preferredTime: input.preferredTime, emailStatus },
    })

    revalidateSiteVisitPaths(input.projectId, created.id)
    return { ok: true, requestId: created.id }
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to request the site visit." }
  }
}

export async function scheduleSiteVisitAction(input: {
  requestId: string
  scheduledDate: string
  scheduledTime: string
  notes?: string | null
  assignedUserIds?: string[]
}): Promise<SiteVisitActionResult> {
  if (!UUID_PATTERN.test(input.requestId)) return { ok: false, error: "Invalid site visit request." }
  if (!DATE_PATTERN.test(input.scheduledDate) || !TIME_PATTERN.test(input.scheduledTime)) {
    return { ok: false, error: "Select a valid visit date and time." }
  }
  if (input.scheduledDate < new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: "Visit date cannot be in the past." }
  }
  const assignedUserIds = Array.from(new Set(input.assignedUserIds ?? []))
  if (assignedUserIds.some((id) => !UUID_PATTERN.test(id))) {
    return { ok: false, error: "One or more assigned participants are invalid." }
  }

  try {
    const admin = createAdminClient()
    const { data: request, error: requestError } = await admin
      .from("site_visit_requests")
      .select("id, project_id, status")
      .eq("id", input.requestId)
      .maybeSingle()
    if (requestError) {
      logSiteVisitSupabaseError("request lookup", requestError)
      throw requestError
    }
    if (!request) return { ok: false, error: "Site visit request not found." }
    if (request.status === "completed" || request.status === "cancelled") {
      return { ok: false, error: "This site visit request can no longer be scheduled." }
    }

    let actorId: string
    try {
      actorId = await assertSiteVisitManager(request.project_id)
    } catch (authorizationError) {
      if (!(authorizationError instanceof AuthzError)) {
        logSiteVisitSupabaseError("manager authorization", authorizationError)
      }
      throw authorizationError
    }

    if (assignedUserIds.length) {
      const [membershipResult, participantResult, projectResult] = await Promise.all([
        admin
          .from("project_user_memberships")
          .select("user_id")
          .eq("project_id", request.project_id)
          .eq("status", "active")
          .in("user_id", assignedUserIds),
        admin
          .from("project_participants")
          .select("key_contact_user_id")
          .eq("project_id", request.project_id)
          .eq("status", "active")
          .in("key_contact_user_id", assignedUserIds),
        admin
          .from("projects")
          .select("supervising_organization_id")
          .eq("id", request.project_id)
          .maybeSingle(),
      ])
      if (membershipResult.error) {
        logSiteVisitSupabaseError("assigned-participant project membership validation", membershipResult.error)
        throw membershipResult.error
      }
      if (participantResult.error) {
        logSiteVisitSupabaseError("assigned-participant record validation", participantResult.error)
        throw participantResult.error
      }
      if (projectResult.error) {
        logSiteVisitSupabaseError("assigned-participant project validation", projectResult.error)
        throw projectResult.error
      }

      const validAssignedUserIds = new Set<string>([
        ...(membershipResult.data ?? []).map((row: any) => row.user_id as string),
        ...(participantResult.data ?? [])
          .map((row: any) => row.key_contact_user_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ])

      const remainingUserIds = assignedUserIds.filter((id) => !validAssignedUserIds.has(id))
      if (remainingUserIds.length && projectResult.data?.supervising_organization_id) {
        const { data: organizationMembers, error: organizationMemberError } = await admin
          .from("organization_memberships")
          .select("user_id")
          .eq("organization_id", projectResult.data.supervising_organization_id)
          .eq("status", "active")
          .in("user_id", remainingUserIds)
        if (organizationMemberError) {
          logSiteVisitSupabaseError("assigned-participant organization membership validation", organizationMemberError)
          throw organizationMemberError
        }
        for (const row of organizationMembers ?? []) validAssignedUserIds.add(row.user_id as string)
      }

      const invalidAssignedUserIds = assignedUserIds.filter((id) => !validAssignedUserIds.has(id))
      if (invalidAssignedUserIds.length) {
        return {
          ok: false,
          error: "One or more selected participants can no longer be assigned to this project. Refresh and try again.",
        }
      }
    }

    const { error: scheduleError } = await admin.rpc("schedule_site_visit_request", {
      target_request_id: input.requestId,
      actor_id: actorId,
      visit_date: input.scheduledDate,
      visit_time: input.scheduledTime,
      visit_notes: cleanText(input.notes, 4000),
      assigned_user_ids: assignedUserIds,
    })
    if (scheduleError) {
      logSiteVisitSupabaseError("schedule_site_visit_request RPC", scheduleError)
      throw scheduleError
    }

    await audit({
      actorId,
      action: "site_visit.scheduled",
      entityType: "site_visit_request",
      entityId: input.requestId,
      projectId: request.project_id,
      metadata: {
        scheduledDate: input.scheduledDate,
        scheduledTime: input.scheduledTime,
        assignedUserIds,
      },
    })

    revalidateSiteVisitPaths(request.project_id, input.requestId)
    return { ok: true, requestId: input.requestId }
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message }
    return { ok: false, error: safeScheduleError(error) }
  }
}

export async function updateSiteVisitStatusAction(input: {
  requestId: string
  status: Extract<SiteVisitStatus, "completed" | "cancelled">
}): Promise<SiteVisitActionResult> {
  if (!UUID_PATTERN.test(input.requestId) || !["completed", "cancelled"].includes(input.status)) {
    return { ok: false, error: "Invalid site visit update." }
  }

  try {
    const admin = createAdminClient()
    const { data: request, error: requestError } = await admin
      .from("site_visit_requests")
      .select("id, project_id, status")
      .eq("id", input.requestId)
      .maybeSingle()
    if (requestError) throw requestError
    if (!request) return { ok: false, error: "Site visit request not found." }
    const actorId = await assertSiteVisitManager(request.project_id)

    if (input.status === "completed" && request.status !== "scheduled") {
      return { ok: false, error: "Only a scheduled site visit can be marked completed." }
    }
    if (input.status === "cancelled" && !["pending", "scheduled"].includes(request.status)) {
      return { ok: false, error: "This site visit request can no longer be cancelled." }
    }

    const update =
      input.status === "completed"
        ? { status: "completed", completed_at: new Date().toISOString(), cancelled_at: null }
        : { status: "cancelled", cancelled_at: new Date().toISOString() }
    const { data: updatedRequest, error: updateError } = await admin
      .from("site_visit_requests")
      .update(update)
      .eq("id", input.requestId)
      .eq("status", request.status)
      .select("id")
      .maybeSingle()
    if (updateError) throw updateError
    if (!updatedRequest) return { ok: false, error: "This site visit request changed. Refresh and try again." }

    await audit({
      actorId,
      action: input.status === "completed" ? "site_visit.completed" : "site_visit.cancelled",
      entityType: "site_visit_request",
      entityId: input.requestId,
      projectId: request.project_id,
      metadata: { previousStatus: request.status },
    })

    revalidateSiteVisitPaths(request.project_id, input.requestId)
    return { ok: true, requestId: input.requestId }
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, error: error.message }
    return { ok: false, error: error instanceof Error ? error.message : "Unable to update the site visit." }
  }
}
