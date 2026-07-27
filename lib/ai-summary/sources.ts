import "server-only"

import { assertProjectMember } from "@/lib/auth/guards"
import { getDocumentTypeDefinition, normalizeDocumentType } from "@/lib/documents/document-types"
import { getRichTextImagePaths, isRichTextDocument, type RichTextDocument } from "@/lib/documents/rich-text"
import { getSimpleUploadCategory } from "@/lib/documents/simple-upload"
import { createAdminClient } from "@/lib/supabase/admin"

export type AiSummaryInspectionSource = {
  id: string
  termId: string
  title: string
  reportNumber: string
  stageName: string
  status: string
  updatedAt: string
  imageCount: number
  documentCount: number
  approvalCount: number
}

export type AiSummaryDocumentSource = {
  id: string
  title: string
  reference: string
  typeLabel: string
  status: string
  updatedAt: string
  imageCount: number
  fileCount: number
}

export type AiSummarySourceData = {
  project: { id: string; name: string; code: string | null }
  inspections: AiSummaryInspectionSource[]
  documents: AiSummaryDocumentSource[]
}

function richTextImageCount(value: unknown) {
  return isRichTextDocument(value) ? getRichTextImagePaths(value).length : 0
}

export async function loadAiSummarySources(projectId: string): Promise<AiSummarySourceData | null> {
  await assertProjectMember(projectId)
  const admin = createAdminClient()

  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id, name, code")
    .eq("id", projectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project) return null

  const [{ data: responses, error: responseError }, { data: documents, error: documentError }] = await Promise.all([
    admin
      .from("term_responses")
      .select("id, project_stage_term_id, report_number, report_title, status, updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    admin
      .from("documents")
      .select("id, reference, title, document_type, status, updated_at, content, file_storage_path, original_filename, simple_upload_category")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
  ])
  if (responseError) throw responseError
  if (documentError) throw documentError

  const responseRows = responses ?? []
  const responseIds = responseRows.map((row: any) => row.id as string)
  const termIds = responseRows.map((row: any) => row.project_stage_term_id as string)

  const [{ data: terms }, { data: attachments }, { data: approvals }] = await Promise.all([
    termIds.length
      ? admin.from("project_stage_terms").select("id, project_stage_id, report_name").in("id", termIds)
      : Promise.resolve({ data: [] as any[] }),
    responseIds.length
      ? admin.from("response_attachments").select("response_id, attachment_kind").in("response_id", responseIds)
      : Promise.resolve({ data: [] as any[] }),
    responseIds.length
      ? admin.from("approvals").select("response_id").in("response_id", responseIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const stageIds = Array.from(new Set((terms ?? []).map((row: any) => row.project_stage_id as string)))
  const { data: stages } = stageIds.length
    ? await admin.from("project_stages").select("id, name").in("id", stageIds)
    : { data: [] as any[] }

  const termMap = new Map<string, { project_stage_id: string; report_name: string }>(
    (terms ?? []).map((row: any) => [row.id, { project_stage_id: row.project_stage_id, report_name: row.report_name }]),
  )
  const stageMap = new Map<string, string>((stages ?? []).map((row: any) => [row.id, row.name]))
  const attachmentCounts = new Map<string, { images: number; documents: number }>()
  for (const row of attachments ?? []) {
    const current = attachmentCounts.get(row.response_id) ?? { images: 0, documents: 0 }
    if (row.attachment_kind === "document") current.documents += 1
    else current.images += 1
    attachmentCounts.set(row.response_id, current)
  }
  const approvalCounts = new Map<string, number>()
  for (const row of approvals ?? []) approvalCounts.set(row.response_id, (approvalCounts.get(row.response_id) ?? 0) + 1)

  const inspectionSources: AiSummaryInspectionSource[] = responseRows.map((row: any) => {
    const term = termMap.get(row.project_stage_term_id)
    const counts = attachmentCounts.get(row.id) ?? { images: 0, documents: 0 }
    return {
      id: row.id,
      termId: row.project_stage_term_id,
      title: row.report_title || term?.report_name || "Inspection report",
      reportNumber: row.report_number,
      stageName: term ? stageMap.get(term.project_stage_id) ?? "Project stage" : "Project stage",
      status: row.status,
      updatedAt: row.updated_at,
      imageCount: counts.images,
      documentCount: counts.documents,
      approvalCount: approvalCounts.get(row.id) ?? 0,
    }
  })

  const documentSources: AiSummaryDocumentSource[] = (documents ?? []).map((row: any) => {
    const type = getDocumentTypeDefinition(normalizeDocumentType(row.document_type))
    const simpleCategory = getSimpleUploadCategory(row.simple_upload_category)
    return {
      id: row.id,
      title: row.title,
      reference: row.reference,
      typeLabel: simpleCategory?.label ?? type.label,
      status: row.status,
      updatedAt: row.updated_at,
      imageCount: richTextImageCount(row.content),
      fileCount: row.file_storage_path ? 1 : 0,
    }
  })

  return {
    project: { id: project.id, name: project.name, code: project.code },
    inspections: inspectionSources,
    documents: documentSources,
  }
}

export function richTextToPlainText(document: RichTextDocument): string {
  const inlineText = (nodes: Array<{ type: string; text?: string }> | undefined) =>
    (nodes ?? []).map((node) => node.type === "hardBreak" ? "\n" : node.text ?? "").join("")

  return document.content
    .map((block) => {
      if (block.type === "image") return `[Embedded image: ${block.attrs.alt || block.attrs.storagePath.split("/").pop() || "image"}]`
      if (block.type === "paragraph" || block.type === "heading") return inlineText(block.content)
      if (block.type === "bulletList" || block.type === "orderedList") {
        return block.content
          .map((item, index) => `${block.type === "orderedList" ? `${index + 1}.` : "-"} ${item.content.map((paragraph) => inlineText(paragraph.content)).join(" ")}`)
          .join("\n")
      }
      return ""
    })
    .filter(Boolean)
    .join("\n\n")
}
