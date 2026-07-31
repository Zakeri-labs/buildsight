import { InitialDocumentsList, type InitialDocumentListItem } from "@/components/initial-documents/initial-documents-list"
import { requireOnboarded } from "@/lib/auth/session"
import { getInitialDocumentCategory } from "@/lib/initial-documents/config"
import { getSelectedProjectId } from "@/lib/project-scope"
import { createClient } from "@/lib/supabase/server"

export default async function InitialDocumentsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const [session, params, selectedProjectId, supabase] = await Promise.all([
    requireOnboarded(),
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

  let query = supabase
    .from("initial_docs")
    .select("id, project_id, file_name, original_file_name, mime_type, file_size, category, uploaded_by, created_at")
    .order("created_at", { ascending: false })
  if (effectiveProjectId) query = query.eq("project_id", effectiveProjectId)

  const { data: rows, error } = await query
  if (error) {
    return <InitialDocumentsList documents={[]} selectedProjectId={effectiveProjectId} selectedProjectName={selectedProjectName} errorMessage={error.message} />
  }

  const projectIds = Array.from(new Set((rows ?? []).map((row: any) => row.project_id)))
  const uploaderIds = Array.from(new Set((rows ?? []).map((row: any) => row.uploaded_by).filter(Boolean)))
  const [{ data: projects, error: projectsError }, { data: profiles, error: profilesError }] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id, name").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    uploaderIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", uploaderIds) : Promise.resolve({ data: [], error: null }),
  ])
  const lookupError = projectsError ?? profilesError
  if (lookupError) {
    return <InitialDocumentsList documents={[]} selectedProjectId={effectiveProjectId} selectedProjectName={selectedProjectName} errorMessage={lookupError.message} />
  }

  const projectNames = new Map((projects ?? []).map((project: any) => [project.id, project.name]))
  const profileNames = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.full_name?.trim() || profile.email]))

  const documents: InitialDocumentListItem[] = (rows ?? []).map((row: any) => ({
    id: row.id,
    fileName: row.original_file_name || row.file_name,
    mimeType: row.mime_type || "application/octet-stream",
    fileSize: Number(row.file_size) || 0,
    category: getInitialDocumentCategory(row.category).value,
    projectId: row.project_id,
    projectName: projectNames.get(row.project_id) ?? "Project",
    uploadedBy: profileNames.get(row.uploaded_by) ?? (row.uploaded_by === session.userId ? session.email : "Project member"),
    createdAt: row.created_at,
  }))

  return <InitialDocumentsList documents={documents} selectedProjectId={effectiveProjectId} selectedProjectName={selectedProjectName} />
}
