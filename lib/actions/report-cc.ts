"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { assertProjectAdmin, assertProjectMember, audit, AuthzError } from "@/lib/auth/guards"
import { sendReportCcEmails } from "@/lib/email/report-cc"
import { loadProjectCcCandidates, loadProjectParticipantsOnly, loadReportCcRecipients } from "@/lib/report-cc/server"
import type { ExternalCcRecipientInput, ProjectCcCandidate, ReportCcContext, ReportCcRecipient } from "@/lib/report-cc/types"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ReportCcActionResult =
  | { ok: true; recipients: ReportCcRecipient[]; emailFailures: number }
  | { ok: false; error: string }

function normalizeExternal(rows: ExternalCcRecipientInput[]) {
  const byEmail = new Map<string, {
    clientId: string
    name: string
    email: string
    company: string | null
    role: string | null
    group?: "reportTo" | "ccTo"
  }>()
  for (const row of rows.slice(0, 50)) {
    const name = row.name.trim().slice(0, 250)
    const email = row.email.trim().toLowerCase().slice(0, 320)
    const company = row.company.trim().slice(0, 250) || null
    const role = row.role.trim().slice(0, 200) || null
    if (!name && !email && !company && !role) continue
    if (!name) throw new Error("External recipient name is required.")
    if (!EMAIL_PATTERN.test(email)) throw new Error(`Enter a valid email address for ${name}.`)
    byEmail.set(email, { clientId: row.clientId, name, email, company, role, group: row.group })
  }
  return Array.from(byEmail.values())
}

