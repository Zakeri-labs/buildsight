import "server-only"

import type { InitialDocumentListItem } from "@/lib/initial-documents/types"
import { getInitialDocumentCategory, getInitialDocumentUploadCategoryFromPath } from "@/lib/initial-documents/config"
import { createClient } from "@/lib/supabase/server"

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

type InitialDocumentRow = {
  id: string
  project_id: string
  file_name: string
  original_file_name: string | null
  file_path: string
  mime_type: string | null
  file_size: number | string | null
  category: string | null
  uploaded_by: string | null
  created_at: string
}

type ProjectNameRow = {
  id: string
  name: string
}

type ProfileNameRow = {
  id: string
  full_name: string | null
  email: string | null
}

export async function getInitialDocumentsForScope({
  projectId,
  currentUserId,
  currentUserEmail,
  supabase: providedSupabase,
}: {
  projectId: string | null
  currentUserId: string
  currentUserEmail: string
  supabase?: ServerSupabaseClient
}): Promise<{ documents: InitialDocumentListItem[]; errorMessage: string | null }> {
  const supabase = providedSupabase ?? await createClient()

  let query = supabase
    .from("initial_docs")
    .select("id, project_id, file_name, original_file_name, file_path, mime_type, file_size, category, uploaded_by, created_at")
    .order("created_at", { ascending: false })
  if (projectId) query = query.eq("project_id", projectId)

  const { data: rawRows, error } = await query
  if (error) return { documents: [], errorMessage: error.message }

  const rows = (rawRows ?? []) as InitialDocumentRow[]
  const projectIds = Array.from(new Set(rows.map((row) => row.project_id)))
  const uploaderIds = Array.from(new Set(rows.map((row) => row.uploaded_by).filter((id): id is string => Boolean(id))))

  const [{ data: rawProjects, error: projectsError }, { data: rawProfiles, error: profilesError }] = await Promise.all([
    projectIds.length
      ? supabase.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] as ProjectNameRow[], error: null }),
    uploaderIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", uploaderIds)
      : Promise.resolve({ data: [] as ProfileNameRow[], error: null }),
  ])

  const lookupError = projectsError ?? profilesError
  if (lookupError) return { documents: [], errorMessage: lookupError.message }

  const projects = (rawProjects ?? []) as ProjectNameRow[]
  const profiles = (rawProfiles ?? []) as ProfileNameRow[]
  const projectNames = new Map(projects.map((project) => [project.id, project.name]))
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.full_name?.trim() || profile.email || "Project member"]))

  const documents: InitialDocumentListItem[] = rows.map((row) => ({
    id: row.id,
    fileName: row.original_file_name || row.file_name,
    mimeType: row.mime_type || "application/octet-stream",
    fileSize: Number(row.file_size) || 0,
    category: getInitialDocumentCategory(row.category).value,
    uploadCategory: getInitialDocumentUploadCategoryFromPath(row.file_path)?.value ?? null,
    projectId: row.project_id,
    projectName: projectNames.get(row.project_id) ?? "Project",
    uploadedBy: row.uploaded_by
      ? profileNames.get(row.uploaded_by) ?? (row.uploaded_by === currentUserId ? currentUserEmail : "Project member")
      : "Project member",
    createdAt: row.created_at,
  }))

  return { documents, errorMessage: null }
}
