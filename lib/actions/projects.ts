"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertOrgAdmin, assertProjectAdmin, assertProjectReadAccess, audit, AuthzError } from "@/lib/auth/guards"
import { createInvitation, type InvitationActionData } from "@/lib/actions/invitations"
import { createOrganization } from "@/lib/actions/organizations"
import type { ProjectAccessRole, ProjectOrgRole } from "@/lib/db/types"
import { PROJECT_ACCESS_ROLES, PROJECT_ORG_ROLES } from "@/lib/db/types"
import type { ActionResult } from "@/lib/actions/invitations"
import { coordinateLabel } from "@/lib/locations/types"
import { ALL_PROJECTS_SCOPE_VALUE, SELECTED_PROJECT_COOKIE } from "@/lib/project-scope-constants"
import {
  isProjectPriorityValue,
  isProjectTypeValue,
  isSupervisionTypeValue,
  type ProjectPriorityValue,
  type ProjectTypeValue,
  type SupervisionTypeValue,
} from "@/lib/projects/project-options"
import { validateOwnerIdCardFile } from "@/lib/projects/owner-id-card"
import { isProjectSupervisorOrganizationRole } from "@/lib/projects/supervisor-candidates"
import { setProjectSupervisorAssignment } from "@/lib/projects/supervisor-assignment"
import {
  calculateProjectOutstandingAmount,
  normalizeOptionalProjectAmount,
  PROJECT_FINANCIAL_NOTE_MAX_LENGTH,
  PROJECT_INITIAL_REMARKS_MAX_LENGTH,
} from "@/lib/projects/project-financial"
import {
  detectProjectImageMimeType,
  isAllowedProjectImageType,
  PROJECT_IMAGE_BUCKET,
  PROJECT_IMAGE_MAX_SIZE_BYTES,
  projectImageDisplayUrl,
  projectImageStoragePath,
  validateProjectImageFile,
} from "@/lib/projects/project-image"

export type ProjectDeletionImpact = {
  stages: number
  terms: number
  inspections: number
  documents: number
  initialDocuments: number
  translations: number
  participants: number
  attachments: number
  totalRelatedRecords: number
}

const MAX_SUPERVISION_TYPE_OTHER_LENGTH = 150
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PROJECT_STATUS_VALUES = new Set([
  "active",
  "inactive",
  "completed",
  "stopped",
  "final_visit",
  "not_started",
])

const PROJECT_STORAGE_BUCKETS = [
  "project-images",
  "document-images",
  "initial-docs",
  "project-stage-evidence",
  "project-stage-translations",
  "participant-avatars",
] as const

async function countProjectRows(admin: ReturnType<typeof createAdminClient>, table: string, projectId: string) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
  if (error) throw error
  return count ?? 0
}

async function getProjectDeletionImpactWithAdmin(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
): Promise<ProjectDeletionImpact> {
  const { data: stageRows, error: stageError } = await admin
    .from("project_stages")
    .select("id")
    .eq("project_id", projectId)
  if (stageError) throw stageError

  const stageIds = (stageRows ?? []).map((stage: { id: string }) => stage.id)
  let terms = 0
  if (stageIds.length > 0) {
    const { count, error } = await admin
      .from("project_stage_terms")
      .select("id", { count: "exact", head: true })
      .in("project_stage_id", stageIds)
    if (error) throw error
    terms = count ?? 0
  }

  const [legacyInspections, termResponses, documents, initialDocuments, translations, projectParticipants, userMemberships, orgMemberships, attachments] =
    await Promise.all([
      countProjectRows(admin, "inspections", projectId),
      countProjectRows(admin, "term_responses", projectId),
      countProjectRows(admin, "documents", projectId),
      countProjectRows(admin, "initial_docs", projectId),
      countProjectRows(admin, "translation_documents", projectId),
      countProjectRows(admin, "project_participants", projectId),
      countProjectRows(admin, "project_user_memberships", projectId),
      countProjectRows(admin, "project_organization_memberships", projectId),
      countProjectRows(admin, "response_attachments", projectId),
    ])

  const impact: ProjectDeletionImpact = {
    stages: stageIds.length,
    terms,
    inspections: legacyInspections + termResponses,
    documents,
    initialDocuments,
    translations,
    participants: projectParticipants + userMemberships + orgMemberships,
    attachments,
    totalRelatedRecords: 0,
  }
  impact.totalRelatedRecords =
    impact.stages +
    impact.terms +
    impact.inspections +
    impact.documents +
    impact.initialDocuments +
    impact.translations +
    impact.participants +
    impact.attachments
  return impact
}

async function listStorageObjectsRecursively(
  admin: ReturnType<typeof createAdminClient>,
  bucketName: string,
  prefix: string,
) {
  const bucket = admin.storage.from(bucketName)
  const pendingFolders = [prefix.replace(/^\/+|\/+$/g, "")]
  const objectPaths: string[] = []

  while (pendingFolders.length > 0) {
    const folder = pendingFolders.shift()!
    let offset = 0
    while (true) {
      const { data, error } = await bucket.list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      })
      if (error) throw error
      const entries = data ?? []
      for (const entry of entries) {
        const path = folder ? `${folder}/${entry.name}` : entry.name
        if (entry.id || entry.metadata) objectPaths.push(path)
        else pendingFolders.push(path)
      }
      if (entries.length < 1000) break
      offset += entries.length
    }
  }

  return objectPaths
}

async function removeProjectStorageObjects(admin: ReturnType<typeof createAdminClient>, projectId: string) {
  const failedBuckets: string[] = []
  for (const bucketName of PROJECT_STORAGE_BUCKETS) {
    try {
      const objectPaths = await listStorageObjectsRecursively(admin, bucketName, projectId)
      for (let index = 0; index < objectPaths.length; index += 100) {
        const { error } = await admin.storage.from(bucketName).remove(objectPaths.slice(index, index + 100))
        if (error) throw error
      }
    } catch {
      // The database deletion is authoritative. Storage cleanup is best-effort
      // and a failed bucket is reported so an administrator can retry safely.
      failedBuckets.push(bucketName)
    }
  }
  return failedBuckets
}

function normalizeOptionalProjectDate(value: string | null | undefined, fieldLabel: string) {
  const date = value?.trim()
  if (!date) return { ok: true as const, date: null }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false as const, error: `Enter a valid ${fieldLabel}.` }
  }

  const [year, month, day] = date.split("-").map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return { ok: false as const, error: `Enter a valid ${fieldLabel}.` }
  }

  return { ok: true as const, date }
}

function normalizeOptionalVisitCount(value: number | null | undefined, fieldLabel: string) {
  if (value == null) return { ok: true as const, value: null }
  if (!Number.isInteger(value) || value < 0) {
    return { ok: false as const, error: `${fieldLabel} must be a non-negative whole number.` }
  }
  return { ok: true as const, value }
}

function normalizeProjectCoordinates(latitude?: number | null, longitude?: number | null) {
  const hasLatitude = latitude != null
  const hasLongitude = longitude != null
  if (hasLatitude !== hasLongitude) {
    return { ok: false as const, error: "Latitude and longitude must be provided together." }
  }
  if (!hasLatitude || !hasLongitude) {
    return { ok: true as const, latitude: null, longitude: null }
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false as const, error: "Invalid project coordinates." }
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { ok: false as const, error: "Project coordinates are outside the valid range." }
  }
  return { ok: true as const, latitude, longitude }
}

