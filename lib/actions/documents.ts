"use server"

import { revalidatePath } from "next/cache"
import { getSelectedProjectId } from "@/lib/project-scope"
import { requireOnboarded } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { isDocumentTypeValue, type DocumentTypeValue } from "@/lib/documents/document-types"
import {
  getDocumentDetailsTemplate,
  isConstructionDocumentType,
  type ConstructionDocumentTypeValue,
} from "@/lib/documents/construction-document-types"
import {
  getSimpleUploadCategory,
  isSimpleUploadCategory,
  validateSimpleUploadFile,
  type SimpleUploadCategoryValue,
} from "@/lib/documents/simple-upload"
import {
  getRichTextImagePaths,
  isRichTextDocument,
  richTextHasContent,
  type RichTextDocument,
  EMPTY_RICH_TEXT_DOCUMENT,
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

  const publishedAt = input.status === "published" ? existing.published_at ?? new Date().toISOString() : null

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

export type SimpleUploadedFileInput = {
  category: SimpleUploadCategoryValue
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
}

export type CreateUploadedDocumentsResult =
  | { ok: true; documentIds: string[]; count: number }
  | { ok: false; error: string }

export async function createUploadedDocumentsAction(input: {
  projectId: string
  files: SimpleUploadedFileInput[]
}): Promise<CreateUploadedDocumentsResult> {
  const session = await requireOnboarded()
  const selectedProjectId = await getSelectedProjectId()

  if (selectedProjectId && selectedProjectId !== input.projectId) {
    return { ok: false, error: "The selected project is no longer valid. Return to Documents and select a project." }
  }
  if (!Array.isArray(input.files) || input.files.length === 0) {
    return { ok: false, error: "Select at least one file to upload." }
  }
  if (input.files.length > 26) {
    return { ok: false, error: "Too many files were selected for one upload." }
  }

  const expectedPrefix = `${input.projectId}/${session.userId}/`
  const rows = []
  for (const file of input.files) {
    if (!isSimpleUploadCategory(file.category)) {
      return { ok: false, error: "One of the selected upload categories is invalid." }
    }
    const category = getSimpleUploadCategory(file.category)
    if (!category) return { ok: false, error: "One of the selected upload categories is invalid." }

    const validationError = validateSimpleUploadFile({
      name: file.originalFilename,
      size: file.sizeBytes,
      type: file.mimeType,
    })
    if (validationError) return { ok: false, error: validationError }

    const storagePath = file.storagePath.trim()
    if (!storagePath.startsWith(expectedPrefix) || !storagePath.includes("/files/") || storagePath.includes("..")) {
      return { ok: false, error: "One or more uploaded files do not belong to the selected project." }
    }

    rows.push({
      project_id: input.projectId,
      reference: null,
      title: file.originalFilename.trim().slice(0, 180),
      document_type: category.documentType,
      status: "published",
      content: EMPTY_RICH_TEXT_DOCUMENT,
      created_by: session.userId,
      published_at: new Date().toISOString(),
      creation_mode: "simple",
      simple_upload_category: category.value,
      file_storage_path: storagePath,
      original_filename: file.originalFilename.trim(),
      file_mime_type: file.mimeType.trim() || "application/octet-stream",
      file_size_bytes: file.sizeBytes,
    })
  }

  const supabase = await createClient()
  const { data: project } = await supabase.from("projects").select("id").eq("id", input.projectId).maybeSingle()
  if (!project) return { ok: false, error: "You do not have access to the selected project." }

  const { data, error } = await supabase
    .from("documents")
    .insert(rows)
    .select("id, reference, title, document_type, simple_upload_category")

  if (error || !data) return { ok: false, error: error?.message ?? "Unable to create the uploaded document records." }

  await supabase.from("audit_logs").insert(data.map((document: any) => ({
    actor_id: session.userId,
    action: "document.file_uploaded",
    entity_type: "document",
    entity_id: document.id,
    project_id: input.projectId,
    metadata: {
      reference: document.reference,
      title: document.title,
      document_type: document.document_type,
      simple_upload_category: document.simple_upload_category,
    },
  })))

  for (const document of data) revalidateDocumentPaths(document.id, input.projectId)
  return { ok: true, documentIds: data.map((document: any) => document.id), count: data.length }
}

export async function createConstructionDocumentAction(input: {
  projectId: string
  title: string
  documentType: string
  shortDescription?: string
}): Promise<SaveDocumentResult> {
  const session = await requireOnboarded()
  const selectedProjectId = await getSelectedProjectId()
  if (!selectedProjectId || selectedProjectId !== input.projectId) {
    return { ok: false, error: "Select the correct project before creating a document." }
  }

  const title = input.title.trim()
  const shortDescription = input.shortDescription?.trim() ?? ""
  if (!title) return { ok: false, error: "Document title is required." }
  if (title.length > 180) return { ok: false, error: "Document title must be 180 characters or fewer." }
  if (shortDescription.length > 2_000) return { ok: false, error: "Short description must be 2,000 characters or fewer." }
  if (!isConstructionDocumentType(input.documentType)) {
    return { ok: false, error: "Select a valid construction document type." }
  }

  const supabase = await createClient()
  const { data: project } = await supabase.from("projects").select("id").eq("id", input.projectId).maybeSingle()
  if (!project) return { ok: false, error: "You do not have access to the selected project." }

  const documentType: ConstructionDocumentTypeValue = input.documentType
  const { data, error } = await supabase
    .from("documents")
    .insert({
      project_id: input.projectId,
      reference: null,
      title,
      document_type: documentType,
      status: "draft",
      workflow_status: "open",
      short_description: shortDescription || null,
      document_details: getDocumentDetailsTemplate(documentType),
      content: EMPTY_RICH_TEXT_DOCUMENT,
      created_by: session.userId,
      creation_mode: "advanced",
    })
    .select("id, reference")
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? "Unable to create the document." }

  await supabase.from("audit_logs").insert({
    actor_id: session.userId,
    action: "document.construction_created",
    entity_type: "document",
    entity_id: data.id,
    project_id: input.projectId,
    metadata: { reference: data.reference, title, document_type: documentType },
  })

  revalidateDocumentPaths(data.id, input.projectId)
  return { ok: true, documentId: data.id, reference: data.reference }
}

