import type { ProjectStageAttachment } from "@/lib/db/project-stages"
import type { StageTranslationPageData } from "@/lib/stage-translations/types"

export function isPdfAttachment(attachment: ProjectStageAttachment) {
  return attachment.attachmentKind === "document" && (
    attachment.mimeType.toLowerCase() === "application/pdf" ||
    attachment.originalFilename.toLowerCase().endsWith(".pdf")
  )
}

export function getSourcePdfAttachment(data: StageTranslationPageData) {
  return data.response.attachments
    .filter(isPdfAttachment)
    .sort((left, right) => left.sortOrder - right.sortOrder)[0] ?? null
}

export function stageSourceDocumentUrl(
  data: Pick<StageTranslationPageData, "project">,
  attachment: ProjectStageAttachment,
  options: { download?: boolean } = {},
) {
  const params = new URLSearchParams({
    projectId: data.project.id,
    path: attachment.storagePath,
    filename: attachment.originalFilename,
  })
  if (options.download) params.set("download", "1")
  return `/api/stage-translations/source?${params.toString()}`
}
