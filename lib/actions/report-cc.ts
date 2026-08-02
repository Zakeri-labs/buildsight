"use server"

import { revalidatePath } from "next/cache"
import { assertProjectAdmin, assertProjectMember, audit, AuthzError } from "@/lib/auth/guards"
import { sendReportCcEmails } from "@/lib/email/report-cc"
import { loadProjectCcCandidates, loadReportCcRecipients } from "@/lib/report-cc/server"
import type { ExternalCcRecipientInput, ReportCcContext, ReportCcRecipient } from "@/lib/report-cc/types"
import { createClient } from "@/lib/supabase/server"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ReportCcActionResult =
  | { ok: true; recipients: ReportCcRecipient[]; emailFailures: number }
  | { ok: false; error: string }

function logSupabaseActionError(action: string, error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : null
  console.error(`[${action}] Supabase error`, {
    message: value?.message ?? (error instanceof Error ? error.message : String(error)),
    code: value?.code ?? null,
    details: value?.details ?? null,
    hint: value?.hint ?? null,
  })
}

function normalizeExternal(rows: ExternalCcRecipientInput[]) {
  const byEmail = new Map<string, { name: string; email: string; company: string | null; role: string | null }>()
  for (const row of rows.slice(0, 50)) {
    const name = row.name.trim().slice(0, 250)
    const email = row.email.trim().toLowerCase().slice(0, 320)
    const company = row.company.trim().slice(0, 250) || null
    const role = row.role.trim().slice(0, 200) || null
    if (!name && !email && !company && !role) continue
    if (!name) throw new Error("External recipient name is required.")
    if (!EMAIL_PATTERN.test(email)) throw new Error(`Enter a valid email address for ${name}.`)
    byEmail.set(email, { name, email, company, role })
  }
  return Array.from(byEmail.values())
}

