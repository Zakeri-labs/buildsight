import { DocumentsList, type DocumentListItem } from "@/components/documents/documents-list"
import { requireOnboarded } from "@/lib/auth/session"
import { getSelectedProjectId } from "@/lib/project-scope"
import { createClient } from "@/lib/supabase/server"

function initials(name: string) {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"
}

export default async function DocumentsPage() {
  const session = await requireOnboarded()
  const selectedProjectId = await getSelectedProjectId()
  const supabase = await createClient()

  let query = supabase
    .from("documents")
    .select("id, project_id, reference, title, document_type, status, created_by, created_at, updated_at")
    .order("updated_at", { ascending: false })

  if (selectedProjectId) query = query.eq("project_id", selectedProjectId)
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
    const type = ["general", "drawing", "submittal", "report", "contract"].includes(row.document_type) ? row.document_type : "general"
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
    }
  })

  return <DocumentsList documents={items} selectedProjectId={selectedProjectId} />
}
