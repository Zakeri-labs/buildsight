import { notFound } from "next/navigation"
import { requireOnboarded } from "@/lib/auth/session"
import { resolveProjectReadAccessForUser } from "@/lib/auth/project-access"
import { createClient } from "@/lib/supabase/server"
import { OpenPdfFallbackCard } from "@/components/initial-documents/open-pdf-fallback-card"

export const dynamic = "force-dynamic"

export default async function OpenPdfFallbackPage({
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
  const fileSize = Number(document.file_size) || 0
  const fallbackHref = `/initial-documents?project=${encodeURIComponent(document.project_id)}`

  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center px-4 py-8">
      <OpenPdfFallbackCard
        documentId={document.id}
        fileName={fileName}
        fileSize={fileSize}
        fallbackHref={fallbackHref}
      />
    </div>
  )
}
