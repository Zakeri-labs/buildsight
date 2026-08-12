"use server"

import { revalidatePath } from "next/cache"
import { requireOnboarded } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import {
  INITIAL_DOCUMENTS_BUCKET,
  getInitialDocumentUploadCategoryFromPath,
  isInitialDocumentCategory,
  validateInitialDocumentFile,
  type InitialDocumentCategory,
} from "@/lib/initial-documents/config"

export type SaveInitialDocumentInput = {
  id: string
  projectId: string
  category: InitialDocumentCategory
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
}

type SaveInitialDocumentResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function saveInitialDocumentAction(input: SaveInitialDocumentInput): Promise<SaveInitialDocumentResult> {
  const session = await requireOnboarded()
  if (!UUID_PATTERN.test(input.id) || !UUID_PATTERN.test(input.projectId)) {
    return { ok: false, error: "The uploaded file reference is invalid." }
  }
  if (!isInitialDocumentCategory(input.category)) {
    return { ok: false, error: "The selected document category is invalid." }
  }

  const fileName = input.originalFilename.trim()
  const validationError = validateInitialDocumentFile({
    name: fileName,
    size: input.sizeBytes,
    type: input.mimeType,
  })
  if (validationError) return { ok: false, error: validationError }

  const storagePath = input.storagePath.trim()
  const expectedPrefix = `${input.projectId}/${session.userId}/${input.id}/`
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) {
    return { ok: false, error: "The uploaded file does not belong to this project." }
  }
  const uploadCategory = getInitialDocumentUploadCategoryFromPath(storagePath)
  if (!uploadCategory || uploadCategory.category !== input.category) {
    return { ok: false, error: "The uploaded file category is invalid." }
  }

  const supabase = await createClient()
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", input.projectId)
    .maybeSingle()
  if (projectError || !project) return { ok: false, error: "You do not have access to this project." }

  const { data: existing, error: existingError } = await supabase
    .from("initial_docs")
    .select("id, project_id, file_path, uploaded_by")
    .eq("id", input.id)
    .maybeSingle()
  if (existingError) return { ok: false, error: existingError.message || "Unable to verify the project document record." }
  if (existing) {
    const isSameUpload = existing.project_id === input.projectId
      && existing.file_path === storagePath
      && existing.uploaded_by === session.userId
    return isSameUpload
      ? { ok: true, id: existing.id }
      : { ok: false, error: "The uploaded file reference is already in use." }
  }

  const { error } = await supabase.from("initial_docs").insert({
    id: input.id,
    project_id: input.projectId,
    file_name: fileName.slice(0, 255),
    original_file_name: fileName.slice(0, 255),
    file_path: storagePath,
    storage_bucket: INITIAL_DOCUMENTS_BUCKET,
    mime_type: input.mimeType.trim() || "application/octet-stream",
    file_size: input.sizeBytes,
    category: input.category,
    uploaded_by: session.userId,
  })

  if (error) return { ok: false, error: error.message || "Unable to save the project document record." }

  await supabase.from("audit_logs").insert({
    actor_id: session.userId,
    action: "initial_doc.uploaded",
    entity_type: "initial_doc",
    entity_id: input.id,
    project_id: input.projectId,
    metadata: { file_name: fileName, category: input.category, upload_category: uploadCategory.value },
  })

  revalidatePath("/initial-documents")
  revalidatePath(`/projects/${input.projectId}`)
  return { ok: true, id: input.id }
}

export type InitialDocumentRecord = {
  id: string
  projectId: string
  fileName: string
  originalFileName: string | null
  filePath: string
  fileSize: number
  category: string
}

export async function getInitialDocumentsForProjectAction(
  projectId: string,
): Promise<{ ok: true; documents: InitialDocumentRecord[] } | { ok: false; error: string }> {
  try {
    const session = await requireOnboarded()
    if (!UUID_PATTERN.test(projectId)) {
      return { ok: false, error: "Invalid project ID." }
    }
    const supabase = await createClient()
    const { data: rows, error } = await supabase
      .from("initial_docs")
      .select("id, project_id, file_name, original_file_name, file_path, file_size, category")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[getInitialDocumentsForProjectAction] Database error:", error, { projectId })
      return { ok: false, error: error.message || "Failed to query project documents." }
    }
    const documents: InitialDocumentRecord[] = (rows ?? []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      fileName: row.file_name,
      originalFileName: row.original_file_name,
      filePath: row.file_path,
      fileSize: Number(row.file_size) || 0,
      category: row.category || "other",
    }))
    return { ok: true, documents }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load project documents."
    console.error("[getInitialDocumentsForProjectAction] Unexpected error:", err, { projectId })
    return { ok: false, error: message }
  }
}

export async function deleteInitialDocumentAction(
  id: string,
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireOnboarded()
    if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(projectId)) {
      return { ok: false, error: "Invalid document parameters." }
    }
    const supabase = await createClient()
    const { error } = await supabase
      .from("initial_docs")
      .delete()
      .eq("id", id)
      .eq("project_id", projectId)

    if (error) {
      console.error("[deleteInitialDocumentAction] Database error:", error, { id, projectId })
      return { ok: false, error: error.message || "Failed to delete document record." }
    }
    revalidatePath("/initial-documents")
    revalidatePath(`/projects/${projectId}`)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete document."
    console.error("[deleteInitialDocumentAction] Unexpected error:", err, { id, projectId })
    return { ok: false, error: message }
  }
}