async function reportScope(projectId: string, responseId: string) {
  const supabase = await createClient()
  const { data: response, error: responseError } = await supabase
    .from("term_responses")
    .select("id, project_id, project_stage_id, project_stage_term_id, report_number, report_title, status, created_by")
    .eq("id", responseId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (responseError) throw responseError
  if (!response) throw new Error("Report not found.")

  const [{ data: term, error: termError }, { data: stage, error: stageError }, { data: project, error: projectError }] = await Promise.all([
    response.project_stage_term_id
      ? supabase
          .from("project_stage_terms")
          .select("id, report_name, responsible_user_id, project_stage_id, project_stages!inner(id, name, project_id)")
          .eq("id", response.project_stage_term_id)
          .eq("project_stages.project_id", projectId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    response.project_stage_id
      ? supabase
          .from("project_stages")
          .select("id, name, project_id")
          .eq("id", response.project_stage_id)
          .eq("project_id", projectId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle(),
  ])
  if (termError) throw termError
  if (stageError) throw stageError
  if (projectError) throw projectError
  if (!project) throw new Error("Report project context could not be resolved.")

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
  const isCreator = response.created_by === actorId
  const isResponsible = term?.responsible_user_id === actorId
  if (!isCreator && !isResponsible) await assertProjectAdmin(projectId)
  if (context === "report" && ["approved", "completed"].includes(response.status)) {
    throw new Error("CC recipients cannot be changed while this report is finalized.")
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
  reportToUserIds?: string[]
  ccToUserIds?: string[]
}): Promise<ReportCcActionResult> {
  try {
    if (!UUID_PATTERN.test(input.projectId) || !UUID_PATTERN.test(input.responseId)) {
      return { ok: false, error: "Invalid project or report." }
    }
    if (input.context !== "report" && input.context !== "translation") {
      return { ok: false, error: "Invalid CC recipient context." }
    }

    const { actorId, response, term } = await assertCanManage(input.projectId, input.responseId, input.context)
    const rawInternalIds = Array.from(new Set(input.internalUserIds.filter((id) => UUID_PATTERN.test(id)))).slice(0, 100)
    const hasGroupedSelection = input.reportToUserIds !== undefined || input.ccToUserIds !== undefined
    const reportToUserIds = Array.from(new Set((input.reportToUserIds ?? []).filter((id) => UUID_PATTERN.test(id))))
    const ccToUserIds = Array.from(new Set((input.ccToUserIds ?? []).filter((id) => UUID_PATTERN.test(id))))
    const reportToIdSet = new Set(reportToUserIds)
    const ccToIdSet = new Set(ccToUserIds)

    const [internalCandidates, participantCandidates] = await Promise.all([
      loadProjectCcCandidates(input.projectId),
      loadProjectParticipantsOnly(input.projectId),
    ])
    const candidateById = new Map<string, ProjectCcCandidate>([
      ...internalCandidates.map((c) => [c.id, c] as const),
      ...participantCandidates.map((c) => [c.id, c] as const),
    ])

    const admin = createAdminClient()
    const { data: profileRows } = rawInternalIds.length
      ? await admin.from("profiles").select("id").in("id", rawInternalIds)
      : { data: [] }
    const validProfileUserIds = new Set((profileRows ?? []).map((p: any) => p.id as string))

    const validInternalUserIds: string[] = []
    const convertedExternalRecipients: ExternalCcRecipientInput[] = [...input.externalRecipients]

    for (const id of rawInternalIds) {
      if (validProfileUserIds.has(id)) {
        validInternalUserIds.push(id)
      } else {
        const participant = candidateById.get(id)
        if (participant) {
          const safeEmail = participant.email?.trim() || `${participant.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)}@project.contact`
          convertedExternalRecipients.push({
            clientId: participant.id,
            name: participant.name,
            email: safeEmail,
            company: participant.organizationName ?? "",
            role: participant.role ?? "",
            group: reportToIdSet.has(id) ? "reportTo" : ccToIdSet.has(id) ? "ccTo" : undefined,
          })
        } else {
          return { ok: false, error: "One or more selected recipients no longer have access to this project." }
        }
      }
    }

    const externalRows = normalizeExternal(convertedExternalRecipients)

    const { data: existing, error: existingError } = await admin
      .from("report_cc_recipients")
      .select("id, recipient_type, user_id, external_name, external_email, external_company, external_role")
      .eq("project_id", input.projectId)
      .eq("response_id", input.responseId)
      .eq("recipient_context", input.context)
    if (existingError) throw existingError

    const existingInternal = new Map<string, any>((existing ?? []).filter((row: any) => row.recipient_type === "internal").map((row: any) => [row.user_id as string, row]))
    const existingExternal = new Map<string, any>((existing ?? []).filter((row: any) => row.recipient_type === "external").map((row: any) => [String(row.external_email).toLowerCase(), row]))
    const keepInternal = new Set(validInternalUserIds)
    const keepExternal = new Set(externalRows.map((row) => row.email))
    const removeIds = (existing ?? [])
      .filter((row: any) => row.recipient_type === "internal" ? !keepInternal.has(row.user_id) : !keepExternal.has(String(row.external_email).toLowerCase()))
      .map((row: any) => row.id as string)
    if (removeIds.length) {
      const { error } = await admin.from("report_cc_recipients").delete().in("id", removeIds)
      if (error) throw error
    }

    for (const external of externalRows) {
      const current = existingExternal.get(external.email)
      if (!current) continue
      const { error } = await admin
        .from("report_cc_recipients")
        .update({ external_name: external.name, external_company: external.company, external_role: external.role })
        .eq("id", current.id)
      if (error) throw error
    }

    type PendingRecipientInsert =
      | { type: "internal"; userId: string }
      | { type: "external"; external: (typeof externalRows)[number] }

    const validInternalSet = new Set(validInternalUserIds)
    const externalByClientId = new Map(externalRows.map((row) => [row.clientId, row] as const))
    const pendingInserts: PendingRecipientInsert[] = []
    const queuedInternal = new Set<string>()
    const queuedExternal = new Set<string>()

    const queueInternal = (userId: string) => {
      if (!validInternalSet.has(userId) || existingInternal.has(userId) || queuedInternal.has(userId)) return
      queuedInternal.add(userId)
      pendingInserts.push({ type: "internal", userId })
    }
    const queueConvertedParticipant = (candidateId: string) => {
      const external = externalByClientId.get(candidateId)
      if (!external || existingExternal.has(external.email) || queuedExternal.has(external.email)) return
      queuedExternal.add(external.email)
      pendingInserts.push({ type: "external", external })
    }
    const queueExternal = (external: (typeof externalRows)[number]) => {
      if (existingExternal.has(external.email) || queuedExternal.has(external.email)) return
      queuedExternal.add(external.email)
      pendingInserts.push({ type: "external", external })
    }

    if (hasGroupedSelection) {
      for (const id of reportToUserIds) {
        queueInternal(id)
        queueConvertedParticipant(id)
      }
      for (const external of externalRows.filter((row) => row.group === "reportTo")) queueExternal(external)
      for (const id of ccToUserIds) {
        queueInternal(id)
        queueConvertedParticipant(id)
      }
      for (const external of externalRows.filter((row) => row.group === "ccTo")) queueExternal(external)
    }
    for (const id of validInternalUserIds) queueInternal(id)
    for (const external of externalRows) queueExternal(external)

    const inserted: any[] = []
    for (const pending of pendingInserts) {
      if (pending.type === "internal") {
        const { data, error } = await admin
          .from("report_cc_recipients")
          .insert({
            project_id: input.projectId,
            response_id: input.responseId,
            recipient_context: input.context,
            recipient_type: "internal",
            user_id: pending.userId,
            added_by: actorId,
          })
          .select("id, user_id, recipient_type")
          .single()
        if (error && error.code !== "23505") throw error
        if (data) inserted.push(data)
      } else {
        const external = pending.external
        const { data, error } = await admin
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
    }

    const stage = Array.isArray(term?.project_stages) ? term.project_stages[0] : term?.project_stages || response.project_stages
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
    if (emailRecipients.length) {
      after(async () => {
        try {
          const emailResults = await sendReportCcEmails({
            context: input.context,
            projectName: project?.name ?? "Project",
            stageName: stage?.name ?? "Stage",
            termName: term?.report_name ?? stage?.name ?? "Report",
            reportNumber: response.report_number,
            reportTitle: response.report_title,
            href: appHref(href),
            recipients: emailRecipients,
          })
          const emailFailures = emailResults.filter((result) => result.status === "failed").length
          for (const emailResult of emailResults) {
            await admin
              .from("report_cc_recipients")
              .update({
                email_sent_at: emailResult.status === "sent" ? new Date().toISOString() : null,
                email_status: emailResult.status,
              })
              .eq("id", emailResult.recipientRowId)
          }
          await audit({
            actorId,
            action: "save_report_cc_recipients",
            entityType: "term_response",
            entityId: input.responseId,
            projectId: input.projectId,
            metadata: {
              context: input.context,
              internalCount: validInternalUserIds.length,
              externalCount: externalRows.length,
              insertedCount: inserted.length,
              emailFailures,
            },
          })
        } catch {
          // Ignore background email task error
        }
      })
    }

    const recipients = await loadReportCcRecipients(input.projectId, input.responseId, input.context)
    revalidatePath(`/projects/${input.projectId}`)

    return { ok: true, recipients, emailFailures: 0 }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to save CC recipients." }
  }
}