export async function getProjectDeletionImpact(input: {
  projectId: string
}): Promise<ActionResult<ProjectDeletionImpact & { projectName: string }>> {
  try {
    await assertProjectReadAccess(input.projectId)
    const admin = createAdminClient()
    const { data: project, error } = await admin
      .from("projects")
      .select("id, name, supervising_organization_id")
      .eq("id", input.projectId)
      .maybeSingle()
    if (error) throw error
    if (!project) return { ok: false, error: "Project not found." }

    await assertOrgAdmin(project.supervising_organization_id)
    const impact = await getProjectDeletionImpactWithAdmin(admin, input.projectId)
    return { ok: true, data: { projectName: project.name, ...impact } }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AuthzError ? err.message : "Could not inspect the project before deletion.",
    }
  }
}

export async function deleteProject(input: {
  projectId: string
}): Promise<ActionResult<{ impact: ProjectDeletionImpact; storageCleanupIncomplete: boolean }>> {
  try {
    await assertProjectReadAccess(input.projectId)
    const admin = createAdminClient()
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id, name, supervising_organization_id")
      .eq("id", input.projectId)
      .maybeSingle()
    if (projectError) throw projectError
    if (!project) return { ok: false, error: "Project not found." }

    const actorId = await assertOrgAdmin(project.supervising_organization_id)
    const impact = await getProjectDeletionImpactWithAdmin(admin, input.projectId)

    await audit({
      actorId,
      action: "project.deleted",
      entityType: "project",
      entityId: input.projectId,
      organizationId: project.supervising_organization_id,
      projectId: input.projectId,
      metadata: {
        projectName: project.name,
        relatedRecords: impact,
      },
    })

    const { data: deleted, error: deleteError } = await admin
      .from("projects")
      .delete()
      .eq("id", input.projectId)
      .select("id")
      .maybeSingle()
    if (deleteError) throw deleteError
    if (!deleted) return { ok: false, error: "Project not found or already deleted." }

    const failedBuckets = await removeProjectStorageObjects(admin, input.projectId)

    const cookieStore = await cookies()
    if (cookieStore.get(SELECTED_PROJECT_COOKIE)?.value === input.projectId) {
      cookieStore.set(SELECTED_PROJECT_COOKIE, ALL_PROJECTS_SCOPE_VALUE, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      })
    }

    revalidatePath("/", "layout")
    revalidatePath("/projects")
    revalidatePath("/documents")
    revalidatePath("/initial-documents")
    revalidatePath("/users")

    return {
      ok: true,
      data: {
        impact,
        storageCleanupIncomplete: failedBuckets.length > 0,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AuthzError ? err.message : "Could not delete the project.",
    }
  }
}

