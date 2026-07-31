import { notFound } from "next/navigation"
import { ProjectDetail } from "@/components/projects/project-detail"
import type { ProjectDocument } from "@/components/projects/project-documents"
import { requireOnboarded } from "@/lib/auth/session"
import { canAdministerProject } from "@/lib/auth/guards"
import { getDashboardData, getOrgProjects } from "@/lib/db/domain"
import { getProjectParticipants, getProjectParticipantUserOptions } from "@/lib/db/project-participants"
import { normalizeDocumentType } from "@/lib/documents/document-types"
import { getInitialDocumentsForScope } from "@/lib/initial-documents/server"
import { toProjectRecord } from "@/lib/projects/project-record"
import { isProjectTypeValue } from "@/lib/projects/project-options"
import { createClient } from "@/lib/supabase/server"

type ProjectDocumentRow = {
  id: string
  reference: string
  title: string
  document_type: string
  status: string
  created_by: string
  updated_at: string
  file_storage_path: string | null
  original_filename: string | null
}

type ProjectDocumentProfile = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
}

function personInitials(name: string): string {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"
}

function displayDocumentDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date)
}

async function getProjectDocuments(
  projectId: string,
  currentUserId: string,
  currentUserEmail: string,
): Promise<ProjectDocument[]> {
  const supabase = await createClient()
  const { data: documents } = await supabase
    .from("documents")
    .select("id, reference, title, document_type, status, created_by, updated_at, file_storage_path, original_filename")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(5)

  const documentRows = (documents ?? []) as ProjectDocumentRow[]
  const creatorIds = Array.from(new Set(documentRows.map((document) => document.created_by)))
  const { data: profiles } = creatorIds.length
    ? await supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", creatorIds)
    : { data: [] as ProjectDocumentProfile[] }
  const profileRows = (profiles ?? []) as ProjectDocumentProfile[]
  const profileMap = new Map<string, ProjectDocumentProfile>(profileRows.map((profile) => [profile.id, profile]))

  return documentRows.map((document) => {
    const profile = profileMap.get(document.created_by)
    const name =
      profile?.full_name?.trim() ||
      profile?.email ||
      (document.created_by === currentUserId ? currentUserEmail : "Project member")

    return {
      id: document.id,
      reference: document.reference,
      title: document.title,
      type: normalizeDocumentType(document.document_type),
      uploadedBy: {
        name,
        initials: personInitials(name),
        avatar: profile?.avatar_url ?? undefined,
      },
      lastUpdated: displayDocumentDate(document.updated_at),
      status: document.status === "published" ? "Published" : "Draft",
      fileStoragePath: document.file_storage_path ?? null,
      originalFilename: document.original_filename ?? null,
    }
  })
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const [{ projectId }, session] = await Promise.all([params, requireOnboarded()])
  const organizationId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id
  if (!organizationId) notFound()

  const projects = await getOrgProjects(organizationId)
  const project = projects.find((item) => item.id === projectId)
  if (!project) return notFound()

  const [dashboardData, letters, initialDocumentsResult, participants, canManageImages] = await Promise.all([
    getDashboardData(organizationId, project.id, session.userId),
    getProjectDocuments(project.id, session.userId, session.email),
    getInitialDocumentsForScope({
      projectId: project.id,
      currentUserId: session.userId,
      currentUserEmail: session.email,
    }),
    getProjectParticipants(project.id),
    canAdministerProject(project.id),
  ])
  const participantUsers = canManageImages ? await getProjectParticipantUserOptions(project.id) : []
  const projectCounts = dashboardData.projects.find((item) => item.id === project.id)
  const projectRecord = toProjectRecord(project, projectCounts)

  return (
    <ProjectDetail
      key={project.id}
      project={projectRecord}
      editProject={{
        id: project.id,
        name: project.name,
        code: project.code?.trim() || "—",
        address: project.location?.trim() || "—",
        projectTypeLabel: projectRecord.projectType,
        projectTypeValue: isProjectTypeValue(project.projectType) ? project.projectType : null,
        supervisionType: project.supervisionType,
        supervisionTypeOther: project.supervisionTypeOther,
        description: project.description ?? "",
        latitude: project.latitude,
        longitude: project.longitude,
      }}
      letters={letters}
      initialDocuments={initialDocumentsResult.documents}
      initialDocumentsError={initialDocumentsResult.errorMessage}
      participants={participants}
      participantUsers={participantUsers}
      canManageImages={canManageImages}
      canEditProject={canManageImages}
    />
  )
}
