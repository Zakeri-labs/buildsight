"use server"

import { revalidatePath } from "next/cache"
import { getSelectedProjectId } from "@/lib/project-scope"
import { requireOnboarded } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getRichTextImagePaths, isRichTextDocument, richTextHasContent, type RichTextDocument } from "@/lib/documents/rich-text"

export type SaveDocumentResult =
  | { ok: true; documentId: string; reference: string }
  | { ok: false; error: string }

export async function createDocumentAction(input: {
  projectId: string
  title: string
  documentType: string
  status: "draft" | "published"
  content: RichTextDocument
}): Promise<SaveDocumentResult> {
  const session = await requireOnboarded()
  const selectedProjectId = await getSelectedProjectId()

  if (!selectedProjectId || selectedProjectId !== input.projectId) {
    return { ok: false, error: "The selected project is no longer valid. Return to Documents and select a project." }
  }

  if (input.status !== "draft" && input.status !== "published") {
    return { ok: false, error: "The requested document status is invalid." }
  }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Document title is required." }
  if (title.length > 180) return { ok: false, error: "Document title must be 180 characters or fewer." }
  if (!isRichTextDocument(input.content)) return { ok: false, error: "The document content is invalid." }
  if (input.status === "published" && !richTextHasContent(input.content)) {
    return { ok: false, error: "Add document content before publishing." }
  }
  const hasInvalidImagePath = getRichTextImagePaths(input.content).some((path) => {
    const parts = path.split("/")
    return parts.length < 3 || parts[0] !== input.projectId || parts.includes("..")
  })
  if (hasInvalidImagePath) {
    return { ok: false, error: "One or more embedded images do not belong to the selected project." }
  }

  const allowedTypes = new Set(["general", "drawing", "submittal", "report", "contract"])
  const documentType = allowedTypes.has(input.documentType) ? input.documentType : "general"

  const serializedSize = JSON.stringify(input.content).length
  if (serializedSize > 2_000_000) {
    return { ok: false, error: "The document is too large to save. Remove some content and try again." }
  }

  const supabase = await createClient()
  const { data: project } = await supabase.from("projects").select("id").eq("id", input.projectId).maybeSingle()
  if (!project) return { ok: false, error: "You do not have access to the selected project." }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      project_id: input.projectId,
      reference: null,
      title,
      document_type: documentType,
      status: input.status,
      content: input.content,
      created_by: session.userId,
      published_at: input.status === "published" ? new Date().toISOString() : null,
    })
    .select("id, reference")
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Unable to save the document." }
  }

  await supabase.from("audit_logs").insert({
    actor_id: session.userId,
    action: input.status === "published" ? "document.published" : "document.draft_created",
    entity_type: "document",
    entity_id: data.id,
    project_id: input.projectId,
    metadata: { reference: data.reference, title },
  })

  revalidatePath("/documents")
  revalidatePath(`/documents/${data.id}`)
  revalidatePath(`/projects/${input.projectId}`)

  return { ok: true, documentId: data.id, reference: data.reference }
}