export async function updateProject(input: {
  projectId: string
  name: string
  code?: string
  projectType?: ProjectTypeValue
  supervisionType?: SupervisionTypeValue
  supervisionTypeOther?: string | null
  status?: "active" | "inactive" | "completed" | "stopped" | "final_visit" | "not_started"
  plotNo?: string
  phase?: string
  startDate?: string | null
  supervisionStartDate?: string | null
  priority?: ProjectPriorityValue | null
  includedStructureVisits?: number | null
  includedFinishingVisits?: number | null
  structureSupervisionFee?: string | number | null
  finishingSupervisionFee?: string | number | null
  receivedAmount?: string | number | null
  nextPaymentAmount?: string | number | null
  nextPaymentDueDate?: string | null
  invoiceReferencePaymentNote?: string | null
  initialRemarks?: string | null
  description?: string
  region?: string
  location?: string
  latitude?: number | null
  longitude?: number | null
  assignedUserId?: string | null
  assignedSupervisorId?: string | null
  owners?: Array<{
    name: string
    contactName?: string | null
    contactEmail?: string | null
    contactPhone?: string | null
    viewerUserId?: string | null
    viewerInvitationId?: string | null
  }>
  contractor?: {
    organizationId?: string | null
    companyName?: string
    registrationNumber?: string
    address?: string
    postalCode?: string
    phone?: string
  }
}): Promise<ActionResult<{ supervisionStartDate: string | null }>> {
  try {
    const name = input.name.trim()
    if (name.length < 2) return { ok: false, error: "Project name is too short." }
    if (input.projectType !== undefined && !isProjectTypeValue(input.projectType)) {
      return { ok: false, error: "Select a valid project type." }
    }
    if (input.status !== undefined && !PROJECT_STATUS_VALUES.has(input.status)) {
      return { ok: false, error: "Select a valid project status." }
    }
    if (input.priority !== undefined && input.priority !== null && !isProjectPriorityValue(input.priority)) {
      return { ok: false, error: "Select a valid project priority." }
    }
    const startDateResult = input.startDate !== undefined ? normalizeOptionalProjectDate(input.startDate, "project start date") : { ok: true as const, date: undefined }
    if (!startDateResult.ok) return { ok: false, error: startDateResult.error }
    const supervisionStartDate = normalizeOptionalProjectDate(input.supervisionStartDate, "supervision start date")
    if (!supervisionStartDate.ok) return { ok: false, error: supervisionStartDate.error }
    const includedStructureVisits = normalizeOptionalVisitCount(input.includedStructureVisits, "Included structure visits")
    if (!includedStructureVisits.ok) return { ok: false, error: includedStructureVisits.error }
    const includedFinishingVisits = normalizeOptionalVisitCount(input.includedFinishingVisits, "Included finishing visits")
    if (!includedFinishingVisits.ok) return { ok: false, error: includedFinishingVisits.error }
    const structureSupervisionFee = normalizeOptionalProjectAmount(input.structureSupervisionFee, "Structure Supervision Fee")
    if (!structureSupervisionFee.ok) return { ok: false, error: structureSupervisionFee.error }
    const finishingSupervisionFee = normalizeOptionalProjectAmount(input.finishingSupervisionFee, "Finishing Supervision Fee")
    if (!finishingSupervisionFee.ok) return { ok: false, error: finishingSupervisionFee.error }
    const receivedAmount = normalizeOptionalProjectAmount(input.receivedAmount, "Received Amount")
    if (!receivedAmount.ok) return { ok: false, error: receivedAmount.error }
    const nextPaymentAmount = normalizeOptionalProjectAmount(input.nextPaymentAmount, "Next Payment Amount")
    if (!nextPaymentAmount.ok) return { ok: false, error: nextPaymentAmount.error }
    const nextPaymentDueDate = normalizeOptionalProjectDate(input.nextPaymentDueDate, "next payment due date")
    if (!nextPaymentDueDate.ok) return { ok: false, error: nextPaymentDueDate.error }
    if ((input.invoiceReferencePaymentNote?.trim().length ?? 0) > PROJECT_FINANCIAL_NOTE_MAX_LENGTH) {
      return { ok: false, error: `Invoice Reference / Payment Note must be ${PROJECT_FINANCIAL_NOTE_MAX_LENGTH} characters or fewer.` }
    }
    if ((input.initialRemarks?.trim().length ?? 0) > PROJECT_INITIAL_REMARKS_MAX_LENGTH) {
      return { ok: false, error: `Initial Remarks must be ${PROJECT_INITIAL_REMARKS_MAX_LENGTH} characters or fewer.` }
    }
    let supervisionTypeOther: string | null | undefined
    if (input.supervisionType !== undefined) {
      if (!isSupervisionTypeValue(input.supervisionType)) {
        return { ok: false, error: "Select a valid supervision type." }
      }
      if (input.supervisionType === "other") {
        supervisionTypeOther = input.supervisionTypeOther?.trim() || ""
        if (!supervisionTypeOther) return { ok: false, error: "Please specify the supervision type." }
        if (supervisionTypeOther.length > MAX_SUPERVISION_TYPE_OTHER_LENGTH) {
          return { ok: false, error: "Supervision type must be 150 characters or fewer." }
        }
      } else {
        supervisionTypeOther = null
      }
    }
    const coordinates = normalizeProjectCoordinates(input.latitude, input.longitude)
    if (!coordinates.ok) return { ok: false, error: coordinates.error }
    const location =
      input.location?.trim() ||
      (coordinates.latitude != null && coordinates.longitude != null
        ? coordinateLabel(coordinates.latitude, coordinates.longitude)
        : null)
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()

    const { data: project, error: lookupError } = await admin
      .from("projects")
      .select("supervising_organization_id, assigned_supervisor_id, structure_supervision_fee, finishing_supervision_fee, received_amount")
      .eq("id", input.projectId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!project) return { ok: false, error: "Project not found." }

    let normalizedSupervisorId: string | null | undefined
    if (input.assignedSupervisorId !== undefined) {
      const rawSupervisorId = input.assignedSupervisorId?.trim() || ""
      normalizedSupervisorId = rawSupervisorId || null
      if (normalizedSupervisorId && !UUID_PATTERN.test(normalizedSupervisorId)) {
        return { ok: false, error: "Select a valid Project Supervisor." }
      }

      if (normalizedSupervisorId) {
        const { data: supervisorMembership, error: supervisorMembershipError } = await admin
          .from("organization_memberships")
          .select("user_id, role")
          .eq("organization_id", project.supervising_organization_id)
          .eq("user_id", normalizedSupervisorId)
          .eq("status", "active")
          .maybeSingle()
        if (supervisorMembershipError) throw supervisorMembershipError
        if (!supervisorMembership || !isProjectSupervisorOrganizationRole(supervisorMembership.role)) {
          return { ok: false, error: "Select an active organization administrator, manager, or member as supervisor." }
        }
      }
    }

    const hasRelatedFinancialUpdate =
      input.structureSupervisionFee !== undefined ||
      input.finishingSupervisionFee !== undefined ||
      input.receivedAmount !== undefined
    const effectiveStructureFee = input.structureSupervisionFee !== undefined
      ? structureSupervisionFee.value
      : (project.structure_supervision_fee == null ? null : Number(project.structure_supervision_fee))
    const effectiveFinishingFee = input.finishingSupervisionFee !== undefined
      ? finishingSupervisionFee.value
      : (project.finishing_supervision_fee == null ? null : Number(project.finishing_supervision_fee))
    const effectiveReceivedAmount = input.receivedAmount !== undefined
      ? receivedAmount.value
      : (project.received_amount == null ? null : Number(project.received_amount))
    const recalculatedOutstandingAmount = calculateProjectOutstandingAmount(
      effectiveStructureFee,
      effectiveFinishingFee,
      effectiveReceivedAmount,
    )
    if (hasRelatedFinancialUpdate && recalculatedOutstandingAmount < 0) {
      return { ok: false, error: "Received Amount cannot exceed the total supervision fees." }
    }

    const updates: Record<string, unknown> = {
      name,
      code: input.code?.trim() || null,
      location,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      updated_at: new Date().toISOString(),
    }
    if (input.projectType !== undefined) updates.project_type = input.projectType
    if (input.supervisionType !== undefined) {
      updates.supervision_type = input.supervisionType
      updates.supervision_type_other = supervisionTypeOther ?? null
    }
    if (input.status !== undefined) updates.status = input.status
    if (input.plotNo !== undefined) updates.plot_no = input.plotNo.trim() || null
    if (input.phase !== undefined) updates.phase = input.phase.trim() || null
    if (startDateResult.date !== undefined) updates.start_date = startDateResult.date
    if (input.supervisionStartDate !== undefined) updates.supervision_start_date = supervisionStartDate.date
    if (input.priority !== undefined) updates.priority = input.priority
    if (input.includedStructureVisits !== undefined) updates.included_structure_visits = includedStructureVisits.value
    if (input.includedFinishingVisits !== undefined) updates.included_finishing_visits = includedFinishingVisits.value
    if (input.structureSupervisionFee !== undefined) updates.structure_supervision_fee = structureSupervisionFee.value
    if (input.finishingSupervisionFee !== undefined) updates.finishing_supervision_fee = finishingSupervisionFee.value
    if (input.receivedAmount !== undefined) updates.received_amount = receivedAmount.value
    if (hasRelatedFinancialUpdate) {
      updates.outstanding_amount =
        effectiveStructureFee != null || effectiveFinishingFee != null || effectiveReceivedAmount != null
          ? recalculatedOutstandingAmount
          : null
    }
    if (input.nextPaymentAmount !== undefined) updates.next_payment_amount = nextPaymentAmount.value
    if (input.nextPaymentDueDate !== undefined) updates.next_payment_due_date = nextPaymentDueDate.date
    if (input.invoiceReferencePaymentNote !== undefined) {
      updates.invoice_reference_payment_note = input.invoiceReferencePaymentNote?.trim() || null
    }
    if (input.initialRemarks !== undefined) updates.initial_remarks = input.initialRemarks?.trim() || null
    if (input.description !== undefined) updates.description = input.description.trim() || null
    if (input.region !== undefined) updates.region = input.region.trim() || null
    if (input.assignedUserId !== undefined) updates.assigned_user_id = input.assignedUserId?.trim() || null
    if (input.contractor !== undefined) {
      updates.contractor_organization_id = input.contractor.organizationId?.trim() || null
      updates.contractor = input.contractor.companyName?.trim() || null
      updates.contractor_registration_number = input.contractor.registrationNumber?.trim() || null
      updates.contractor_address = input.contractor.address?.trim() || null
      updates.contractor_postal_code = input.contractor.postalCode?.trim() || null
      updates.contractor_phone = input.contractor.phone?.trim() || null
    }
    if (input.owners !== undefined && input.owners.length > 0) {
      updates.client = input.owners[0].name.trim() || null
    }

    const { data: updatedProject, error } = await admin
      .from("projects")
      .update(updates)
      .eq("id", input.projectId)
      .select("id, supervision_start_date")
      .single()
    if (error) throw error

    if (input.owners !== undefined && input.owners.length > 0) {
      await admin.from("project_owners").delete().eq("project_id", input.projectId)
      const ownerRows = input.owners.map((owner, index) => ({
        project_id: input.projectId,
        owner_order: index + 1,
        name: owner.name.trim(),
        contact_name: owner.contactName?.trim() || null,
        contact_email: owner.contactEmail?.trim().toLowerCase() || null,
        contact_phone: owner.contactPhone?.trim() || null,
        viewer_user_id: owner.viewerUserId?.trim() || null,
        viewer_invitation_id: owner.viewerInvitationId?.trim() || null,
      }))
      await admin.from("project_owners").insert(ownerRows)
    }

    if (input.supervisionStartDate !== undefined && updatedProject.supervision_start_date !== supervisionStartDate.date) {
      return { ok: false, error: "Supervision Start Date was not saved. Please try again." }
    }

    if (normalizedSupervisorId !== undefined && normalizedSupervisorId !== project.assigned_supervisor_id) {
      await setProjectSupervisorAssignment({
        projectId: input.projectId,
        supervisorId: normalizedSupervisorId,
        actorId,
      })
    }

    const { data: persistedProject, error: persistedProjectError } = await admin
      .from("projects")
      .select("id, supervision_start_date")
      .eq("id", input.projectId)
      .single()
    if (persistedProjectError) throw persistedProjectError

    if (input.supervisionStartDate !== undefined && persistedProject.supervision_start_date !== supervisionStartDate.date) {
      return { ok: false, error: "Supervision Start Date was not saved. Please try again." }
    }

    await audit({
      actorId,
      action: "project.updated",
      entityType: "project",
      entityId: input.projectId,
      organizationId: project.supervising_organization_id,
      projectId: input.projectId,
      metadata: {
        name,
        ...(normalizedSupervisorId !== undefined ? { assignedSupervisorId: normalizedSupervisorId } : {}),
      },
    })
    revalidatePath("/users")
    revalidatePath("/projects")
    revalidatePath(`/projects/${input.projectId}`)
    revalidatePath("/calendar")
    return {
      ok: true,
      data: {
        supervisionStartDate:
          typeof persistedProject.supervision_start_date === "string" ? persistedProject.supervision_start_date : null,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not update project." }
  }
}

export type ProjectGalleryUploadInput = {
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  orderIndex: number
}

async function validateStoredProjectGalleryImage(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  actorId: string,
  image: ProjectGalleryUploadInput,
  folder: "cover" | "gallery",
) {
  const validationError = validateProjectImageFile({
    name: image.originalFilename,
    size: image.sizeBytes,
    type: image.mimeType,
  })
  if (validationError) throw new Error(validationError)

  const expectedPrefix = `${projectId}/${actorId}/${folder}/`
  if (
    !image.storagePath.startsWith(expectedPrefix) ||
    image.storagePath.includes("..") ||
    !projectImageStoragePath(image.storagePath, projectId)
  ) {
    throw new Error("The uploaded project image does not belong to this project.")
  }

  const { data: uploadedFile, error: downloadError } = await admin.storage
    .from(PROJECT_IMAGE_BUCKET)
    .download(image.storagePath)
  if (downloadError || !uploadedFile) {
    throw new Error(downloadError?.message || "The uploaded project image could not be found in Storage.")
  }

  const actualSize = uploadedFile.size
  const detectedType = detectProjectImageMimeType(new Uint8Array(await uploadedFile.arrayBuffer()))
  if (
    actualSize <= 0 ||
    actualSize > PROJECT_IMAGE_MAX_SIZE_BYTES ||
    !detectedType ||
    !isAllowedProjectImageType(detectedType)
  ) {
    throw new Error("The uploaded file is not a valid JPG, PNG, or WEBP project image.")
  }

  return { actualSize, detectedType }
}

export async function attachProjectGalleryImages(input: {
  projectId: string
  images: ProjectGalleryUploadInput[]
}): Promise<ActionResult<{ imageUrls: string[] }>> {
  try {
    if (input.images.length === 0) return { ok: true, data: { imageUrls: [] } }

    const orderIndexes = input.images.map((image) => image.orderIndex)
    if (new Set(orderIndexes).size !== orderIndexes.length || orderIndexes.some((index) => !Number.isInteger(index) || index < 0)) {
      return { ok: false, error: "Project images must have a valid unique order." }
    }

    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("image, supervising_organization_id")
      .eq("id", input.projectId)
      .maybeSingle()
    if (projectError) throw projectError
    if (!project) return { ok: false, error: "Project not found." }

    for (const image of input.images) {
      await validateStoredProjectGalleryImage(admin, input.projectId, actorId, image, "gallery")
    }

    const { data: existingRows, error: existingError } = await admin
      .from("project_images")
      .select("id, storage_path, order_index")
      .eq("project_id", input.projectId)
      .order("order_index", { ascending: true })
    if (existingError) throw existingError

    const existingPaths = new Set((existingRows ?? []).map((row: { storage_path: string }) => row.storage_path))
    const nextOrder = (existingRows ?? []).length
    const newImages = input.images
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .filter((image) => !existingPaths.has(image.storagePath))

    if (newImages.length > 0) {
      const { error: insertError } = await admin.from("project_images").insert(
        newImages.map((image, index) => ({
          project_id: input.projectId,
          storage_path: image.storagePath,
          created_by: actorId,
          order_index: nextOrder + index,
          updated_at: new Date().toISOString(),
        })),
      )
      if (insertError) throw insertError
    }

    await audit({
      actorId,
      action: "project.gallery_images_uploaded",
      entityType: "project",
      entityId: input.projectId,
      organizationId: project.supervising_organization_id,
      projectId: input.projectId,
      metadata: { count: newImages.length, storagePaths: newImages.map((image) => image.storagePath) },
    }).catch(() => undefined)

    revalidatePath("/", "layout")
    revalidatePath("/projects")
    revalidatePath(`/projects/${input.projectId}`)
    revalidatePath(`/projects/${input.projectId}/gallery`)

    const orderedPaths = [
      ...(existingRows ?? []).map((row: { storage_path: string }) => row.storage_path),
      ...newImages.map((image) => image.storagePath),
    ]
    return {
      ok: true,
      data: {
        imageUrls: orderedPaths
          .map((storagePath) => projectImageDisplayUrl(storagePath, input.projectId))
          .filter((url): url is string => Boolean(url)),
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AuthzError ? err.message : err instanceof Error ? err.message : "Could not save project gallery images.",
    }
  }
}

export async function attachProjectImage(input: {
  projectId: string
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
}): Promise<ActionResult<{ imageUrl: string }>> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    await validateStoredProjectGalleryImage(
      admin,
      input.projectId,
      actorId,
      { ...input, orderIndex: 0 },
      "cover",
    )

    const imageUrl = projectImageDisplayUrl(input.storagePath, input.projectId) ?? "/placeholder.svg"
    const [{ data: project, error: lookupError }, { data: currentImage, error: currentImageError }] = await Promise.all([
      admin
        .from("projects")
        .select("image, supervising_organization_id")
        .eq("id", input.projectId)
        .maybeSingle(),
      admin
        .from("project_images")
        .select("id, storage_path, order_index")
        .eq("project_id", input.projectId)
        .order("order_index", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])
    if (lookupError) throw lookupError
    if (currentImageError) throw currentImageError
    if (!project) return { ok: false, error: "Project not found." }

    if (currentImage?.id) {
      const { error: assignmentError } = await admin
        .from("project_images")
        .update({
          storage_path: input.storagePath,
          order_index: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentImage.id)
        .eq("project_id", input.projectId)
      if (assignmentError) throw assignmentError
    } else {
      const { error: assignmentError } = await admin.from("project_images").insert({
        project_id: input.projectId,
        storage_path: input.storagePath,
        created_by: actorId,
        order_index: 0,
        updated_at: new Date().toISOString(),
      })
      if (assignmentError) throw assignmentError
    }

    const previousPath = projectImageStoragePath(currentImage?.storage_path ?? project.image, input.projectId)
    if (previousPath && previousPath !== input.storagePath) {
      await admin.storage.from(PROJECT_IMAGE_BUCKET).remove([previousPath]).catch(() => undefined)
    }

    await audit({
      actorId,
      action: "project.image_uploaded",
      entityType: "project",
      entityId: input.projectId,
      organizationId: project.supervising_organization_id,
      projectId: input.projectId,
      metadata: { storagePath: input.storagePath, originalFilename: input.originalFilename },
    }).catch(() => undefined)
    revalidatePath("/", "layout")
    revalidatePath("/projects")
    revalidatePath(`/projects/${input.projectId}`)
    revalidatePath(`/projects/${input.projectId}/gallery`)
    return { ok: true, data: { imageUrl } }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AuthzError ? err.message : err instanceof Error ? err.message : "Could not save the project image.",
    }
  }
}

/** Create a project owned (supervised) by the caller's supervising org. */
export async function createProject(input: {
  supervisingOrgId: string
  name: string
  code?: string
  projectType?: ProjectTypeValue
  supervisionType?: SupervisionTypeValue
  supervisionTypeOther?: string
  plotNo?: string
  phase?: string
  supervisionStartDate: string
  priority?: ProjectPriorityValue
  includedStructureVisits?: number | null
  includedFinishingVisits?: number | null
  structureSupervisionFee?: string | number | null
  finishingSupervisionFee?: string | number | null
  receivedAmount?: string | number | null
  nextPaymentAmount?: string | number | null
  nextPaymentDueDate?: string | null
  invoiceReferencePaymentNote?: string | null
  initialRemarks?: string | null
  region?: string
  description?: string
  startDate?: string
  location?: string
  latitude?: number | null
  longitude?: number | null
  assignedUserId?: string | null
  assignedSupervisorId?: string | null
  owners?: Array<{
    name: string
    contactName?: string
    contactEmail?: string
    contactPhone?: string
    viewerUserId?: string | null
    viewerInvitationId?: string | null
  }>
  contractor?: {
    organizationId?: string | null
    companyName?: string
    registrationNumber?: string
    address?: string
    postalCode?: string
    phone?: string
  }
}): Promise<ActionResult<{ id: string; ownerIds: string[] }>> {
  let createdProjectId: string | null = null
  try {
    const actorId = await assertOrgAdmin(input.supervisingOrgId)
    const name = input.name.trim()
    if (name.length < 2) return { ok: false, error: "Project name is too short." }
    if (input.projectType && !isProjectTypeValue(input.projectType)) {
      return { ok: false, error: "Select a valid project type." }
    }
    if (input.supervisionType && !isSupervisionTypeValue(input.supervisionType)) {
      return { ok: false, error: "Select a valid supervision type." }
    }
    const supervisionTypeOther = input.supervisionType === "other"
      ? input.supervisionTypeOther?.trim() || ""
      : null
    if (input.supervisionType === "other" && !supervisionTypeOther) {
      return { ok: false, error: "Please specify the supervision type." }
    }
    if (supervisionTypeOther && supervisionTypeOther.length > MAX_SUPERVISION_TYPE_OTHER_LENGTH) {
      return { ok: false, error: "Supervision type must be 150 characters or fewer." }
    }
    const projectStartDate = normalizeOptionalProjectDate(input.startDate, "project start date")
    if (!projectStartDate.ok) return { ok: false, error: projectStartDate.error }
    const supervisionStartDate = normalizeOptionalProjectDate(input.supervisionStartDate, "supervision start date")
    if (!supervisionStartDate.ok) return { ok: false, error: supervisionStartDate.error }
    if (!supervisionStartDate.date) return { ok: false, error: "Supervision Start Date is required." }
    const priority = input.priority ?? "medium"
    if (!isProjectPriorityValue(priority)) return { ok: false, error: "Select a valid project priority." }
    const includedStructureVisits = normalizeOptionalVisitCount(input.includedStructureVisits, "Included structure visits")
    if (!includedStructureVisits.ok) return { ok: false, error: includedStructureVisits.error }
    const includedFinishingVisits = normalizeOptionalVisitCount(input.includedFinishingVisits, "Included finishing visits")
    if (!includedFinishingVisits.ok) return { ok: false, error: includedFinishingVisits.error }
    const structureSupervisionFee = normalizeOptionalProjectAmount(input.structureSupervisionFee, "Structure Supervision Fee")
    if (!structureSupervisionFee.ok) return { ok: false, error: structureSupervisionFee.error }
    const finishingSupervisionFee = normalizeOptionalProjectAmount(input.finishingSupervisionFee, "Finishing Supervision Fee")
    if (!finishingSupervisionFee.ok) return { ok: false, error: finishingSupervisionFee.error }
    const receivedAmount = normalizeOptionalProjectAmount(input.receivedAmount ?? 0, "Received Amount")
    if (!receivedAmount.ok) return { ok: false, error: receivedAmount.error }
    const nextPaymentAmount = normalizeOptionalProjectAmount(input.nextPaymentAmount, "Next Payment Amount")
    if (!nextPaymentAmount.ok) return { ok: false, error: nextPaymentAmount.error }
    const nextPaymentDueDate = normalizeOptionalProjectDate(input.nextPaymentDueDate, "next payment due date")
    if (!nextPaymentDueDate.ok) return { ok: false, error: nextPaymentDueDate.error }
    if ((input.invoiceReferencePaymentNote?.trim().length ?? 0) > PROJECT_FINANCIAL_NOTE_MAX_LENGTH) {
      return { ok: false, error: `Invoice Reference / Payment Note must be ${PROJECT_FINANCIAL_NOTE_MAX_LENGTH} characters or fewer.` }
    }
    if ((input.initialRemarks?.trim().length ?? 0) > PROJECT_INITIAL_REMARKS_MAX_LENGTH) {
      return { ok: false, error: `Initial Remarks must be ${PROJECT_INITIAL_REMARKS_MAX_LENGTH} characters or fewer.` }
    }
    const outstandingAmount = calculateProjectOutstandingAmount(
      structureSupervisionFee.value,
      finishingSupervisionFee.value,
      receivedAmount.value,
    )
    if (outstandingAmount < 0) {
      return { ok: false, error: "Received Amount cannot exceed the total supervision fees." }
    }

    const owners = (input.owners ?? []).map((owner) => ({
      name: owner.name.trim(),
      contactName: owner.contactName?.trim() || null,
      contactEmail: owner.contactEmail?.trim().toLowerCase() || null,
      contactPhone: owner.contactPhone?.trim() || null,
      viewerUserId: owner.viewerUserId?.trim() || null,
      viewerInvitationId: owner.viewerInvitationId?.trim() || null,
    }))
    if (owners.length > 10) return { ok: false, error: "A project can have up to 10 owners during creation." }
    if (owners.some((owner) => owner.name.length < 2)) {
      return { ok: false, error: "Enter a valid name for every owner." }
    }
    if (owners.some((owner) => owner.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.contactEmail))) {
      return { ok: false, error: "Enter a valid owner email address." }
    }

    const coordinates = normalizeProjectCoordinates(input.latitude, input.longitude)
    if (!coordinates.ok) return { ok: false, error: coordinates.error }
    const location =
      input.location?.trim() ||
      (coordinates.latitude != null && coordinates.longitude != null
        ? coordinateLabel(coordinates.latitude, coordinates.longitude)
        : null)
    const admin = createAdminClient()

    const { data: org } = await admin
      .from("organizations")
      .select("id, name, type")
      .eq("id", input.supervisingOrgId)
      .maybeSingle()
    if (org?.type !== "supervising") {
      return { ok: false, error: "Only a supervising organization can create projects." }
    }

    const selectedOwnerViewerUserIds = owners.map((owner) => owner.viewerUserId).filter((id): id is string => Boolean(id))
    const selectedOwnerViewerInvitationIds = owners.map((owner) => owner.viewerInvitationId).filter((id): id is string => Boolean(id))
    const ownerViewerUserIds = Array.from(new Set(selectedOwnerViewerUserIds))
    const ownerViewerInvitationIds = Array.from(new Set(selectedOwnerViewerInvitationIds))
    if (owners.some((owner) => owner.viewerUserId && owner.viewerInvitationId)) {
      return { ok: false, error: "Select only one Viewer source for each owner." }
    }
    if (ownerViewerUserIds.length !== selectedOwnerViewerUserIds.length || ownerViewerInvitationIds.length !== selectedOwnerViewerInvitationIds.length) {
      return { ok: false, error: "The same Viewer cannot be selected for more than one owner slot in a project." }
    }
    if (ownerViewerUserIds.some((id) => !UUID_PATTERN.test(id)) || ownerViewerInvitationIds.some((id) => !UUID_PATTERN.test(id))) {
      return { ok: false, error: "One of the selected Viewers is no longer available." }
    }

    if (ownerViewerUserIds.length > 0) {
      const { data: viewerMemberships, error: viewerMembershipError } = await admin
        .from("organization_memberships")
        .select("user_id")
        .eq("organization_id", input.supervisingOrgId)
        .eq("role", "viewer")
        .eq("status", "active")
        .in("user_id", ownerViewerUserIds)
      if (viewerMembershipError) throw viewerMembershipError
      const allowedViewerIds = new Set((viewerMemberships ?? []).map((membership) => membership.user_id))
      if (ownerViewerUserIds.some((id) => !allowedViewerIds.has(id))) {
        return { ok: false, error: "One of the selected Viewers is no longer an active Viewer in this organization." }
      }
    }

    if (ownerViewerInvitationIds.length > 0) {
      const { data: viewerInvitations, error: viewerInvitationError } = await admin
        .from("invitations")
        .select("id, organization_id, organization_role, status, expires_at")
        .eq("organization_id", input.supervisingOrgId)
        .eq("organization_role", "viewer")
        .eq("status", "pending")
        .in("id", ownerViewerInvitationIds)
      if (viewerInvitationError) throw viewerInvitationError
      const now = Date.now()
      const validInvitationIds = new Set(
        (viewerInvitations ?? [])
          .filter((invitation) => new Date(invitation.expires_at).getTime() > now)
          .map((invitation) => invitation.id),
      )
      if (ownerViewerInvitationIds.some((id) => !validInvitationIds.has(id))) {
        return { ok: false, error: "One of the selected pending Viewer invitations is no longer available." }
      }
    }

    const assignedUserId = input.assignedUserId?.trim() || null
    const assignedSupervisorId = input.assignedSupervisorId?.trim() || null
    const requestedAssigneeIds = Array.from(
      new Set([assignedUserId, assignedSupervisorId].filter((value): value is string => Boolean(value))),
    )
    if (requestedAssigneeIds.some((userId) => !UUID_PATTERN.test(userId))) {
      return { ok: false, error: "One of the selected project users is no longer available." }
    }
    if (requestedAssigneeIds.length) {
      const { data: assigneeMemberships, error: assigneeMembershipError } = await admin
        .from("organization_memberships")
        .select("user_id, role")
        .eq("organization_id", input.supervisingOrgId)
        .eq("status", "active")
        .in("user_id", requestedAssigneeIds)
      if (assigneeMembershipError) throw assigneeMembershipError

      const membershipByUser = new Map(
        (assigneeMemberships ?? []).map((membership) => [membership.user_id, membership.role] as const),
      )
      if (requestedAssigneeIds.some((userId) => !membershipByUser.has(userId))) {
        return { ok: false, error: "One of the selected project users is no longer available." }
      }
      if (
        assignedSupervisorId &&
        !isProjectSupervisorOrganizationRole(membershipByUser.get(assignedSupervisorId))
      ) {
        return { ok: false, error: "Select an active organization administrator, manager, or member as supervisor." }
      }
    }

    const contractorOrganizationId = input.contractor?.organizationId?.trim() || null
    let contractorOrganizationName: string | null = null
    if (contractorOrganizationId) {
      const { data: contractorOrganization, error: contractorLookupError } = await admin
        .from("organizations")
        .select("id, name, type, status")
        .eq("id", contractorOrganizationId)
        .maybeSingle()
      if (contractorLookupError) throw contractorLookupError
      if (!contractorOrganization || contractorOrganization.type !== "external" || contractorOrganization.status === "suspended") {
        return { ok: false, error: "The selected contractor organization is unavailable." }
      }
      contractorOrganizationName = contractorOrganization.name
    }

    // The wizard may edit the prefilled contractor details for this project only.
    // Prefer the submitted snapshot while keeping the selected organization relation intact.
    const contractorName = input.contractor?.companyName?.trim() || contractorOrganizationName || null
    const { data: created, error } = await admin
      .from("projects")
      .insert({
        name,
        code: input.code?.trim() || null,
        project_type: input.projectType || null,
        supervision_type: input.supervisionType || null,
        supervision_type_other: supervisionTypeOther,
        plot_no: input.plotNo?.trim() || null,
        phase: input.phase?.trim() || null,
        supervision_start_date: supervisionStartDate.date,
        priority,
        included_structure_visits: includedStructureVisits.value,
        included_finishing_visits: includedFinishingVisits.value,
        structure_supervision_fee: structureSupervisionFee.value,
        finishing_supervision_fee: finishingSupervisionFee.value,
        received_amount: receivedAmount.value,
        outstanding_amount: outstandingAmount,
        next_payment_amount: nextPaymentAmount.value,
        next_payment_due_date: nextPaymentDueDate.date,
        invoice_reference_payment_note: input.invoiceReferencePaymentNote?.trim() || null,
        initial_remarks: input.initialRemarks?.trim() || null,
        region: input.region?.trim() || null,
        description: input.description?.trim() || null,
        start_date: projectStartDate.date,
        location,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        contractor: contractorName,
        consultant: org.name,
        our_role: "Consultant",
        client: owners[0]?.name || null,
        contractor_organization_id: contractorOrganizationId,
        contractor_registration_number: input.contractor?.registrationNumber?.trim() || null,
        contractor_address: input.contractor?.address?.trim() || null,
        contractor_postal_code: input.contractor?.postalCode?.trim() || null,
        contractor_phone: input.contractor?.phone?.trim() || null,
        assigned_user_id: assignedUserId,
        assigned_supervisor_id: assignedSupervisorId,
        status: "active",
        supervising_organization_id: input.supervisingOrgId,
        created_by: actorId,
      })
      .select("id")
      .single()
    if (error) throw error
    createdProjectId = created.id

    // The supervising org is itself a participant in every project it creates.
    const { error: supervisingMembershipError } = await admin.from("project_organization_memberships").insert({
      project_id: created.id,
      organization_id: input.supervisingOrgId,
      project_role: "consultant",
      status: "active",
      created_by: actorId,
    })
    if (supervisingMembershipError) throw supervisingMembershipError

    const { error: userMembershipError } = await admin.from("project_user_memberships").insert({
      project_id: created.id,
      user_id: actorId,
      organization_id: input.supervisingOrgId,
      access_role: "project_admin",
      status: "active",
      created_by: actorId,
    })
    if (userMembershipError) throw userMembershipError

    const projectAssignments = new Map<string, "project_manager" | "contributor">()
    if (assignedUserId && assignedUserId !== actorId) {
      projectAssignments.set(assignedUserId, "contributor")
    }
    if (assignedSupervisorId && assignedSupervisorId !== actorId) {
      projectAssignments.set(assignedSupervisorId, "project_manager")
    }
    let supervisorAccessMembershipId: string | null = null
    if (projectAssignments.size) {
      const { data: assignmentMemberships, error: assignmentMembershipError } = await admin
        .from("project_user_memberships")
        .insert(
          Array.from(projectAssignments, ([userId, accessRole]) => ({
            project_id: created.id,
            user_id: userId,
            organization_id: input.supervisingOrgId,
            access_role: accessRole,
            status: "active",
            created_by: actorId,
          })),
        )
        .select("id, user_id")
      if (assignmentMembershipError) throw assignmentMembershipError
      supervisorAccessMembershipId =
        assignedSupervisorId && assignedSupervisorId !== actorId
          ? ((assignmentMemberships ?? []).find((membership) => membership.user_id === assignedSupervisorId)?.id ?? null)
          : null
    }

    if (contractorOrganizationId && contractorOrganizationId !== input.supervisingOrgId) {
      const { error: contractorMembershipError } = await admin.from("project_organization_memberships").insert({
        project_id: created.id,
        organization_id: contractorOrganizationId,
        project_role: "contractor",
        status: "active",
        created_by: actorId,
      })
      if (contractorMembershipError) throw contractorMembershipError
    }

    let createdOwners: Array<{ id: string; owner_order: number }> = []
    if (owners.length) {
      const { data: ownerRows, error: ownersError } = await admin.from("project_owners").insert(
        owners.map((owner, index) => ({
          project_id: created.id,
          owner_order: index + 1,
          name: owner.name,
          contact_name: owner.contactName,
          contact_email: owner.contactEmail,
          contact_phone: owner.contactPhone,
          viewer_user_id: owner.viewerUserId,
          viewer_invitation_id: owner.viewerInvitationId,
        })),
      ).select("id, owner_order")
      if (ownersError) throw ownersError
      createdOwners = ownerRows ?? []
    }

    const supervisorProfile = assignedSupervisorId
      ? await admin
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", assignedSupervisorId)
          .maybeSingle()
      : { data: null, error: null }
    if (supervisorProfile.error) throw supervisorProfile.error

    const ownerIdsByOrder = new Map(createdOwners.map((owner) => [owner.owner_order, owner.id] as const))
    const participantRows = [
      {
        project_id: created.id,
        organization_id: input.supervisingOrgId,
        organization_name: org.name,
        participant_type: "consultancy",
        project_role: "consultant",
        participant_role_label: assignedSupervisorId ? "Supervisor" : null,
        access_membership_id: supervisorAccessMembershipId,
        key_contact_user_id: assignedSupervisorId,
        key_contact_name:
          supervisorProfile.data?.full_name?.trim() || supervisorProfile.data?.email?.trim() || null,
        key_contact_email: supervisorProfile.data?.email?.trim() || null,
        key_contact_phone: null,
        status: "active",
        source_key: "consultant",
        sort_order: 10,
        created_by: actorId,
      },
      ...owners.flatMap((owner, index) => {
        const ownerId = ownerIdsByOrder.get(index + 1)
        return ownerId
          ? [{
              project_id: created.id,
              organization_id: null,
              organization_name: owner.name,
              participant_type: "client",
              project_role: "client",
              key_contact_user_id: owner.viewerUserId,
              key_contact_name: owner.contactName,
              key_contact_email: owner.contactEmail,
              key_contact_phone: owner.contactPhone,
              status: "active",
              source_key: `owner:${ownerId}`,
              sort_order: 21 + index,
              created_by: actorId,
            }]
          : []
      }),
      ...(contractorName
        ? [{
            project_id: created.id,
            organization_id: contractorOrganizationId,
            organization_name: contractorName,
            participant_type: "contractor",
            project_role: "contractor",
            key_contact_user_id: null,
            key_contact_name: null,
            key_contact_email: null,
            key_contact_phone: input.contractor?.phone?.trim() || null,
            status: "active",
            source_key: "contractor",
            sort_order: 40,
            created_by: actorId,
          }]
        : []),
    ]

    const { error: participantError } = await admin.from("project_participants").insert(participantRows)
    if (participantError) throw participantError

    await audit({
      actorId,
      action: "project.created",
      entityType: "project",
      entityId: created.id,
      organizationId: input.supervisingOrgId,
      projectId: created.id,
      metadata: {
        name,
        projectType: input.projectType || null,
        supervisionType: input.supervisionType || null,
        supervisionTypeOther,
        ownerCount: owners.length,
        contractorOrganizationId,
        assignedUserId,
        assignedSupervisorId,
      },
    })

    const cookieStore = await cookies()
    cookieStore.set(SELECTED_PROJECT_COOKIE, created.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    })

    revalidatePath("/", "layout")
    revalidatePath("/users")
    revalidatePath("/projects")
    revalidatePath("/calendar")
    return {
      ok: true,
      data: {
        id: created.id,
        ownerIds: createdOwners
          .sort((a, b) => a.owner_order - b.owner_order)
          .map((owner) => owner.id),
      },
    }
  } catch (err) {
    if (createdProjectId) {
      try {
        const admin = createAdminClient()
        await admin.from("projects").delete().eq("id", createdProjectId)
      } catch {
        // Preserve the original error if cleanup is unavailable.
      }
    }
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not create project." }
  }
}

