import { notFound } from "next/navigation"
import { requireOnboarded } from "@/lib/auth/session"
import { resolveProjectReadAccessForUser } from "@/lib/auth/project-access"
import { createClient } from "@/lib/supabase/server"
import { InitialDocumentPdfViewer } from "@/components/initial-documents/initial-document-pdf-viewer"

export const dynamic = "force-dynamic"

export default async function InitialDocumentViewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const session = await requireOnboarded()
  const params = await searchParams
  const id = params.id?.trim() || ""

  if (!id) {
    notFound()
  }

  const supabase = await createClient()
  const { data: document, error: documentError } = await supabase
    .from("initial_docs")
    .select("id, project_id, file_name, original_file_name, file_size")
    .eq("id", id)
    .maybeSingle()

  if (documentError || !document) {
    notFound()
  }

  const access = await resolveProjectReadAccessForUser(session.userId, document.project_id)
  if (!access) {
    notFound()
  }

  const fileName = document.original_file_name || document.file_name || "document.pdf"
  const fallbackHref = `/initial-documents?project=${encodeURIComponent(document.project_id)}`

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8">
      <InitialDocumentPdfViewer
        documentId={document.id}
        fileName={fileName}
        fallbackHref={fallbackHref}
      />
    </div>
  )
}