export async function updateConstructionDocumentDetailsAction(input: {
  documentId: string
  projectId: string
  details: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOnboarded()
  const details = input.details.trimEnd()
  if (details.length > 100_000) return { ok: false, error: "Document details must be 100,000 characters or fewer." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("documents")
    .update({ document_details: details })
    .eq("id", input.documentId)
    .eq("project_id", input.projectId)
    .select("id")
    .maybeSingle()

  if (error || !data) return { ok: false, error: error?.message ?? "Unable to save document details." }

  await supabase.from("audit_logs").insert({
    actor_id: session.userId,
    action: "document.details_updated",
    entity_type: "document",
    entity_id: input.documentId,
    project_id: input.projectId,
    metadata: {},
  })
  revalidateDocumentPaths(input.documentId, input.projectId)
  return { ok: true }
}

export type DocumentAttachmentInput = {
  attachmentType: "file" | "image"
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
}

export async function addDocumentAttachmentsAction(input: {
  documentId: string
  projectId: string
  attachments: DocumentAttachmentInput[]
}): Promise<{ ok: true; attachmentIds: string[] } | { ok: false; error: string }> {
  const session = await requireOnboarded()
  if (!input.attachments.length) return { ok: false, error: "Select at least one attachment." }
  if (input.attachments.length > 100) return { ok: false, error: "Upload up to 100 attachments at a time." }

  const supabase = await createClient()
  const { data: document } = await supabase
    .from("documents")
    .select("id, project_id")
    .eq("id", input.documentId)
    .eq("project_id", input.projectId)
    .maybeSingle()
  if (!document) return { ok: false, error: "This document is unavailable." }

  const rows = []
  for (const attachment of input.attachments) {
    const filename = attachment.originalFilename.trim()
    const mimeType = attachment.mimeType.trim() || "application/octet-stream"
    if (!filename || filename.length > 255) return { ok: false, error: "One attachment has an invalid file name." }
    if (!Number.isFinite(attachment.sizeBytes) || attachment.sizeBytes <= 0 || attachment.sizeBytes > 50 * 1024 * 1024) {
      return { ok: false, error: "Each attachment must be larger than 0 bytes and no more than 50 MB." }
    }
    if (attachment.attachmentType !== "file" && attachment.attachmentType !== "image") {
      return { ok: false, error: "One attachment has an invalid type." }
    }
    if (attachment.attachmentType === "image" && !mimeType.startsWith("image/")) {
      return { ok: false, error: "Only image files can be added to the Images section." }
    }
    if (attachment.attachmentType === "file" && mimeType.startsWith("image/")) {
      return { ok: false, error: "Add image files in the Images section." }
    }

    const folder = attachment.attachmentType === "image" ? "images" : "files"
    const expectedPrefix = `${input.projectId}/${session.userId}/documents/${input.documentId}/${folder}/`
    if (!attachment.storagePath.startsWith(expectedPrefix) || attachment.storagePath.includes("..")) {
      return { ok: false, error: "One or more uploads do not belong to this document." }
    }

    rows.push({
      document_id: input.documentId,
      project_id: input.projectId,
      attachment_type: attachment.attachmentType,
      storage_path: attachment.storagePath,
      original_filename: filename,
      mime_type: mimeType,
      size_bytes: attachment.sizeBytes,
      created_by: session.userId,
    })
  }

  const { data, error } = await supabase.from("document_attachments").insert(rows).select("id")
  if (error || !data) return { ok: false, error: error?.message ?? "Unable to save attachment records." }

  await supabase.from("audit_logs").insert({
    actor_id: session.userId,
    action: "document.attachments_added",
    entity_type: "document",
    entity_id: input.documentId,
    project_id: input.projectId,
    metadata: { count: data.length },
  })
  revalidateDocumentPaths(input.documentId, input.projectId)
  return { ok: true, attachmentIds: data.map((row: any) => row.id) }
}

export async function removeDocumentAttachmentAction(input: {
  attachmentId: string
  documentId: string
  projectId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOnboarded()
  const supabase = await createClient()
  const { data: attachment } = await supabase
    .from("document_attachments")
    .select("id, storage_path, project_id, document_id")
    .eq("id", input.attachmentId)
    .eq("document_id", input.documentId)
    .eq("project_id", input.projectId)
    .maybeSingle()

  if (!attachment) return { ok: false, error: "Attachment not found or you do not have permission to remove it." }

  const { error } = await supabase.from("document_attachments").delete().eq("id", attachment.id)
  if (error) return { ok: false, error: error.message }

  await supabase.storage.from("document-images").remove([attachment.storage_path])
  await supabase.from("audit_logs").insert({
    actor_id: session.userId,
    action: "document.attachment_removed",
    entity_type: "document",
    entity_id: input.documentId,
    project_id: input.projectId,
    metadata: { attachment_id: input.attachmentId },
  })
  revalidateDocumentPaths(input.documentId, input.projectId)
  return { ok: true }
}

function revalidateDocumentPaths(documentId: string, projectId: string) {
  revalidatePath("/")
  revalidatePath("/documents")
  revalidatePath(`/documents/${documentId}`)
  revalidatePath(`/documents/${documentId}/edit`)
  revalidatePath(`/projects/${projectId}`)
}
