import { InitialDocumentsList } from "@/components/initial-documents/initial-documents-list"
import { requireOnboarded } from "@/lib/auth/session"
import { getInitialDocumentsForScope } from "@/lib/initial-documents/server"
import { getSelectedProjectId } from "@/lib/project-scope"
import { createClient } from "@/lib/supabase/server"

export default async function InitialDocumentsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const session = await requireOnboarded()
  const [params, selectedProjectId, supabase] = await Promise.all([
    searchParams,
    getSelectedProjectId(),
    createClient(),
  ])

  const requestedProjectId = params.project?.trim() || null
  const candidateProjectId = requestedProjectId ?? selectedProjectId
  let effectiveProjectId: string | null = null
  let selectedProjectName: string | null = null

  if (candidateProjectId) {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, name")
      .eq("id", candidateProjectId)
      .maybeSingle()
    if (projectError) {
      return <InitialDocumentsList documents={[]} selectedProjectId={null} selectedProjectName={null} errorMessage={projectError.message} />
    }
    if (project) {
      effectiveProjectId = project.id
      selectedProjectName = project.name
    } else if (requestedProjectId) {
      return <InitialDocumentsList documents={[]} selectedProjectId={requestedProjectId} selectedProjectName={null} errorMessage="You do not have access to this project." />
    }
  }

  const result = await getInitialDocumentsForScope({
    projectId: effectiveProjectId,
    currentUserId: session.userId,
    currentUserEmail: session.email,
    supabase,
  })

  return (
    <InitialDocumentsList
      documents={result.documents}
      selectedProjectId={effectiveProjectId}
      selectedProjectName={selectedProjectName}
      errorMessage={result.errorMessage}
    />
  )
}
