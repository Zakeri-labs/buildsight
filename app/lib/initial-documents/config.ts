export const INITIAL_DOCUMENTS_BUCKET = "initial-docs"
export const INITIAL_DOCUMENT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024
export const INITIAL_DOCUMENT_MAX_FILES = 30

export const INITIAL_DOCUMENT_ALLOWED_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
  "png", "jpg", "jpeg", "webp", "gif", "dwg", "dxf", "zip",
] as const

export const INITIAL_DOCUMENT_ALLOWED_MIME_TYPES = [
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

export const INITIAL_DOCUMENT_ACCEPT = INITIAL_DOCUMENT_ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(",")

export const INITIAL_DOCUMENT_CATEGORIES = [
  { value: "contract", label: "Contract", labelAr: "العقد" },
  { value: "approved_drawings", label: "Approved Drawings", labelAr: "المخططات المعتمدة" },
  { value: "specifications", label: "Specifications", labelAr: "المواصفات" },
  { value: "boq", label: "BOQ", labelAr: "جدول الكميات" },
  { value: "tender_documents", label: "Tender Documents", labelAr: "مستندات المناقصة" },
  { value: "permits_approvals", label: "Permits and Approvals", labelAr: "التصاريح والموافقات" },
  { value: "scope_of_work", label: "Scope of Work", labelAr: "نطاق العمل" },
  { value: "project_brief", label: "Project Brief", labelAr: "ملخص المشروع" },
  { value: "consultant_agreement", label: "Consultant Agreement", labelAr: "اتفاقية الاستشاري" },
  { value: "contractor_agreement", label: "Contractor Agreement", labelAr: "اتفاقية المقاول" },
  { value: "initial_site_reports", label: "Initial Site Reports", labelAr: "تقارير الموقع الأولية" },
  { value: "other", label: "Other", labelAr: "أخرى" },
] as const

export type InitialDocumentCategory = (typeof INITIAL_DOCUMENT_CATEGORIES)[number]["value"]
export type InitialDocumentCategoryDefinition = (typeof INITIAL_DOCUMENT_CATEGORIES)[number]

export const INITIAL_DOCUMENT_UPLOAD_CARDS = [
  { value: "drawing", label: "Drawing", labelAr: "المخططات", category: "approved_drawings", multiple: false },
  { value: "supervision_agreement", label: "Supervision Agreement", labelAr: "اتفاقية الإشراف", category: "consultant_agreement", multiple: false },
  { value: "contract_agreement", label: "Contract Agreement", labelAr: "اتفاقية العقد", category: "contractor_agreement", multiple: false },
  { value: "three_d_perspective", label: "3D Perspective", labelAr: "منظور ثلاثي الأبعاد", category: "other", multiple: false },
  { value: "approval_document", label: "Approval Document", labelAr: "مستند الموافقة", category: "permits_approvals", multiple: false },
  { value: "test_reports", label: "Test Reports", labelAr: "تقارير الاختبار", category: "initial_site_reports", multiple: false },
  { value: "additional_documents", label: "Additional Documents", labelAr: "مستندات إضافية", category: "other", multiple: true },
] as const satisfies readonly {
  value: string
  label: string
  labelAr: string
  category: InitialDocumentCategory
  multiple: boolean
}[]

export type InitialDocumentUploadCategory = (typeof INITIAL_DOCUMENT_UPLOAD_CARDS)[number]["value"]
export type InitialDocumentUploadCategoryDefinition = (typeof INITIAL_DOCUMENT_UPLOAD_CARDS)[number]

const uploadCategoryMap = new Map<string, InitialDocumentUploadCategoryDefinition>(
  INITIAL_DOCUMENT_UPLOAD_CARDS.map((category) => [category.value, category]),
)

export function isInitialDocumentUploadCategory(value: unknown): value is InitialDocumentUploadCategory {
  return typeof value === "string" && uploadCategoryMap.has(value)
}

export function getInitialDocumentUploadCategory(value: unknown): InitialDocumentUploadCategoryDefinition | null {
  return typeof value === "string" ? uploadCategoryMap.get(value) ?? null : null
}

export function getInitialDocumentUploadCategoryFromPath(filePath: unknown): InitialDocumentUploadCategoryDefinition | null {
  if (typeof filePath !== "string") return null
  const segments = filePath.split("/").filter(Boolean)
  const marker = segments[3]
  return marker?.startsWith("category-") ? getInitialDocumentUploadCategory(marker.slice("category-".length)) : null
}

const categoryMap = new Map<string, InitialDocumentCategoryDefinition>(
  INITIAL_DOCUMENT_CATEGORIES.map((category) => [category.value, category]),
)
const allowedExtensions = new Set<string>(INITIAL_DOCUMENT_ALLOWED_EXTENSIONS)
const allowedMimeTypes = new Set<string>(INITIAL_DOCUMENT_ALLOWED_MIME_TYPES)

export function isInitialDocumentCategory(value: unknown): value is InitialDocumentCategory {
  return typeof value === "string" && categoryMap.has(value)
}

export function getInitialDocumentCategory(value: unknown): InitialDocumentCategoryDefinition {
  return (typeof value === "string" ? categoryMap.get(value) : null) ?? categoryMap.get("other")!
}

export function getInitialDocumentExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.trim().toLowerCase()
  return extension && extension !== fileName.toLowerCase() ? extension : ""
}

export function validateInitialDocumentFile(file: { name: string; size: number; type?: string }): string | null {
  if (!file.name.trim()) return "The selected file does not have a valid filename."
  if (file.size <= 0) return `${file.name} is empty.`
  if (file.size > INITIAL_DOCUMENT_MAX_FILE_SIZE_BYTES) return `${file.name} exceeds the 50 MB file size limit.`

  const extension = getInitialDocumentExtension(file.name)
  const mimeType = file.type?.trim().toLowerCase() ?? ""
  if (!allowedExtensions.has(extension)) return `${file.name} is not an allowed file type.`
  if (mimeType && !allowedMimeTypes.has(mimeType)) return `${file.name} has an unsupported file format.`
  return null
}

export function sanitizeInitialDocumentFileName(fileName: string): string {
  const sanitized = fileName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return sanitized || "document"
}

export function formatInitialDocumentFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}
