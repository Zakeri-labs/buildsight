import { DocumentsList, type DocumentListItem } from "@/components/documents/documents-list"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { normalizeDocumentType } from "@/lib/documents/document-types"
import { isSimpleUploadCategory } from "@/lib/documents/simple-upload"
import { createClient } from "@/lib/supabase/server"

function initials(name: string) {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ uploaded?: string; project?: string }> }) {
  const [session, queryParams, selectedProjectId, supabase] = await Promise.all([
    requireOnboarded(),
    searchParams,
    getSelectedProjectId(),
    createClient(),
  ])

  const requestedProjectId = queryParams.project?.trim() || null
  let effectiveProjectId = selectedProjectId

  if (requestedProjectId) {
    const { data: requestedProject } = await supabase
      .from("projects")
      .select("id")
      .eq("id", requestedProjectId)
      .maybeSingle()
    if (requestedProject) effectiveProjectId = requestedProject.id
  }

  let query = supabase
    .from("documents")
    .select("id, project_id, reference, title, document_type, status, created_by, created_at, updated_at, file_storage_path, original_filename, simple_upload_category")
    .order("updated_at", { ascending: false })

  if (effectiveProjectId) query = query.eq("project_id", effectiveProjectId)
  const { data: rows } = await query

  const documents = rows ?? []
  const projectIds = Array.from(new Set(documents.map((row: any) => row.project_id)))
  const creatorIds = Array.from(new Set(documents.map((row: any) => row.created_by)))

  const [{ data: projects }, { data: profiles }] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id, name").in("id", projectIds) : Promise.resolve({ data: [] as any[] }),
    creatorIds.length ? supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", creatorIds) : Promise.resolve({ data: [] as any[] }),
  ])

  const projectNames = new Map((projects ?? []).map((project: any) => [project.id, project.name]))
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]))

  const items: DocumentListItem[] = documents.map((row: any) => {
    const profile = profileMap.get(row.created_by)
    const creatorName = profile?.full_name?.trim() || profile?.email || (row.created_by === session.userId ? session.email : "Project member")
    const type = normalizeDocumentType(row.document_type)
    return {
      id: row.id,
      reference: row.reference,
      title: row.title,
      documentType: type,
      projectName: projectNames.get(row.project_id) ?? "Project",
      createdBy: { name: creatorName, avatar: profile?.avatar_url ?? null, initials: initials(creatorName) },
      status: row.status === "published" ? "published" : "draft",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fileStoragePath: row.file_storage_path ?? null,
      originalFilename: row.original_filename ?? null,
      simpleUploadCategory: isSimpleUploadCategory(row.simple_upload_category) ? row.simple_upload_category : null,
    }
  })

  const uploadedCount = Number.parseInt(queryParams.uploaded ?? "", 10)
  return <DocumentsList documents={items} selectedProjectId={effectiveProjectId} uploadedCount={Number.isFinite(uploadedCount) && uploadedCount > 0 ? uploadedCount : 0} />
}
