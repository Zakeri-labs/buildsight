import { notFound } from "next/navigation"
import { DocumentEditorForm } from "@/components/documents/document-editor-form"
import { requireOnboarded } from "@/lib/auth/session"
import { normalizeDocumentType } from "@/lib/documents/document-types"
import { EMPTY_RICH_TEXT_DOCUMENT, isRichTextDocument } from "@/lib/documents/rich-text"
import { createClient } from "@/lib/supabase/server"

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnboarded()
  const { id } = await params
  const supabase = await createClient()

  const { data: document } = await supabase
    .from("documents")
    .select("id, project_id, reference, title, document_type, status, content")
    .eq("id", id)
    .maybeSingle()

  if (!document) notFound()

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", document.project_id)
    .maybeSingle()

  if (!project) notFound()

  return (
    <DocumentEditorForm
      project={{ id: project.id, name: project.name }}
      document={{
        id: document.id,
        reference: document.reference,
        title: document.title,
        documentType: normalizeDocumentType(document.document_type),
        status: document.status === "published" ? "published" : "draft",
        content: isRichTextDocument(document.content) ? document.content : EMPTY_RICH_TEXT_DOCUMENT,
      }}
    />
  )
}