async function reportScope(projectId: string, responseId: string) {
  const supabase = await createClient()
  const { data: response, error: responseError } = await supabase
    .from("term_responses")
    .select("id, project_id, project_stage_id, project_stage_term_id, report_number, report_title, status, created_by, responsible_user_id")
    .eq("id", responseId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (responseError) throw responseError
  if (!response) throw new Error("Report not found.")

  const [{ data: stage, error: stageError }, { data: project, error: projectError }] = await Promise.all([
    supabase
      .from("project_stages")
      .select("id, name, project_id")
      .eq("id", response.project_stage_id)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle(),
  ])
  if (stageError) throw stageError
  if (projectError) throw projectError
  if (!stage || !project) throw new Error("Report project context could not be resolved.")

  let term: any = null
  if (response.project_stage_term_id) {
    const { data, error } = await supabase
      .from("project_stage_terms")
      .select("id, report_name, responsible_user_id, project_stage_id")
      .eq("id", response.project_stage_term_id)
      .eq("project_stage_id", stage.id)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error("Report term context could not be resolved.")
    term = data
  }

  return {
    ...response,
    project_stage_terms: term,
    project_stages: stage,
    projects: project,
  } as any
}

async function assertCanManage(projectId: string, responseId: string, context: ReportCcContext) {
  const actorId = await assertProjectMember(projectId)
  const response = await reportScope(projectId, responseId)
  const term = Array.isArray(response.project_stage_terms) ? response.project_stage_terms[0] : response.project_stage_terms
  const responsibleUserId = response.responsible_user_id ?? term?.responsible_user_id ?? null
  if (response.created_by !== actorId && responsibleUserId !== actorId) await assertProjectAdmin(projectId)
  if (context === "report" && ["submitted", "under_review", "approved", "completed"].includes(response.status)) {
    throw new Error("CC recipients cannot be changed while this report is awaiting review or finalized.")
  }
  return { actorId, response, term }
}

function appHref(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim()
  return base ? `${base.replace(/\/$/, "")}${path}` : path
}

export async function saveReportCcRecipientsAction(input: {
  projectId: string
  responseId: string
  context: ReportCcContext
  internalUserIds: string[]
  externalRecipients: ExternalCcRecipientInput[]
}): Promise<ReportCcActionResult> {
  try {
    if (!UUID_PATTERN.test(input.projectId) || !UUID_PATTERN.test(input.responseId)) {
      return { ok: false, error: "Invalid project or report." }
    }
    if (input.context !== "report" && input.context !== "translation") {
      return { ok: false, error: "Invalid CC recipient context." }
    }

    const { actorId, response, term } = await assertCanManage(input.projectId, input.responseId, input.context)
    const internalIds = Array.from(new Set(input.internalUserIds.filter((id) => UUID_PATTERN.test(id)))).slice(0, 100)
    const candidates = await loadProjectCcCandidates(input.projectId)
    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]))
    const invalidInternal = internalIds.find((id) => !candidateById.has(id))
    if (invalidInternal) return { ok: false, error: "One or more internal CC recipients no longer have access to this project." }
    const externalRows = normalizeExternal(input.externalRecipients)

    const supabase = await createClient()
    const { data: existing, error: existingError } = await supabase
      .from("report_cc_recipients")
      .select("id, recipient_type, user_id, external_name, external_email, external_company, external_role")
      .eq("project_id", input.projectId)
      .eq("response_id", input.responseId)
      .eq("recipient_context", input.context)
    if (existingError) throw existingError

    const existingInternal = new Map<string, any>((existing ?? []).filter((row: any) => row.recipient_type === "internal").map((row: any) => [row.user_id as string, row]))
    const existingExternal = new Map<string, any>((existing ?? []).filter((row: any) => row.recipient_type === "external").map((row: any) => [String(row.external_email).toLowerCase(), row]))
    const keepInternal = new Set(internalIds)
    const keepExternal = new Set(externalRows.map((row) => row.email))
    const removeIds = (existing ?? [])
      .filter((row: any) => row.recipient_type === "internal" ? !keepInternal.has(row.user_id) : !keepExternal.has(String(row.external_email).toLowerCase()))
      .map((row: any) => row.id as string)
    if (removeIds.length) {
      const { error } = await supabase.from("report_cc_recipients").delete().in("id", removeIds)
      if (error) throw error
    }

    for (const external of externalRows) {
      const current = existingExternal.get(external.email)
      if (!current) continue
      const { error } = await supabase
        .from("report_cc_recipients")
        .update({ external_name: external.name, external_company: external.company, external_role: external.role })
        .eq("id", current.id)
      if (error) throw error
    }

    const inserted: any[] = []
    for (const userId of internalIds.filter((id) => !existingInternal.has(id))) {
      const { data, error } = await supabase
        .from("report_cc_recipients")
        .insert({
          project_id: input.projectId,
          response_id: input.responseId,
          recipient_context: input.context,
          recipient_type: "internal",
          user_id: userId,
          added_by: actorId,
        })
        .select("id, user_id, recipient_type")
        .single()
      if (error && error.code !== "23505") throw error
      if (data) inserted.push(data)
    }
    for (const external of externalRows.filter((row) => !existingExternal.has(row.email))) {
      const { data, error } = await supabase
        .from("report_cc_recipients")
        .insert({
          project_id: input.projectId,
          response_id: input.responseId,
          recipient_context: input.context,
          recipient_type: "external",
          external_name: external.name,
          external_email: external.email,
          external_company: external.company,
          external_role: external.role,
          added_by: actorId,
        })
        .select("id, external_name, external_email, recipient_type")
        .single()
      if (error && error.code !== "23505") throw error
      if (data) inserted.push(data)
    }

    const stage = Array.isArray(response.project_stages) ? response.project_stages[0] : response.project_stages
    const project = Array.isArray(response.projects) ? response.projects[0] : response.projects
    const reportPath = response.project_stage_term_id
      ? `/projects/${input.projectId}/stages/${stage.id}/terms/${response.project_stage_term_id}/reports/${input.responseId}`
      : `/projects/${input.projectId}/stages/${stage.id}/reports/${input.responseId}`
    const href = input.context === "translation" ? `${reportPath}/translate` : reportPath
    const emailRecipients = inserted.map((row) => {
      if (row.recipient_type === "internal") {
        const candidate = candidateById.get(row.user_id)
        return { recipientRowId: row.id, name: candidate?.name ?? "Project member", email: candidate?.email ?? null, internal: true }
      }
      return { recipientRowId: row.id, name: row.external_name, email: row.external_email, internal: false }
    })
    const emailResults = emailRecipients.length
      ? await sendReportCcEmails({
          context: input.context,
          projectName: project?.name ?? "Project",
          stageName: stage?.name ?? "Stage",
          termName: term?.report_name ?? response.report_title,
          reportTitle: response.report_title,
          reportNumber: response.report_number,
          href: appHref(href),
          recipients: emailRecipients,
        })
      : []
    for (const result of emailResults) {
      await supabase
        .from("report_cc_recipients")
        .update({ email_status: result.status, email_sent_at: result.status === "sent" ? new Date().toISOString() : null })
        .eq("id", result.recipientRowId)
    }

    await audit({
      actorId,
      action: input.context === "translation" ? "translation.cc_updated" : "stage_report.cc_updated",
      entityType: "term_response",
      entityId: input.responseId,
      projectId: input.projectId,
      metadata: { internalCount: internalIds.length, externalCount: externalRows.length, addedCount: inserted.length },
    })

    revalidatePath(reportPath)
    revalidatePath(`${reportPath}/translate`)
    revalidatePath("/", "layout")
    revalidatePath("/")
    const recipients = await loadReportCcRecipients(input.projectId, input.responseId, input.context)
    return { ok: true, recipients, emailFailures: emailResults.filter((row) => row.status === "failed").length }
  } catch (error) {
    logSupabaseActionError("saveReportCcRecipientsAction", error)
    const message = error instanceof AuthzError ? error.message : error instanceof Error ? error.message : "Could not save CC recipients."
    return { ok: false, error: message }
  }
}
