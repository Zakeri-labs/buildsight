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

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

type DocumentWriteInput = {
  projectId: string
  title: string
  documentType: string
  status: "draft" | "published"
  content: RichTextDocument
}

function validateDocumentInput(input: DocumentWriteInput): { ok: true; title: string; documentType: DocumentTypeValue } | { ok: false; error: string } {
  if (input.status !== "draft" && input.status !== "published") {
    return { ok: false, error: "The requested letter status is invalid." }
  }

  const title = input.title.trim()
  if (!title) return { ok: false, error: "Letter title is required." }
  if (title.length > 180) return { ok: false, error: "Letter title must be 180 characters or fewer." }
  if (!isDocumentTypeValue(input.documentType)) return { ok: false, error: "Select a valid letter type." }
  if (!isRichTextDocument(input.content)) return { ok: false, error: "The letter content is invalid." }
  if (input.status === "published" && !richTextHasContent(input.content)) {
    return { ok: false, error: "Add letter content before publishing." }
  }

  const hasInvalidImagePath = getRichTextImagePaths(input.content).some((path) => {
    const parts = path.split("/")
    return parts.length < 3 || parts[0] !== input.projectId || parts.includes("..")
  })
  if (hasInvalidImagePath) {
    return { ok: false, error: "One or more embedded images do not belong to the letter project." }
  }

  if (JSON.stringify(input.content).length > 2_000_000) {
    return { ok: false, error: "The letter is too large to save. Remove some content and try again." }
  }

  return { ok: true, title, documentType: input.documentType }
}

