import { notFound, redirect } from "next/navigation"
import { CreateLetterPage, type InitialDraftData } from "@/components/documents/create-letter-page"
import { requireOnboarded } from "@/lib/auth/session"
import { parseBilingualDocumentDetails } from "@/lib/documents/bilingual-details"
import {
  getConstructionDocumentType,
  isConstructionDocumentType,
  type ConstructionDocumentTypeValue,
} from "@/lib/documents/construction-document-types"
import { getLetterDetailsSchema } from "@/lib/documents/letter-details-schema"
import { normalizeDocumentType } from "@/lib/documents/document-types"
import { createClient } from "@/lib/supabase/server"

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnboarded()
  const { id } = await params
  const supabase = await createClient()

  const { data: document } = await supabase
    .from("documents")
    .select("id, project_id, reference, title, document_type, status, document_details, content, letter_to_recipients, cc_recipients, creation_mode, file_storage_path")
    .eq("id", id)
    .maybeSingle()

  if (!document) notFound()

  // Server-side Protection: Published / Sent letters are final and cannot be edited!
  if (document.status === "published" || document.creation_mode === "simple" || document.file_storage_path) {
    redirect(`/documents/${document.id}`)
  }

  const [{ data: project }, { data: attachmentRows }] = await Promise.all([
    supabase.from("projects").select("id, name, code").eq("id", document.project_id).maybeSingle(),
    supabase
      .from("document_attachments")
      .select("id, attachment_type, original_filename, storage_path, mime_type, size_bytes")
      .eq("document_id", document.id),
  ])

  if (!project) notFound()

  const constructionObj = getConstructionDocumentType(document.document_type)
  const canonicalType = constructionObj ? constructionObj.value : normalizeDocumentType(document.document_type)
  const docType = (isConstructionDocumentType(canonicalType) ? canonicalType : "other") as ConstructionDocumentTypeValue
  const parsed = parseBilingualDocumentDetails(document.document_details || document.content)
  const schema = getLetterDetailsSchema(docType)

  const initialFields =
    parsed.structuredFields ||
    (schema?.parseValuesFromText ? schema.parseValuesFromText(parsed.englishText || "") : {})

  const expectedText = schema ? schema.buildText(initialFields) : ""
  const isManuallyEdited = schema ? (parsed.englishText || "").trim() !== expectedText.trim() : false

  const initialDraft: InitialDraftData = {
    id: document.id,
    projectId: document.project_id,
    documentType: docType,
    title: document.title || "",
    englishText: parsed.englishText || "",
    attachArabic: parsed.attachArabic,
    structuredFields: initialFields,
    isManuallyEdited,
    letterToRecipientIds: Array.isArray(document.letter_to_recipients) ? document.letter_to_recipients : [],
    ccRecipientIds: Array.isArray(document.cc_recipients) ? document.cc_recipients : [],
    attachments: (attachmentRows ?? []).map((att) => ({
      id: att.id,
      originalFilename: att.original_filename || "Attachment",
      mimeType: att.mime_type || "application/octet-stream",
      sizeBytes: Number(att.size_bytes || 0),
      attachmentType: att.attachment_type === "image" ? "image" : "document",
    })),
  }

  return (
    <CreateLetterPage
      initialProjectId={project.id}
      initialDraft={initialDraft}
      projectOptions={[{ id: project.id, name: project.name, code: project.code }]}
    />
  )
}