export type OwnerIdCardUploadInput = {
  ownerId: string
  storagePath: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
}

export async function attachProjectOwnerIdCards(input: {
  projectId: string
  files: OwnerIdCardUploadInput[]
}): Promise<ActionResult<{ count: number }>> {
  try {
    if (!Array.isArray(input.files) || input.files.length === 0) {
      return { ok: false, error: "Select at least one owner ID card to upload." }
    }
    if (input.files.length > 10) {
      return { ok: false, error: "A project can have up to 10 owner ID cards during creation." }
    }

    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const ownerIds = Array.from(new Set(input.files.map((file) => file.ownerId.trim()).filter(Boolean)))
    if (ownerIds.length !== input.files.length) {
      return { ok: false, error: "Each uploaded ID card must belong to a different project owner." }
    }

    const { data: ownerRows, error: ownerLookupError } = await admin
      .from("project_owners")
      .select("id")
      .eq("project_id", input.projectId)
      .in("id", ownerIds)
    if (ownerLookupError) throw ownerLookupError
    if ((ownerRows ?? []).length !== ownerIds.length) {
      return { ok: false, error: "One of the selected owners is no longer available." }
    }

    const expectedPrefix = `${input.projectId}/${actorId}/owner-id-cards/`
    for (const file of input.files) {
      const validationError = validateOwnerIdCardFile({
        name: file.originalFilename,
        size: file.sizeBytes,
        type: file.mimeType,
      })
      if (validationError) return { ok: false, error: validationError }
      if (
        !file.storagePath.startsWith(expectedPrefix) ||
        file.storagePath.includes("..") ||
        !file.storagePath.includes(`/${file.ownerId}/`)
      ) {
        return { ok: false, error: "One of the uploaded owner ID cards does not belong to this project." }
      }
    }

    const uploadedAt = new Date().toISOString()
    for (const file of input.files) {
      const { error: updateError } = await admin
        .from("project_owners")
        .update({
          id_card_storage_path: file.storagePath,
          id_card_original_filename: file.originalFilename.trim(),
          id_card_mime_type: file.mimeType.trim() || "application/octet-stream",
          id_card_size_bytes: file.sizeBytes,
          id_card_uploaded_by: actorId,
          id_card_uploaded_at: uploadedAt,
          updated_at: uploadedAt,
        })
        .eq("id", file.ownerId)
        .eq("project_id", input.projectId)
      if (updateError) throw updateError
    }

    await audit({
      actorId,
      action: "project_owner.id_cards_uploaded",
      entityType: "project",
      entityId: input.projectId,
      projectId: input.projectId,
      metadata: { count: input.files.length, ownerIds },
    })
    revalidatePath("/projects")
    revalidatePath(`/projects/${input.projectId}`)
    return { ok: true, data: { count: input.files.length } }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AuthzError ? err.message : "Could not link the owner ID card uploads.",
    }
  }
}