export async function createDocumentAction(input: DocumentWriteInput): Promise<SaveDocumentResult> {
  const session = await requireOnboarded()
  const selectedProjectId = await getSelectedProjectId()

  if (!selectedProjectId || selectedProjectId !== input.projectId) {
    return { ok: false, error: "The selected project is no longer valid. Return to Letters and select a project." }
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

  if (error || !data) return { ok: false, error: error?.message ?? "Unable to save the letter." }

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
  const validation = validateDocumentInput(input)
  if (!validation.ok) return validation

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from("documents")
    .select("id, project_id, reference, status, published_at")
    .eq("id", input.documentId)
    .maybeSingle()

  if (!existing || existing.project_id !== input.projectId) {
    return { ok: false, error: "This letter is unavailable or you no longer have permission to edit it." }
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

  if (error || !data) return { ok: false, error: error?.message ?? "Unable to update the letter." }

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
    return { ok: false, error: "The selected project is no longer valid. Return to Letters and select a project." }
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

  if (error || !data) return { ok: false, error: error?.message ?? "Unable to create the uploaded letter records." }

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

export type ConstructionLetterRecipientSnapshot = {
  participantId: string
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
  role: string | null
  participantType: string | null
}

function normalizeRecipientIds(value: unknown): string[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const ids = value.map((item) => typeof item === "string" ? item.trim() : "")
  if (ids.some((id) => !isUuid(id))) return null
  const distinct = Array.from(new Set(ids))
  return distinct.length === ids.length ? distinct : null
}

export async function createConstructionDocumentAction(input: {
  projectId: string
  title: string
  documentType: string
  shortDescription?: string
  documentDetails?: string
  status?: "draft" | "published"
  letterToParticipantIds?: string[]
  ccParticipantIds?: string[]
  requireRecipients?: boolean
}): Promise<SaveDocumentResult> {
  const session = await requireOnboarded()
  if (!isUuid(input.projectId)) {
    return { ok: false, error: "Select a valid Project." }
  }
  const projectId = input.projectId.trim()
  const title = input.title.trim()
  const shortDescription = input.shortDescription?.trim() ?? ""
  const documentDetails = input.documentDetails?.trimEnd()
  const status = input.status ?? "draft"
  const letterToParticipantIds = normalizeRecipientIds(input.letterToParticipantIds)
  const ccParticipantIds = normalizeRecipientIds(input.ccParticipantIds)

  if (!title) return { ok: false, error: "Subject is required." }
  if (title.length > 180) return { ok: false, error: "Subject must be 180 characters or fewer." }
  if (shortDescription.length > 2_000) return { ok: false, error: "Short description must be 2,000 characters or fewer." }
  if (documentDetails !== undefined && documentDetails.length > 100_000) {
    return { ok: false, error: "Letter text must be 100,000 characters or fewer." }
  }
  if (!isConstructionDocumentType(input.documentType)) {
    return { ok: false, error: "Select a valid letter type." }
  }
  if (status !== "draft" && status !== "published") {
    return { ok: false, error: "The requested letter status is invalid." }
  }
  if (!letterToParticipantIds || !ccParticipantIds) {
    return { ok: false, error: "One or more selected recipients are invalid." }
  }
  if (letterToParticipantIds.length > 50 || ccParticipantIds.length > 50) {
    return { ok: false, error: "Too many recipients were selected." }
  }
  if (input.requireRecipients && letterToParticipantIds.length === 0) {
    return { ok: false, error: "Letter To is required." }
  }
  const duplicateRecipientId = letterToParticipantIds.find((id) => ccParticipantIds.includes(id))
  if (duplicateRecipientId) {
    return { ok: false, error: "A recipient cannot be selected in both Letter To and CC." }
  }

  const supabase = await createClient()
  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle()
  if (!project) return { ok: false, error: "You do not have access to the selected project." }

  const allRecipientIds = [...letterToParticipantIds, ...ccParticipantIds]
  const recipientSnapshots = new Map<string, ConstructionLetterRecipientSnapshot>()
  if (allRecipientIds.length > 0) {
    const { data: participants, error: participantsError } = await supabase
      .from("project_participants")
      .select("id, organization_name, participant_type, project_role, key_contact_name, key_contact_email, key_contact_phone, status")
      .eq("project_id", projectId)
      .eq("status", "active")
      .in("id", allRecipientIds)

    if (participantsError) {
      return { ok: false, error: "Unable to validate the selected Letter recipients." }
    }
    if ((participants ?? []).length !== allRecipientIds.length) {
      return { ok: false, error: "One or more selected recipients are not valid for this Project." }
    }

    for (const participant of participants ?? []) {
      recipientSnapshots.set(participant.id, {
        participantId: participant.id,
        name: participant.organization_name,
        contactName: participant.key_contact_name ?? null,
        email: participant.key_contact_email ?? null,
        phone: participant.key_contact_phone ?? null,
        role: participant.project_role ?? null,
        participantType: participant.participant_type ?? null,
      })
    }
  }

  const letterToRecipients = letterToParticipantIds.map((id) => recipientSnapshots.get(id)!)
  const ccRecipients = ccParticipantIds.map((id) => recipientSnapshots.get(id)!)

  const documentType: ConstructionDocumentTypeValue = input.documentType
  const { data, error } = await supabase
    .from("documents")
    .insert({
      project_id: projectId,
      reference: null,
      title,
      document_type: documentType,
      status,
      workflow_status: "open",
      short_description: shortDescription || null,
      document_details: documentDetails ?? getDocumentDetailsTemplate(documentType),
      letter_to_recipients: letterToRecipients,
      cc_recipients: ccRecipients,
      content: EMPTY_RICH_TEXT_DOCUMENT,
      created_by: session.userId,
      creation_mode: "advanced",
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select("id, reference")
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? "Unable to create the letter." }

  await supabase.from("audit_logs").insert({
    actor_id: session.userId,
    action: "document.construction_created",
    entity_type: "document",
    entity_id: data.id,
    project_id: projectId,
    metadata: {
      reference: data.reference,
      title,
      document_type: documentType,
      status,
      letter_to_count: letterToRecipients.length,
      cc_count: ccRecipients.length,
    },
  })

  revalidateDocumentPaths(data.id, projectId)
  return { ok: true, documentId: data.id, reference: data.reference }
}

export async function updateConstructionDocumentDetailsAction(input: {
  documentId: string
  projectId: string
  details: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOnboarded()
  const details = input.details.trimEnd()
  if (details.length > 100_000) return { ok: false, error: "Letter details must be 100,000 characters or fewer." }

  const supabase = await createClient()
  const { data: doc } = await supabase
    .from("documents")
    .select("status")
    .eq("id", input.documentId)
    .maybeSingle()

  if (doc?.status === "published") {
    return { ok: false, error: "Published letters are final and cannot be modified." }
  }

  const { data, error } = await supabase
    .from("documents")
    .update({ document_details: details })
    .eq("id", input.documentId)
    .eq("project_id", input.projectId)
    .select("id")
    .maybeSingle()

  if (error || !data) return { ok: false, error: error?.message ?? "Unable to save letter details." }

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
    .select("id, project_id, status")
    .eq("id", input.documentId)
    .eq("project_id", input.projectId)
    .maybeSingle()
  if (!document) return { ok: false, error: "This letter is unavailable." }
  if (document.status === "published") {
    return { ok: false, error: "Published letters are final and cannot be modified." }
  }

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
      return { ok: false, error: "One or more uploads do not belong to this letter." }
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

  const { data: doc } = await supabase
    .from("documents")
    .select("status")
    .eq("id", input.documentId)
    .maybeSingle()

  if (doc?.status === "published") {
    return { ok: false, error: "Published letters are final and cannot be modified." }
  }

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
