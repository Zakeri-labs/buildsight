import { CreateLetterPage } from "@/components/documents/create-letter-page"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { createClient } from "@/lib/supabase/server"

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  await requireOnboarded()
  const [queryParams, scopeProjectId, supabase] = await Promise.all([
    searchParams,
    getSelectedProjectId(),
    createClient(),
  ])

  const requestedProjectId = queryParams.project?.trim() || null
  const initialProjectId = requestedProjectId || scopeProjectId || ""

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, code")
    .order("name", { ascending: true })

  const projectOptions = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code ?? null,
  }))

  return (
    <CreateLetterPage
      initialProjectId={initialProjectId}
      projectOptions={projectOptions}
    />
  )
}
