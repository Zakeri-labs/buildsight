import { notFound, redirect } from "next/navigation"
import { CreateLetterPage } from "@/components/documents/create-letter-page"
import { requireOnboarded } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnboarded()
  const { id } = await params
  const supabase = await createClient()

  const { data: document } = await supabase
    .from("documents")
    .select("id, project_id, reference, title, document_type, status, creation_mode, file_storage_path")
    .eq("id", id)
    .maybeSingle()

  if (!document) notFound()

  // Server-side Protection: Published / Sent letters are final and cannot be edited!
  if (document.status === "published" || document.creation_mode === "simple" || document.file_storage_path) {
    redirect(`/documents/${document.id}`)
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, code")
    .eq("id", document.project_id)
    .maybeSingle()

  if (!project) notFound()

  return (
    <CreateLetterPage
      initialProjectId={project.id}
      initialDocumentId={document.id}
      projectOptions={[{ id: project.id, name: project.name, code: project.code }]}
    />
  )
}
