export const dynamic = "force-dynamic"
export const revalidate = 0

import { notFound } from "next/navigation"
import { ProjectDetail } from "@/components/projects/project-detail"
import type { ProjectDocument } from "@/components/projects/project-documents"
import type { ProjectSiteVisitReport } from "@/components/projects/project-site-visit-reports"
import { requireOnboarded } from "@/lib/auth/session"
import { canAdministerProject } from "@/lib/auth/guards"
import { getDashboardData, getOrgProjects } from "@/lib/db/domain"
import { getProjectParticipants, getProjectParticipantUserOptions } from "@/lib/db/project-participants"
import { getProjectSupervisorCandidates } from "@/lib/projects/supervisor-candidates-server"
import { normalizeDocumentType } from "@/lib/documents/document-types"
import { getInitialDocumentsForScope } from "@/lib/initial-documents/server"
import { toProjectRecord } from "@/lib/projects/project-record"
import { isProjectTypeValue } from "@/lib/projects/project-options"
import { createAdminClient } from "@/lib/supabase/admin"
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

type ProjectReportRow = {
  id: string
  project_stage_id: string
  report_title: string | null
  report_number: string | null
  visit_number: number | null
  created_at: string
  created_by: string
}

type ProjectReportStageRow = {
  id: string
  name: string
}

type ProjectReportProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

async function getProjectSiteVisitReports(projectId: string): Promise<ProjectSiteVisitReport[]> {
  // The caller has already resolved this project through the authenticated user's canonical project scope.
  // Use the service client only after that authorization check so the project summary can aggregate
  // direct Stage-based reports without depending on client-side filtering.
  const admin = createAdminClient()
  const { data: reports, error: reportsError } = await admin
    .from("term_responses")
    .select("id, project_stage_id, report_title, report_number, visit_number, created_at, created_by")
    .eq("project_id", projectId)
    .is("project_stage_term_id", null)
    .order("created_at", { ascending: false })
    .limit(5)
  if (reportsError) throw reportsError

  const reportRows = (reports ?? []) as ProjectReportRow[]
  if (!reportRows.length) return []

  const stageIds = Array.from(new Set(reportRows.map((report) => report.project_stage_id)))
  const creatorIds = Array.from(new Set(reportRows.map((report) => report.created_by)))
  const [{ data: stages, error: stagesError }, { data: profiles, error: profilesError }] = await Promise.all([
    admin
      .from("project_stages")
      .select("id, name")
      .eq("project_id", projectId)
      .in("id", stageIds),
    creatorIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", creatorIds)
      : Promise.resolve({ data: [] as ProjectReportProfileRow[], error: null }),
  ])
  if (stagesError) throw stagesError
  if (profilesError) throw profilesError

  const stageMap = new Map<string, ProjectReportStageRow>(
    ((stages ?? []) as ProjectReportStageRow[]).map((stage) => [stage.id, stage]),
  )
  const profileMap = new Map<string, ProjectReportProfileRow>(
    ((profiles ?? []) as ProjectReportProfileRow[]).map((profile) => [profile.id, profile]),
  )

  return reportRows.flatMap((report) => {
    const stage = stageMap.get(report.project_stage_id)
    if (!stage) return []
    const profile = profileMap.get(report.created_by)
    const supervisorName = profile?.full_name?.trim() || profile?.email?.trim() || "Project member"

    return [{
      id: report.id,
      stageId: report.project_stage_id,
      reportTitle: report.report_title?.trim() || "Untitled report",
      reportNumber: report.report_number?.trim() || "—",
      stageName: stage.name,
      visitNumber: Number.isInteger(report.visit_number) ? report.visit_number : null,
      createdAt: report.created_at,
      supervisorName,
    }]
  })
}

async function getProjectDocuments(
  projectId: string,
  currentUserId: string,
  currentUserEmail: string,
): Promise<ProjectDocument[]> {
  const admin = createAdminClient()
  const { data: documents } = await admin
    .from("documents")
    .select("id, reference, title, document_type, status, created_by, updated_at, file_storage_path, original_filename")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(5)

  const documentRows = (documents ?? []) as ProjectDocumentRow[]
  const creatorIds = Array.from(new Set(documentRows.map((document) => document.created_by)))
  const { data: profiles } = creatorIds.length
    ? await admin.from("profiles").select("id, full_name, email, avatar_url").in("id", creatorIds)
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
  const session = await requireOnboarded()
  const { projectId } = await params
  const organizationId = session.supervisingOrg?.id ?? session.memberships[0]?.organization?.id
  if (!organizationId) notFound()

  const projects = await getOrgProjects(organizationId, session.userId)
  const project = projects.find((item) => item.id === projectId)
  if (!project) return notFound()

  const [dashboardData, letters, initialDocumentsResult, siteVisitReports, participants, canManageImages] = await Promise.all([
    getDashboardData(organizationId, project.id, session.userId),
    getProjectDocuments(project.id, session.userId, session.email),
    getInitialDocumentsForScope({
      projectId: project.id,
      currentUserId: session.userId,
      currentUserEmail: session.email,
    }),
    getProjectSiteVisitReports(project.id),
    getProjectParticipants(project.id),
    canAdministerProject(project.id),
  ])
  const [participantUsers, supervisorOptions] = canManageImages
    ? await Promise.all([
        getProjectParticipantUserOptions(project.id),
        getProjectSupervisorCandidates(organizationId),
      ])
    : [[], []]
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
        areaDistrict: project.region,
        projectTypeLabel: projectRecord.projectType,
        projectTypeValue: isProjectTypeValue(project.projectType) ? project.projectType : null,
        supervisionType: project.supervisionType,
        supervisionTypeOther: project.supervisionTypeOther,
        status: project.status,
        plotNo: project.plotNo,
        supervisionStartDate: project.supervisionStartDate,
        priority: project.priority,
        includedStructureVisits: project.includedStructureVisits,
        includedFinishingVisits: project.includedFinishingVisits,
        structureSupervisionFee: project.structureSupervisionFee,
        finishingSupervisionFee: project.finishingSupervisionFee,
        receivedAmount: project.receivedAmount,
        outstandingAmount: project.outstandingAmount,
        nextPaymentAmount: project.nextPaymentAmount,
        nextPaymentDueDate: project.nextPaymentDueDate,
        invoiceReferencePaymentNote: project.invoiceReferencePaymentNote,
        initialRemarks: project.initialRemarks,
        description: project.description ?? "",
        latitude: project.latitude,
        longitude: project.longitude,
        assignedSupervisorId: project.assignedSupervisorId,
      }}
      letters={letters}
      initialDocuments={initialDocumentsResult.documents}
      initialDocumentsError={initialDocumentsResult.errorMessage}
      siteVisitReports={siteVisitReports}
      participants={participants}
      participantUsers={participantUsers}
      supervisorOptions={supervisorOptions}
      canManageImages={canManageImages}
      canEditProject={canManageImages}
    />
  )
}
