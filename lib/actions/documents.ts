"use server"

import { revalidatePath } from "next/cache"
import { getSelectedProjectId } from "@/lib/project-scope"
import { requireOnboarded } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { isDocumentTypeValue, type DocumentTypeValue } from "@/lib/documents/document-types"
import {
  getRichTextImagePaths,
  isRichTextDocument,
  richTextHasContent,
  type RichTextDocument,
} from "@/lib/documents/rich-text"

export type SaveDocumentResult =
  | { ok: true; documentId: string; reference: string }
  | { ok: false; error: string }

type DocumentWriteInput = {
  projectId: string
  title: string
  documentType: string
  status: "draft" | "published"
  content: RichTextDocument
}

function validateDocumentInput(input: DocumentWriteInput): { ok: true; title: string; documentType: DocumentTypeValue } | { ok: false; error: string } {
  if (input.status !== "draft" && input.status !== "published") {
    return { ok: false, error: "The requested document status is invalid." }
  }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Document title is required." }
  if (title.length > 180) return { ok: false, error: "Document title must be 180 characters or fewer." }
  if (!isDocumentTypeValue(input.documentType)) return { ok: false, error: "Select a valid document type." }
  if (!isRichTextDocument(input.content)) return { ok: false, error: "The document content is invalid." }
  if (input.status === "published" && !richTextHasContent(input.content)) {
    return { ok: false, error: "Add document content before publishing." }
  }

  const hasInvalidImagePath = getRichTextImagePaths(input.content).some((path) => {
    const parts = path.split("/")
    return parts.length < 3 || parts[0] !== input.projectId || parts.includes("..")
  })
  if (hasInvalidImagePath) {
    return { ok: false, error: "One or more embedded images do not belong to the document project." }
  }

  if (JSON.stringify(input.content).length > 2_000_000) {
    return { ok: false, error: "The document is too large to save. Remove some content and try again." }
  }

  return { ok: true, title, documentType: input.documentType }
}

export async function createDocumentAction(input: DocumentWriteInput): Promise<SaveDocumentResult> {
  const session = await requireOnboarded()
  const selectedProjectId = await getSelectedProjectId()

  if (!selectedProjectId || selectedProjectId !== input.projectId) {
    return { ok: false, error: "The selected project is no longer valid. Return to Documents and select a project." }
  }

  const validation = validateDocumentInput(input)
  if (!validation.ok) return validation

  const supabase = await createClient()
  const { data: project } = await supabase.from("projects").select("id").eq("id", input.projectId).maybeSingle()
  if (!project) return { ok: false, error: "You do not have access to the selected project." }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      project_id: input.projectId,
      reference: null,
      title: validation.title,
      document_type: validation.documentType,
      status: input.status,
      content: input.content,
      created_by: session.userId,
      published_at: input.status === "published" ? new Date().toISOString() : null,
    })
    .select("id, reference")
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? "Unable to save the document." }

  await supabase.from("audit_logs").insert({
    actor_id: session.userId,
    action: input.status === "published" ? "document.published" : "document.draft_created",
    entity_type: "document",
    entity_id: data.id,
    project_id: input.projectId,
    metadata: { reference: data.reference, title: validation.title, document_type: validation.documentType },
  })

  revalidateDocumentPaths(data.id, input.projectId)
  return { ok: true, documentId: data.id, reference: data.reference }
}

export async function updateDocumentAction(
  input: DocumentWriteInput & { documentId: string },
): Promise<SaveDocumentResult> {
  const session = await requireOnboarded()
  const selectedProjectId = await getSelectedProjectId()

  if (selectedProjectId && selectedProjectId !== input.projectId) {
    return { ok: false, error: "The active project does not match this document. Return to Documents and select the correct project." }
  }

  const validation = validateDocumentInput(input)
  if (!validation.ok) return validation

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("documents")
    .select("id, project_id, reference, status, published_at")
    .eq("id", input.documentId)
    .maybeSingle()

  if (!existing || existing.project_id !== input.projectId) {
    return { ok: false, error: "This document is unavailable or you no longer have permission to edit it." }
  }

  const publishedAt = input.status === "published"
    ? existing.published_at ?? new Date().toISOString()
    : null

  const { data, error } = await supabase
    .from("documents")
    .update({
      title: validation.title,
      document_type: validation.documentType,
      status: input.status,
      content: input.content,
      published_at: publishedAt,
    })
    .eq("id", input.documentId)
    .eq("project_id", input.projectId)
    .select("id, reference")
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? "Unable to update the document." }

  await supabase.from("audit_logs").insert({
    actor_id: session.userId,
    action: input.status === "published" ? "document.updated_and_published" : "document.draft_updated",
    entity_type: "document",
    entity_id: data.id,
    project_id: input.projectId,
    metadata: { reference: data.reference, title: validation.title, document_type: validation.documentType },
  })

  revalidateDocumentPaths(data.id, input.projectId)
  return { ok: true, documentId: data.id, reference: data.reference }
}

function revalidateDocumentPaths(documentId: string, projectId: string) {
  revalidatePath("/documents")
  revalidatePath(`/documents/${documentId}`)
  revalidatePath(`/documents/${documentId}/edit`)
  revalidatePath(`/projects/${projectId}`)
}
