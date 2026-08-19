import type { DocumentTypeValue } from "@/lib/documents/document-types"

export const DOCUMENT_ASSET_BUCKET = "document-images"
export const SIMPLE_UPLOAD_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
export const SIMPLE_UPLOAD_MAX_ADDITIONAL_FILES = 20

export const SIMPLE_UPLOAD_ALLOWED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "dwg",
  "dxf",
  "zip",
] as const

export const SIMPLE_UPLOAD_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "image/vnd.dwg",
  "image/x-dwg",
  "application/acad",
  "application/dxf",
  "image/vnd.dxf",
] as const

export const SIMPLE_UPLOAD_ACCEPT = SIMPLE_UPLOAD_ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(",")

export const SIMPLE_UPLOAD_CATEGORIES = [
  { value: "drawing", label: "Drawing", labelAr: "المخططات", documentType: "drawing", multiple: true },
  { value: "supervision_agreement", label: "Supervision Agreement", labelAr: "اتفاقية الإشراف", documentType: "other", multiple: true },
  { value: "contract_agreement", label: "Contract Agreement", labelAr: "اتفاقية العقد", documentType: "other", multiple: true },
  { value: "3d_perspective", label: "3D Perspective", labelAr: "منظور ثلاثي الأبعاد", documentType: "drawing", multiple: true },
  { value: "approval_document", label: "Approval Document", labelAr: "مستند الموافقة", documentType: "approval", multiple: true },
  { value: "test_reports", label: "Test Reports", labelAr: "تقارير الاختبار", documentType: "test_report", multiple: true },
  { value: "additional_documents", label: "Additional Documents", labelAr: "مستندات إضافية", documentType: "other", multiple: true },
] as const satisfies readonly {
  value: string
  label: string
  labelAr: string
  documentType: DocumentTypeValue
  multiple: boolean
}[]

export type SimpleUploadCategoryValue = (typeof SIMPLE_UPLOAD_CATEGORIES)[number]["value"]
export type SimpleUploadCategoryDefinition = (typeof SIMPLE_UPLOAD_CATEGORIES)[number]

const SIMPLE_UPLOAD_CATEGORY_BY_VALUE = new Map<string, SimpleUploadCategoryDefinition>(
  SIMPLE_UPLOAD_CATEGORIES.map((category) => [category.value, category] as const),
)
const ALLOWED_EXTENSIONS = new Set<string>(SIMPLE_UPLOAD_ALLOWED_EXTENSIONS)
const ALLOWED_MIME_TYPES = new Set<string>(SIMPLE_UPLOAD_ALLOWED_MIME_TYPES)

export function isSimpleUploadCategory(value: unknown): value is SimpleUploadCategoryValue {
  return typeof value === "string" && SIMPLE_UPLOAD_CATEGORY_BY_VALUE.has(value)
}

export function getSimpleUploadCategory(value: unknown): SimpleUploadCategoryDefinition | null {
  return typeof value === "string" ? SIMPLE_UPLOAD_CATEGORY_BY_VALUE.get(value) ?? null : null
}

export function getFileExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.trim().toLowerCase()
  return extension && extension !== fileName.toLowerCase() ? extension : ""
}

export function validateSimpleUploadFile(file: { name: string; size: number; type?: string }): string | null {
  if (!file.name.trim()) return "The selected file does not have a valid filename."
  if (file.size <= 0) return `${file.name} is empty.`
  if (file.size > SIMPLE_UPLOAD_MAX_FILE_SIZE_BYTES) {
    return `${file.name} exceeds the 50 MB file size limit.`
  }

  const extension = getFileExtension(file.name)
  const mimeType = file.type?.trim().toLowerCase() ?? ""
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return `${file.name} is not an allowed file type.`
  }
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    return `${file.name} has an unsupported file format.`
  }

  return null
}

export function sanitizeStorageFileName(fileName: string): string {
  const sanitized = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return sanitized || "document"
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}