/** Option 1: add an EXISTING organization to a project with a project role. */
export async function addExistingOrganizationToProject(input: {
  projectId: string
  organizationId: string
  projectRole: ProjectOrgRole
}): Promise<ActionResult> {
  try {
    if (!PROJECT_ORG_ROLES.includes(input.projectRole)) return { ok: false, error: "Invalid project role." }
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()

    const { data: org } = await admin
      .from("organizations")
      .select("id")
      .eq("id", input.organizationId)
      .maybeSingle()
    if (!org) return { ok: false, error: "Organization not found." }

    const { data: existing } = await admin
      .from("project_organization_memberships")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .maybeSingle()
    if (existing) return { ok: false, error: "This organization is already on the project." }

    const { error } = await admin.from("project_organization_memberships").insert({
      project_id: input.projectId,
      organization_id: input.organizationId,
      project_role: input.projectRole,
      status: "active",
      created_by: actorId,
    })
    if (error) throw error

    await audit({
      actorId,
      action: "project_org.added",
      entityType: "project_organization_membership",
      organizationId: input.organizationId,
      projectId: input.projectId,
      metadata: { projectRole: input.projectRole },
    })
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not add organization." }
  }
}

/**
 * Option 2: create a NEW organization, add it to the project with a role, and
 * invite its first org admin by email — all in one server-verified step.
 */
