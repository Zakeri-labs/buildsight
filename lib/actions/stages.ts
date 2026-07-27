"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertStageManager, audit, AuthzError } from "@/lib/auth/guards"
import type { ActionResult } from "@/lib/actions/invitations"
import { DUE_DATE_RULES, STAGE_TERM_STATUSES, type StageTermStatus } from "@/lib/stages/config"

function cleanText(value: string | null | undefined) {
  return value?.trim() || null
}

function validUuid(value: string | null | undefined) {
  return !value || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function stageScope(stageId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("stages")
    .select("id, organization_id, name, sort_order")
    .eq("id", stageId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Stage not found")
  return data
}

async function termScope(termId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("stage_terms")
    .select("id, stage_id, report_name, sort_order, stages!inner(organization_id)")
    .eq("id", termId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Report term not found")
  return {
    ...data,
    organization_id: (data.stages as any).organization_id as string,
  }
}

function actionError(error: unknown, fallback: string): ActionResult {
  if (error instanceof AuthzError) return { ok: false, error: error.message }
  const databaseError = error as { code?: string; message?: string } | null
  if (databaseError?.code === "23505" || /duplicate key/i.test(databaseError?.message ?? "")) {
    return { ok: false, error: "A stage or report with this name already exists." }
  }
  return { ok: false, error: fallback }
}

export async function createStage(input: {
  organizationId: string
  name: string
  description?: string
}): Promise<ActionResult<{ id: string }>> {
  try {
    const name = input.name.trim()
    if (name.length < 2) return { ok: false, error: "Stage name must contain at least 2 characters." }
    const actorId = await assertStageManager(input.organizationId)
    const admin = createAdminClient()
    const { data: last } = await admin
      .from("stages")
      .select("sort_order")
      .eq("organization_id", input.organizationId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data, error } = await admin
      .from("stages")
      .insert({
        organization_id: input.organizationId,
        name,
        description: cleanText(input.description),
        is_active: true,
        sort_order: (last?.sort_order ?? 0) + 1,
        created_by: actorId,
      })
      .select("id")
      .single()
    if (error) throw error
    await audit({
      actorId,
      action: "stage.created",
      entityType: "stage",
      entityId: data.id,
      organizationId: input.organizationId,
      metadata: { name },
    })
    revalidatePath("/stages")
    return { ok: true, data: { id: data.id } }
  } catch (error) {
    return actionError(error, "Could not create the stage.")
  }
}

export async function updateStage(input: {
  stageId: string
  name: string
  description?: string
}): Promise<ActionResult> {
  try {
    const name = input.name.trim()
    if (name.length < 2) return { ok: false, error: "Stage name must contain at least 2 characters." }
    const stage = await stageScope(input.stageId)
    const actorId = await assertStageManager(stage.organization_id)
    const admin = createAdminClient()
    const { error } = await admin
      .from("stages")
      .update({ name, description: cleanText(input.description), updated_at: new Date().toISOString() })
      .eq("id", input.stageId)
    if (error) throw error
    await audit({
      actorId,
      action: "stage.updated",
      entityType: "stage",
      entityId: input.stageId,
      organizationId: stage.organization_id,
      metadata: { name },
    })
    revalidatePath("/stages")
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not update the stage.")
  }
}

export async function setStageActive(input: { stageId: string; active: boolean }): Promise<ActionResult> {
  try {
    const stage = await stageScope(input.stageId)
    const actorId = await assertStageManager(stage.organization_id)
    const admin = createAdminClient()
    const { error } = await admin
      .from("stages")
      .update({ is_active: input.active, updated_at: new Date().toISOString() })
      .eq("id", input.stageId)
    if (error) throw error
    await audit({
      actorId,
      action: input.active ? "stage.enabled" : "stage.disabled",
      entityType: "stage",
      entityId: input.stageId,
      organizationId: stage.organization_id,
    })
    revalidatePath("/stages")
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not change the stage status.")
  }
}

export async function deleteStage(input: { stageId: string }): Promise<ActionResult> {
  try {
    const stage = await stageScope(input.stageId)
    const actorId = await assertStageManager(stage.organization_id)
    const admin = createAdminClient()
    const { error } = await admin.from("stages").delete().eq("id", input.stageId)
    if (error) throw error
    await audit({
      actorId,
      action: "stage.deleted",
      entityType: "stage",
      entityId: input.stageId,
      organizationId: stage.organization_id,
      metadata: { name: stage.name },
    })
    revalidatePath("/stages")
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not delete the stage.")
  }
}

export async function moveStage(input: { stageId: string; direction: "up" | "down" }): Promise<ActionResult> {
  try {
    const stage = await stageScope(input.stageId)
    await assertStageManager(stage.organization_id)
    const admin = createAdminClient()
    let query = admin
      .from("stages")
      .select("id, sort_order")
      .eq("organization_id", stage.organization_id)
      .neq("id", stage.id)
      .limit(1)
    query =
      input.direction === "up"
        ? query.lt("sort_order", stage.sort_order).order("sort_order", { ascending: false })
        : query.gt("sort_order", stage.sort_order).order("sort_order", { ascending: true })
    const { data: adjacent, error: lookupError } = await query.maybeSingle()
    if (lookupError) throw lookupError
    if (!adjacent) return { ok: true }
    const timestamp = new Date().toISOString()
    const [{ error: firstError }, { error: secondError }] = await Promise.all([
      admin.from("stages").update({ sort_order: adjacent.sort_order, updated_at: timestamp }).eq("id", stage.id),
      admin.from("stages").update({ sort_order: stage.sort_order, updated_at: timestamp }).eq("id", adjacent.id),
    ])
    if (firstError) throw firstError
    if (secondError) throw secondError
    revalidatePath("/stages")
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not reorder the stages.")
  }
}

type TermInput = {
  reportName: string
  required: boolean
  responsibleOrganizationId?: string | null
  responsibleUserId?: string | null
  dueDateRule: string
  approvalRequired: boolean
  templateReference?: string
  status: StageTermStatus
}

async function validateResponsibilityScope(
  organizationId: string,
  responsibleOrganizationId?: string | null,
  responsibleUserId?: string | null,
): Promise<string | null> {
  if (!responsibleOrganizationId && !responsibleUserId) return null

  const admin = createAdminClient()
  const { data: projectRows, error: projectError } = await admin
    .from("projects")
    .select("id")
    .eq("supervising_organization_id", organizationId)
  if (projectError) throw projectError

  const projectIds = (projectRows ?? []).map((project: any) => project.id as string)
  const allowedOrganizationIds = new Set<string>([organizationId])

  if (projectIds.length > 0) {
    const { data: participantRows, error: participantError } = await admin
      .from("project_organization_memberships")
      .select("organization_id")
      .in("project_id", projectIds)
      .eq("status", "active")
    if (participantError) throw participantError
    for (const participant of participantRows ?? []) {
      allowedOrganizationIds.add(participant.organization_id)
    }
  }

  if (responsibleOrganizationId && !allowedOrganizationIds.has(responsibleOrganizationId)) {
    return "The selected responsible organization is not available in this organization’s projects."
  }

  if (!responsibleUserId) return null

  const organizationScope = responsibleOrganizationId
    ? [responsibleOrganizationId]
    : Array.from(allowedOrganizationIds)

  const { data: organizationMembership, error: organizationMembershipError } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("user_id", responsibleUserId)
    .eq("status", "active")
    .in("organization_id", organizationScope)
    .limit(1)
    .maybeSingle()
  if (organizationMembershipError) throw organizationMembershipError
  if (organizationMembership) return null

  if (projectIds.length > 0) {
    let projectMembershipQuery = admin
      .from("project_user_memberships")
      .select("id")
      .eq("user_id", responsibleUserId)
      .eq("status", "active")
      .in("project_id", projectIds)
      .limit(1)
    if (responsibleOrganizationId) {
      projectMembershipQuery = projectMembershipQuery.eq("organization_id", responsibleOrganizationId)
    }
    const { data: projectMembership, error: projectMembershipError } =
      await projectMembershipQuery.maybeSingle()
    if (projectMembershipError) throw projectMembershipError
    if (projectMembership) return null
  }

  return "The selected responsible user is not available in this organization’s projects."
}

function validateTermInput(input: TermInput): string | null {
  if (input.reportName.trim().length < 2) return "Report name must contain at least 2 characters."
  if (!DUE_DATE_RULES.some((rule) => rule.value === input.dueDateRule)) return "Select a valid due date rule."
  if (!STAGE_TERM_STATUSES.includes(input.status)) return "Select a valid report status."
  if (!validUuid(input.responsibleOrganizationId) || !validUuid(input.responsibleUserId)) {
    return "Select a valid responsible organization and user."
  }
  return null
}

export async function createStageTerm(input: TermInput & { stageId: string }): Promise<ActionResult<{ id: string }>> {
  try {
    const validationError = validateTermInput(input)
    if (validationError) return { ok: false, error: validationError }
    const stage = await stageScope(input.stageId)
    const actorId = await assertStageManager(stage.organization_id)
    const responsibilityError = await validateResponsibilityScope(
      stage.organization_id,
      input.responsibleOrganizationId,
      input.responsibleUserId,
    )
    if (responsibilityError) return { ok: false, error: responsibilityError }
    const admin = createAdminClient()
    const { data: last } = await admin
      .from("stage_terms")
      .select("sort_order")
      .eq("stage_id", input.stageId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data, error } = await admin
      .from("stage_terms")
      .insert({
        stage_id: input.stageId,
        report_name: input.reportName.trim(),
        is_required: input.required,
        responsible_organization_id: input.responsibleOrganizationId || null,
        responsible_user_id: input.responsibleUserId || null,
        due_date_rule: input.dueDateRule,
        approval_required: input.approvalRequired,
        template_reference: cleanText(input.templateReference),
        status: input.status,
        sort_order: (last?.sort_order ?? 0) + 1,
        created_by: actorId,
      })
      .select("id")
      .single()
    if (error) throw error
    await audit({
      actorId,
      action: "stage_term.created",
      entityType: "stage_term",
      entityId: data.id,
      organizationId: stage.organization_id,
      metadata: { stageId: stage.id, reportName: input.reportName.trim() },
    })
    revalidatePath("/stages")
    return { ok: true, data: { id: data.id } }
  } catch (error) {
    return actionError(error, "Could not add the report term.")
  }
}

export async function updateStageTerm(input: TermInput & { termId: string }): Promise<ActionResult> {
  try {
    const validationError = validateTermInput(input)
    if (validationError) return { ok: false, error: validationError }
    const term = await termScope(input.termId)
    const actorId = await assertStageManager(term.organization_id)
    const responsibilityError = await validateResponsibilityScope(
      term.organization_id,
      input.responsibleOrganizationId,
      input.responsibleUserId,
    )
    if (responsibilityError) return { ok: false, error: responsibilityError }
    const admin = createAdminClient()
    const { error } = await admin
      .from("stage_terms")
      .update({
        report_name: input.reportName.trim(),
        is_required: input.required,
        responsible_organization_id: input.responsibleOrganizationId || null,
        responsible_user_id: input.responsibleUserId || null,
        due_date_rule: input.dueDateRule,
        approval_required: input.approvalRequired,
        template_reference: cleanText(input.templateReference),
        status: input.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.termId)
    if (error) throw error
    await audit({
      actorId,
      action: "stage_term.updated",
      entityType: "stage_term",
      entityId: input.termId,
      organizationId: term.organization_id,
      metadata: { stageId: term.stage_id, reportName: input.reportName.trim() },
    })
    revalidatePath("/stages")
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not update the report term.")
  }
}

export async function setStageTermStatus(input: { termId: string; status: StageTermStatus }): Promise<ActionResult> {
  try {
    if (!STAGE_TERM_STATUSES.includes(input.status)) return { ok: false, error: "Invalid report status." }
    const term = await termScope(input.termId)
    const actorId = await assertStageManager(term.organization_id)
    const admin = createAdminClient()
    const { error } = await admin
      .from("stage_terms")
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq("id", input.termId)
    if (error) throw error
    await audit({
      actorId,
      action: input.status === "active" ? "stage_term.enabled" : "stage_term.disabled",
      entityType: "stage_term",
      entityId: input.termId,
      organizationId: term.organization_id,
    })
    revalidatePath("/stages")
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not change the report status.")
  }
}

export async function deleteStageTerm(input: { termId: string }): Promise<ActionResult> {
  try {
    const term = await termScope(input.termId)
    const actorId = await assertStageManager(term.organization_id)
    const admin = createAdminClient()
    const { error } = await admin.from("stage_terms").delete().eq("id", input.termId)
    if (error) throw error
    await audit({
      actorId,
      action: "stage_term.deleted",
      entityType: "stage_term",
      entityId: input.termId,
      organizationId: term.organization_id,
      metadata: { stageId: term.stage_id, reportName: term.report_name },
    })
    revalidatePath("/stages")
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not delete the report term.")
  }
}

export async function moveStageTerm(input: { termId: string; direction: "up" | "down" }): Promise<ActionResult> {
  try {
    const term = await termScope(input.termId)
    await assertStageManager(term.organization_id)
    const admin = createAdminClient()
    let query = admin
      .from("stage_terms")
      .select("id, sort_order")
      .eq("stage_id", term.stage_id)
      .neq("id", term.id)
      .limit(1)
    query =
      input.direction === "up"
        ? query.lt("sort_order", term.sort_order).order("sort_order", { ascending: false })
        : query.gt("sort_order", term.sort_order).order("sort_order", { ascending: true })
    const { data: adjacent, error: lookupError } = await query.maybeSingle()
    if (lookupError) throw lookupError
    if (!adjacent) return { ok: true }
    const timestamp = new Date().toISOString()
    const [{ error: firstError }, { error: secondError }] = await Promise.all([
      admin.from("stage_terms").update({ sort_order: adjacent.sort_order, updated_at: timestamp }).eq("id", term.id),
      admin.from("stage_terms").update({ sort_order: term.sort_order, updated_at: timestamp }).eq("id", adjacent.id),
    ])
    if (firstError) throw firstError
    if (secondError) throw secondError
    revalidatePath("/stages")
    return { ok: true }
  } catch (error) {
    return actionError(error, "Could not reorder the report terms.")
  }
}
