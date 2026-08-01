"use server"

import { revalidatePath } from "next/cache"
import { assertProjectAdmin, assertProjectMember, audit, AuthzError } from "@/lib/auth/guards"
import { sendReportCcEmails } from "@/lib/email/report-cc"
import { loadProjectCcCandidates, loadReportCcRecipients } from "@/lib/report-cc/server"
import type { ExternalCcRecipientInput, ReportCcContext, ReportCcRecipient } from "@/lib/report-cc/types"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ReportCcActionResult =
  | { ok: true; recipients: ReportCcRecipient[]; emailFailures: number; emailErrors: string[] }
  | { ok: false; error: string }

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
    .select("id, project_id, project_stage_term_id, report_number, report_title, status, created_by")
    .eq("id", responseId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (responseError) throw responseError
  if (!response) throw new Error("Report not found.")

  const [{ data: term, error: termError }, { data: project, error: projectError }] = await Promise.all([
    supabase
      .from("project_stage_terms")
      .select("id, report_name, responsible_user_id, project_stage_id, project_stages!inner(id, name, project_id)")
      .eq("id", response.project_stage_term_id)
      .eq("project_stages.project_id", projectId)
      .maybeSingle(),
    supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle(),
  ])
  if (termError) throw termError
  if (projectError) throw projectError
  if (!term || !project) throw new Error("Report project context could not be resolved.")

  return {
    ...response,
    project_stage_terms: term,
    projects: project,
  } as any
}

async function assertCanManage(projectId: string, responseId: string, context: ReportCcContext) {
  const actorId = await assertProjectMember(projectId)
  const response = await reportScope(projectId, responseId)
  const term = Array.isArray(response.project_stage_terms) ? response.project_stage_terms[0] : response.project_stage_terms
  if (response.created_by !== actorId && term?.responsible_user_id !== actorId) await assertProjectAdmin(projectId)
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
      .select("id, recipient_type, user_id, external_name, external_email, external_company, external_role, email_status, email_sent_at")
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

    let insertedCount = 0
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
        .select("id")
        .single()
      if (error && error.code !== "23505") throw error
      if (data) insertedCount += 1
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
        .select("id")
        .single()
      if (error && error.code !== "23505") throw error
      if (data) insertedCount += 1
    }

    const admin = createAdminClient()
    const { data: deliveryRows, error: deliveryRowsError } = await admin
      .from("report_cc_recipients")
      .select("id, recipient_type, user_id, external_name, external_email, email_status, email_sent_at")
      .eq("project_id", input.projectId)
      .eq("response_id", input.responseId)
      .eq("recipient_context", input.context)
    if (deliveryRowsError) throw deliveryRowsError

    // Retry any selected recipient that has never been sent or previously failed.
    // This restores delivery when a CC row was saved during an earlier draft save,
    // which previously prevented the submit action from attempting email again.
    const pendingDeliveryRows = (deliveryRows ?? []).filter((row: any) => row.email_status !== "sent" || !row.email_sent_at)
    const stage = Array.isArray(term?.project_stages) ? term.project_stages[0] : term?.project_stages
    const project = Array.isArray(response.projects) ? response.projects[0] : response.projects
    const reportPath = `/projects/${input.projectId}/stages/${stage.id}/terms/${response.project_stage_term_id}/reports/${input.responseId}`
    const href = input.context === "translation" ? `${reportPath}/translate` : reportPath
    const emailRecipients = pendingDeliveryRows.map((row: any) => {
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
          termName: term?.report_name ?? "Term",
          reportTitle: response.report_title,
          reportNumber: response.report_number,
          href: appHref(href),
          recipients: emailRecipients,
        })
      : []
    for (const result of emailResults) {
      const { error: statusError } = await admin
        .from("report_cc_recipients")
        .update({ email_status: result.status, email_sent_at: result.status === "sent" ? new Date().toISOString() : null })
        .eq("id", result.recipientRowId)
      if (statusError) {
        console.error("[email:report-cc] Could not persist delivery status", {
          recipientRowId: result.recipientRowId,
          status: result.status,
          error: statusError.message,
        })
      }
    }
    const emailRecipientByRowId = new Map(emailRecipients.map((recipient) => [recipient.recipientRowId, recipient]))
    const emailErrors = emailResults
      .filter((result) => result.status !== "sent")
      .map((result) => {
        const recipient = emailRecipientByRowId.get(result.recipientRowId)
        const label = recipient?.email || recipient?.name || result.recipientRowId
        return `${label}: ${result.error || "Email delivery failed."}`
      })

    await audit({
      actorId,
      action: input.context === "translation" ? "translation.cc_updated" : "stage_report.cc_updated",
      entityType: "term_response",
      entityId: input.responseId,
      projectId: input.projectId,
      metadata: {
        internalCount: internalIds.length,
        externalCount: externalRows.length,
        addedCount: insertedCount,
        emailAttemptedCount: emailResults.length,
        emailSentCount: emailResults.filter((row) => row.status === "sent").length,
        emailFailureCount: emailErrors.length,
        emailErrors: emailErrors.slice(0, 10),
      },
    })

    revalidatePath(reportPath)
    revalidatePath(`${reportPath}/translate`)
    revalidatePath("/", "layout")
    revalidatePath("/")
    const recipients = await loadReportCcRecipients(input.projectId, input.responseId, input.context)
    return { ok: true, recipients, emailFailures: emailErrors.length, emailErrors }
  } catch (error) {
    const message = error instanceof AuthzError ? error.message : error instanceof Error ? error.message : "Could not save CC recipients."
    return { ok: false, error: message }
  }
}
