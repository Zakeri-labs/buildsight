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
    .select("project_stage_id")
    .eq("id", attachment.response_id)
    .eq("project_id", projectId)
    .maybeSingle()
  if (responseError) throw responseError
  if (!response?.project_stage_id) return null

  const { data: stage, error: stageError } = await admin
    .from("project_stages")
    .select("status")
    .eq("id", response.project_stage_id)
    .eq("project_id", projectId)
    .maybeSingle()
  if (stageError) throw stageError
  if (!stage) return null

  return { active: stage.status !== "disabled" }
}
