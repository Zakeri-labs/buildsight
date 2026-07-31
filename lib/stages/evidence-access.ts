import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export async function loadStageEvidenceAccess(projectId: string, storagePath: string) {
  const admin = createAdminClient()
  const { data: attachment, error: attachmentError } = await admin
    .from("response_attachments")
    .select("id, response_id")
    .eq("project_id", projectId)
    .eq("storage_path", storagePath)
    .maybeSingle()
  if (attachmentError) throw attachmentError
  if (!attachment) return null

  const { data: response, error: responseError } = await admin
    .from("term_responses")
    .select("project_stage_term_id")
    .eq("id", attachment.response_id)
    .eq("project_id", projectId)
    .maybeSingle()
  if (responseError) throw responseError
  if (!response) return null

  const { data: term, error: termError } = await admin
    .from("project_stage_terms")
    .select("is_active, project_stage_id, parent_term_id")
    .eq("id", response.project_stage_term_id)
    .maybeSingle()
  if (termError) throw termError
  if (!term) return null

  let parentActive = true
  if (term.parent_term_id) {
    const { data: parent, error: parentError } = await admin
      .from("project_stage_terms")
      .select("is_active")
      .eq("id", term.parent_term_id)
      .maybeSingle()
    if (parentError) throw parentError
    parentActive = parent?.is_active === true
  }

  const { data: stage, error: stageError } = await admin
    .from("project_stages")
    .select("status")
    .eq("id", term.project_stage_id)
    .eq("project_id", projectId)
    .maybeSingle()
  if (stageError) throw stageError
  if (!stage) return null

  return { active: term.is_active !== false && parentActive && stage.status !== "disabled" }
}
