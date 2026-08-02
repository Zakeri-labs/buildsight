"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertStageManager, audit, AuthzError } from "@/lib/auth/guards"
import type { ActionResult } from "@/lib/actions/invitations"

function cleanText(value: string | null | undefined) {
  return value?.trim() || null
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

function actionError(error: unknown, fallback: string): ActionResult {
  if (error instanceof AuthzError) return { ok: false, error: error.message }
  const databaseError = error as { code?: string; message?: string } | null
  if (databaseError?.code === "23505" || /duplicate key/i.test(databaseError?.message ?? "")) {
    return { ok: false, error: "A stage with this name already exists." }
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
    const { count: assignmentCount, error: assignmentError } = await admin
      .from("project_stages")
      .select("id", { count: "exact", head: true })
      .eq("template_stage_id", input.stageId)
    if (assignmentError) throw assignmentError
    const archive = (assignmentCount ?? 0) > 0
    const { error } = archive
      ? await admin.from("stages").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", input.stageId)
      : await admin.from("stages").delete().eq("id", input.stageId)
    if (error) throw error
    await audit({
      actorId,
      action: archive ? "stage.archived" : "stage.deleted",
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
