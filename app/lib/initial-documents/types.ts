import type { InitialDocumentCategory, InitialDocumentUploadCategory } from "@/lib/initial-documents/config"

export type InitialDocumentListItem = {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  category: InitialDocumentCategory
  uploadCategory: InitialDocumentUploadCategory | null
  projectId: string
  projectName: string
  uploadedBy: string
  createdAt: string
}