export async function createOrgAndAddToProject(input: {
  supervisingOrgId: string
  projectId: string
  organizationName: string
  projectRole: ProjectOrgRole
  adminEmail: string
}): Promise<ActionResult<InvitationActionData & { organizationId: string }>> {
  try {
    // assertProjectAdmin also covers supervising-org admins of this project.
    await assertProjectAdmin(input.projectId)

    const organizationCategory =
      input.projectRole === "contractor" || input.projectRole === "subcontractor"
        ? "contractor"
        : input.projectRole === "client"
          ? "client"
          : input.projectRole === "supplier"
            ? "supplier"
            : input.projectRole === "consultant"
              ? "consultant"
              : "other"

    const orgResult = await createOrganization({
      supervisingOrgId: input.supervisingOrgId,
      name: input.organizationName,
      organizationCategory,
    })
    if (!orgResult.ok || !orgResult.data) return orgResult as ActionResult<never>
    const organizationId = orgResult.data.id

    const addResult = await addExistingOrganizationToProject({
      projectId: input.projectId,
      organizationId,
      projectRole: input.projectRole,
    })
    if (!addResult.ok) return addResult as ActionResult<never>

    const inviteResult = await createInvitation({
      email: input.adminEmail,
      organizationId,
      organizationRole: "org_admin",
      projectId: input.projectId,
    })
    if (!inviteResult.ok || !inviteResult.data) return inviteResult as ActionResult<never>

    // Mark the new organization as invited (admin invitation pending).
    const admin = createAdminClient()
    await admin.from("organizations").update({ status: "invited" }).eq("id", organizationId)

    revalidatePath("/users")
    return {
      ok: true,
      data: {
        organizationId,
        ...inviteResult.data,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not create organization." }
  }
}

/** Update an organization's role within a project. */
export async function updateProjectOrgRole(input: {
  projectId: string
  membershipId: string
  projectRole: ProjectOrgRole
}): Promise<ActionResult> {
  try {
    if (!PROJECT_ORG_ROLES.includes(input.projectRole)) return { ok: false, error: "Invalid project role." }
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { error } = await admin
      .from("project_organization_memberships")
      .update({ project_role: input.projectRole })
      .eq("id", input.membershipId)
      .eq("project_id", input.projectId)
    if (error) throw error
    await audit({
      actorId,
      action: "project_org.role_updated",
      entityType: "project_organization_membership",
      entityId: input.membershipId,
      projectId: input.projectId,
      metadata: { projectRole: input.projectRole },
    })
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not update role." }
  }
}

/**
 * Assign an EXISTING org member to a project with a project access role.
 * The user must already be an active member of `organizationId`.
 */
export async function assignUserToProject(input: {
  projectId: string
  organizationId: string
  userId: string
  accessRole: ProjectAccessRole
}): Promise<ActionResult> {
  try {
    if (!PROJECT_ACCESS_ROLES.includes(input.accessRole)) return { ok: false, error: "Invalid access role." }
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()

    // The org must be a participant on the project.
    const { data: pom } = await admin
      .from("project_organization_memberships")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .maybeSingle()
    if (!pom) return { ok: false, error: "That organization is not on this project." }

    // The user must be an active member of the org.
    const { data: om } = await admin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.userId)
      .eq("status", "active")
      .maybeSingle()
    if (!om) return { ok: false, error: "That user is not a member of the organization." }

    const { data: existing } = await admin
      .from("project_user_memberships")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("organization_id", input.organizationId)
      .eq("user_id", input.userId)
      .eq("status", "active")
      .maybeSingle()
    if (existing) {
      const { error } = await admin
        .from("project_user_memberships")
        .update({ access_role: input.accessRole })
        .eq("id", existing.id)
      if (error) throw error
    } else {
      const { error } = await admin.from("project_user_memberships").insert({
        project_id: input.projectId,
        organization_id: input.organizationId,
        user_id: input.userId,
        access_role: input.accessRole,
        status: "active",
        created_by: actorId,
      })
      if (error) throw error
    }

    await audit({
      actorId,
      action: "project_user.assigned",
      entityType: "project_user_membership",
      organizationId: input.organizationId,
      projectId: input.projectId,
      metadata: { userId: input.userId, accessRole: input.accessRole },
    })
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not assign user." }
  }
}

/** Remove a user's access to a project. */
export async function removeProjectUser(input: {
  projectId: string
  membershipId: string
}): Promise<ActionResult> {
  try {
    const actorId = await assertProjectAdmin(input.projectId)
    const admin = createAdminClient()
    const { error } = await admin
      .from("project_user_memberships")
      .update({ status: "inactive" })
      .eq("id", input.membershipId)
      .eq("project_id", input.projectId)
    if (error) throw error
    await audit({
      actorId,
      action: "project_user.removed",
      entityType: "project_user_membership",
      entityId: input.membershipId,
      projectId: input.projectId,
    })
    revalidatePath("/users")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof AuthzError ? err.message : "Could not remove user." }
  }
}
