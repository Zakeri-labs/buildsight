"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Building2,
  Camera,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  FileUp,
  ImageIcon,
  Images,
  Loader2,
  MapPin,
  Star,
  Trash2,
  UsersRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ProjectLocationField } from "@/components/projects/project-location-field"
import { ProjectOwnerViewerSelector } from "@/components/projects/project-owner-viewer-selector"
import {
  ProjectFinancialFields,
  type ProjectFinancialFormValues,
} from "@/components/projects/project-financial-fields"
import {
  ProjectInitialDocumentUploadStep,
  type InitialProjectDocumentSelection,
} from "@/components/initial-documents/project-initial-document-upload-step"
import {
  attachProjectGalleryImages,
  attachProjectOwnerIdCards,
  createProject,
  type OwnerIdCardUploadInput,
} from "@/lib/actions/projects"
import { saveInitialDocumentAction } from "@/lib/actions/initial-documents"
import { useI18n } from "@/lib/i18n"
import { EMPTY_PROJECT_LOCATION, type ProjectLocationValue } from "@/lib/locations/types"
import { DOCUMENT_ASSET_BUCKET, sanitizeStorageFileName } from "@/lib/documents/simple-upload"
import {
  INITIAL_DOCUMENTS_BUCKET,
  sanitizeInitialDocumentFileName,
  validateInitialDocumentFile,
} from "@/lib/initial-documents/config"
import { uploadDocumentAsset, uploadStorageAsset } from "@/lib/documents/storage-upload"
import { createClient } from "@/lib/supabase/client"
import {
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
  SUPERVISION_TYPES,
  type ProjectPriorityValue,
  type ProjectTypeValue,
  type SupervisionTypeValue,
} from "@/lib/projects/project-options"
import {
  OWNER_ID_CARD_ACCEPT,
  validateOwnerIdCardFile,
} from "@/lib/projects/owner-id-card"
import {
  PROJECT_IMAGE_ACCEPT,
  PROJECT_IMAGE_BUCKET,
  validateProjectImageFile,
} from "@/lib/projects/project-image"
import { validateProjectFinancialForm } from "@/lib/projects/project-financial"
import type { ProjectOwnerViewerOption } from "@/lib/actions/project-owner-viewers"
import { cn } from "@/lib/utils"

type OwnerDetails = {
  name: string
  contactName: string
  contactEmail: string
  contactPhone: string
  idCardFile: File | null
}

type ProjectImageDraft = { id: string; file: File }

type ContractorOrganization = {
  id: string
  name: string
  status: "active" | "pending" | "invited"
  registrationNumber: string
  address: string
  postalCode: string
  phone: string
}
type UserOption = {
  id: string
  name: string
  email: string
  organizationRole: string
}

const MAX_OWNERS = 10
function emptyOwner(): OwnerDetails {
  return { name: "", contactName: "", contactEmail: "", contactPhone: "", idCardFile: null }
}

function isOptionalWholeNumber(value: string) {
  return value === "" || /^\d+$/.test(value)
}

function optionalWholeNumber(value: string): number | null {
  return value === "" ? null : Number(value)
}

export function generateAutoProjectCode(
  orgName: string,
  startDateStr: string,
  existingCodes: string[] = [],
): string {
  let prefix = "Bonyan"
  if (orgName?.trim()) {
    const firstWord = orgName.trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, "")
    if (firstWord.length >= 2) prefix = firstWord
  }

  let year = 2026
  if (startDateStr) {
    const parsedDate = new Date(startDateStr)
    if (!isNaN(parsedDate.getTime())) {
      year = parsedDate.getFullYear()
    }
  } else {
    year = new Date().getFullYear()
  }

  const yearRegex = new RegExp(`[/\\-_]${year}[/\\-_](\\d+)`, "i")
  let maxSeq = year === 2026 ? 109 : 0

  for (const c of existingCodes) {
    if (!c) continue
    const match = c.match(yearRegex)
    if (match && match[1]) {
      const num = parseInt(match[1], 10)
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num
      }
    }
  }

  const nextSeq = maxSeq + 1
  const paddedSeq = nextSeq < 100 ? String(nextSeq).padStart(3, "0") : String(nextSeq)
  return `${prefix}/sup/${year}/${paddedSeq}`
}

export function ProjectCreateForm({
  supervisingOrg,
  contractorOrganizations,
  users,
  supervisors,
  existingProjectCodes = [],
}: {
  supervisingOrg: { id: string; name: string }
  contractorOrganizations: ContractorOrganization[]
  users: UserOption[]
  supervisors: UserOption[]
  existingProjectCodes?: string[]
}) {
  const router = useRouter()
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [codeTouched, setCodeTouched] = useState(false)
  const [projectType, setProjectType] = useState<ProjectTypeValue | "">("")
  const [supervisionType, setSupervisionType] = useState<SupervisionTypeValue | "">("")
  const [supervisionTypeOther, setSupervisionTypeOther] = useState("")
  const [location, setLocation] = useState<ProjectLocationValue>(EMPTY_PROJECT_LOCATION)
  const [areaDistrict, setAreaDistrict] = useState("")
  const [phase, setPhase] = useState("")
  const [plotNo, setPlotNo] = useState("")
  const [projectStartDate, setProjectStartDate] = useState("")
  const [supervisionStartDate, setSupervisionStartDate] = useState("")
  const [priority, setPriority] = useState<ProjectPriorityValue>("medium")
  const [includedStructureVisits, setIncludedStructureVisits] = useState("")
  const [includedFinishingVisits, setIncludedFinishingVisits] = useState("")
  const [description, setDescription] = useState("")
  const [projectImages, setProjectImages] = useState<ProjectImageDraft[]>([])
  const [assignedUserId, setAssignedUserId] = useState("")
  const [assignedSupervisorId, setAssignedSupervisorId] = useState("")
  const [owners, setOwners] = useState<OwnerDetails[]>([emptyOwner()])
  const [selectedOwnerViewers, setSelectedOwnerViewers] = useState<(ProjectOwnerViewerOption | null)[]>([null])
  const [contractorOrganizationId, setContractorOrganizationId] = useState("")
  const [contractorCompanyName, setContractorCompanyName] = useState("")
  const [contractorRegistrationNumber, setContractorRegistrationNumber] = useState("")
  const [contractorAddress, setContractorAddress] = useState("")
  const [contractorPostalCode, setContractorPostalCode] = useState("")
  const [contractorPhone, setContractorPhone] = useState("")
  const [financialValues, setFinancialValues] = useState<ProjectFinancialFormValues>({
    structureSupervisionFee: "",
    finishingSupervisionFee: "",
    receivedAmount: "0",
    nextPaymentAmount: "",
    nextPaymentDueDate: "",
    invoiceReferencePaymentNote: "",
    initialRemarks: "",
  })
  const [initialDocuments, setInitialDocuments] = useState<InitialProjectDocumentSelection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadingFile, setUploadingFile] = useState<string | null>(null)
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const [createdOwnerIds, setCreatedOwnerIds] = useState<string[]>([])
  const [ownerIdCardsUploaded, setOwnerIdCardsUploaded] = useState(false)
  const [initialDocumentsUploaded, setInitialDocumentsUploaded] = useState(false)
  const [projectImagesUploaded, setProjectImagesUploaded] = useState(false)
  const projectStartDateInputRef = useRef<HTMLInputElement>(null)
  const supervisionStartDateInputRef = useRef<HTMLInputElement>(null)
  const submissionLockRef = useRef(false)

  useEffect(() => {
    if (!codeTouched) {
      const autoCode = generateAutoProjectCode(supervisingOrg.name, projectStartDate, existingProjectCodes)
      setCode(autoCode)
    }
  }, [projectStartDate, supervisingOrg.name, existingProjectCodes, codeTouched])

  const selectedDocumentCount = initialDocuments.length
  const selectedOwnerIdCardCount = useMemo(
    () => owners.reduce((total, owner) => total + (owner.idCardFile ? 1 : 0), 0),
    [owners],
  )
  const selectedUploadCount = selectedDocumentCount + selectedOwnerIdCardCount + projectImages.length
  const selectedContractorOrganization = useMemo(
    () => contractorOrganizations.find((organization) => organization.id === contractorOrganizationId) ?? null,
    [contractorOrganizationId, contractorOrganizations],
  )
  const activeContractorOrganizations = useMemo(
    () => contractorOrganizations.filter((organization) => organization.status === "active"),
    [contractorOrganizations],
  )
  const pendingContractorOrganizations = useMemo(
    () => contractorOrganizations.filter((organization) => organization.status !== "active"),
    [contractorOrganizations],
  )

  const copy = isArabic
    ? {
        back: "العودة إلى المشاريع",
        title: "إضافة مشروع جديد",
        subtitle: `سيتم إنشاء هذا المشروع ضمن ${supervisingOrg.name}.`,
        org: "الجهة المشرفة",
        steps: ["تفاصيل المشروع", "بيانات المالك / العميل", "المقاول", "المستندات"],
        stepDescriptions: [
          "أدخل معلومات المشروع وموقعه وعيّن المستخدم والمشرف وحدد الزيارات المشمولة.",
          "أضف بيانات المالك أو العميل ومعلومات الاتصال.",
          "عيّن المقاول وسجّل بيانات الشركة.",
          "أرفق المستندات الأولية للمشروع.",
        ],
        name: "اسم المشروع",
        namePlaceholder: "مثال: برج المرسى السكني",
        code: "رقم / رمز المشروع",
        codePlaceholder: "مثال: PRJ-009",
        projectType: "نوع المشروع",
        projectTypePlaceholder: "اختر نوع المشروع",
        supervisionType: "نوع الإشراف",
        supervisionTypePlaceholder: "اختر نوع الإشراف",
        supervisionTypeOther: "تحديد نوع الإشراف",
        supervisionTypeOtherPlaceholder: "أدخل نوع الإشراف",
        requiredSupervisionTypeOther: "يرجى تحديد نوع الإشراف.",
        assignUser: "تعيين مستخدم",
        assignUserPlaceholder: "اختر مستخدم المشروع",
        assignSupervisor: "تعيين مشرف",
        assignSupervisorPlaceholder: "اختر مشرف المشروع",
        projectImages: "صور المشروع",
        projectImagesHelp: "أضف صور JPG أو PNG أو WebP بحد أقصى 10 ميجابايت لكل صورة. الصورة الأولى هي الغلاف.",
        addProjectImages: "إضافة صور",
        coverImage: "صورة الغلاف",
        setAsCover: "تعيين كغلاف",
        removeProjectImage: "إزالة",
        noProjectImages: "لم تتم إضافة صور للمشروع",
        moveImageEarlier: "تحريك الصورة إلى اليسار",
        moveImageLater: "تحريك الصورة إلى اليمين",
        areaDistrict: "المنطقة / الحي",
        areaDistrictPlaceholder: "مثال: وسط المدينة أو منطقة الأعمال",
        phase: "المرحلة",
        phasePlaceholder: "مثال: المرحلة 1",
        plotNo: "رقم قطعة الأرض",
        plotNoPlaceholder: "مثال: 42-B",
        projectStartDate: "تاريخ بدء المشروع",
        openProjectStartDateCalendar: "فتح تقويم تاريخ بدء المشروع",
        supervisionStartDate: "تاريخ بدء الإشراف",
        openSupervisionStartDateCalendar: "فتح تقويم تاريخ بدء الإشراف",
        priority: "الأولوية",
        includedVisits: "نطاق الإشراف",
        includedStructureVisits: "زيارات الهيكل الإنشائي المشمولة",
        includedFinishingVisits: "زيارات التشطيبات المشمولة",
        visitsPlaceholder: "مثال: 12",
        invalidVisitCounts: "يجب أن تكون الزيارات المشمولة أعدادًا صحيحة غير سالبة.",
        invalidFinancialAmounts: "أدخل مبالغ صحيحة غير سالبة، ويجب ألا يتجاوز المبلغ المستلم إجمالي رسوم الإشراف.",
        description: "وصف المشروع",
        descriptionPlaceholder: "نبذة مختصرة عن نطاق المشروع وأهدافه",
        ownerCount: "عدد المالكين",
        selectExistingVisitor: "اختيار Viewer مسجل",
        selectExistingVisitorPlaceholder: "اختر Viewer",
        enterOwnerManually: "إدخال بيانات المالك يدويًا",
        inviteNewVisitor: "دعوة Viewer جديد",
        searchVisitors: "البحث بالاسم أو البريد أو الهاتف",
        loadingVisitors: "جارٍ تحديث Viewers…",
        noVisitors: "لا يوجد Viewers مطابقون.",
        retryVisitors: "إعادة المحاولة",
        owner: "المالك",
        ownerName: "اسم المالك",
        ownerNamePlaceholder: "اسم المالك أو الجهة",
        contactName: "اسم جهة الاتصال",
        contactEmail: "البريد الإلكتروني",
        contactPhone: "رقم الهاتف",
        idCard: "مسح / تصوير بطاقة الهوية",
        idCardHelp: "JPG أو PNG أو WebP أو PDF، بحد أقصى 10 ميجابايت. سيتم الرفع بعد إنشاء المشروع فقط.",
        chooseIdCard: "اختيار بطاقة الهوية",
        captureIdCard: "التقاط صورة",
        replaceIdCard: "استبدال الملف",
        removeIdCard: "إزالة الملف",
        noIdCard: "لم يتم اختيار بطاقة هوية",
        assignContractor: "تعيين مقاول مسجل",
        noContractor: "بدون تعيين جهة مسجلة",
        activeOrganizations: "الجهات المعتمدة",
        pendingOrganizations: "الجهات قيد الاعتماد",
        approvedOrganization: "معتمدة",
        pendingApproval: "قيد الاعتماد",
        pendingContractorWarning: "هذه الجهة قيد الاعتماد. يمكنك تعيينها لهذا المشروع، ولكن يظل الوصول محدودًا حتى اعتمادها.",
        companyName: "اسم الشركة",
        registration: "رقم السجل التجاري",
        address: "العنوان",
        postalCode: "الرمز البريدي",
        phone: "رقم الهاتف",
        documentsIntro: "ستُحفظ الملفات المحددة كمستندات أولية للمشروع وستظهر في صفحة المستندات.",
        optional: "اختياري",
        cancel: "إلغاء",
        backStep: "السابق",
        next: "التالي",
        submit: "إنشاء المشروع",
        retryUpload: "إعادة محاولة رفع الملفات",
        creating: "جارٍ إنشاء المشروع…",
        uploading: "جارٍ رفع الملفات…",
        created: "تم إنشاء المشروع بنجاح.",
        requiredProject: "أكمل جميع حقول تفاصيل المشروع المطلوبة، بما فيها الموقع والمستخدم والمشرف.",
        requiredOwners: "أدخل اسمًا صحيحًا لكل مالك.",
        invalidOwnerEmail: "أدخل بريدًا إلكترونيًا صحيحًا لكل مالك.",
        documentUploadFailed: "تم إنشاء المشروع، لكن تعذر رفع بعض الملفات. أعد المحاولة لإكمال الرفع.",
      }
    : {
        back: "Back to Projects",
        title: "Add New Project",
        subtitle: `This project will be created under ${supervisingOrg.name}.`,
        org: "Supervising organization",
        steps: ["Project Details", "Owner / Client Information", "Contractor", "Documents"],
        stepDescriptions: [
          "Enter project details, location, assignments, and included supervision visits.",
          "Capture owner or client details and contact information.",
          "Assign the contractor and company information.",
          "Attach the initial project documents.",
        ],
        name: "Project Name",
        namePlaceholder: "e.g. Marina West Residences",
        code: "Project Number / Code",
        codePlaceholder: "e.g. PRJ-009",
        projectType: "Project Type",
        projectTypePlaceholder: "Select project type",
        supervisionType: "Supervision Type",
        supervisionTypePlaceholder: "Select supervision type",
        supervisionTypeOther: "Specify Supervision Type",
        supervisionTypeOtherPlaceholder: "Enter the supervision type",
        requiredSupervisionTypeOther: "Please specify the supervision type.",
        assignUser: "Assign User",
        assignUserPlaceholder: "Select a project user",
        assignSupervisor: "Assign Supervisor",
        assignSupervisorPlaceholder: "Select a project supervisor",
        projectImages: "Project Images",
        projectImagesHelp: "Add JPG, PNG, or WebP images up to 10 MB each. The first image is the project cover.",
        addProjectImages: "Add Images",
        coverImage: "Cover Image",
        setAsCover: "Set as Cover",
        removeProjectImage: "Remove",
        noProjectImages: "No project images selected",
        moveImageEarlier: "Move image earlier",
        moveImageLater: "Move image later",
        areaDistrict: "Area / District",
        areaDistrictPlaceholder: "e.g. Downtown or Business District",
        phase: "Phase",
        phasePlaceholder: "e.g. Phase 1",
        plotNo: "Plot No.",
        plotNoPlaceholder: "e.g. 42-B",
        projectStartDate: "Project Start Date",
        openProjectStartDateCalendar: "Open project start date calendar",
        supervisionStartDate: "Supervision Start Date",
        openSupervisionStartDateCalendar: "Open supervision start date calendar",
        priority: "Priority",
        includedVisits: "Supervision Scope",
        includedStructureVisits: "Included Structure Visits",
        includedFinishingVisits: "Included Finishing Visits",
        visitsPlaceholder: "e.g. 12",
        invalidVisitCounts: "Included visits must be non-negative whole numbers.",
        invalidFinancialAmounts: "Enter valid non-negative amounts, and do not let Received Amount exceed the total supervision fees.",
        description: "Project Description",
        descriptionPlaceholder: "Briefly describe the project scope and objectives",
        ownerCount: "Number of Owners",
        selectExistingVisitor: "Select Existing Viewer",
        selectExistingVisitorPlaceholder: "Select a viewer",
        enterOwnerManually: "Enter Owner details manually",
        inviteNewVisitor: "Invite New Viewer",
        searchVisitors: "Search name, email, or phone",
        loadingVisitors: "Refreshing viewers…",
        noVisitors: "No viewers found.",
        retryVisitors: "Retry",
        owner: "Owner",
        ownerName: "Owner Name",
        ownerNamePlaceholder: "Owner or client organization",
        contactName: "Contact Name",
        contactEmail: "Contact Email",
        contactPhone: "Contact Phone",
        idCard: "Scan / Capture ID Card",
        idCardHelp: "JPG, PNG, WebP, or PDF up to 10 MB. The file uploads only after the project is created.",
        chooseIdCard: "Choose ID Card",
        captureIdCard: "Capture Photo",
        replaceIdCard: "Replace File",
        removeIdCard: "Remove File",
        noIdCard: "No ID card selected",
        assignContractor: "Assign Registered Contractor",
        noContractor: "No registered organization assigned",
        activeOrganizations: "Active Organizations",
        pendingOrganizations: "Pending Organizations",
        approvedOrganization: "Approved",
        pendingApproval: "Pending Approval",
        pendingContractorWarning: "This organization is pending approval. You can assign it to this project, but access remains limited until approval.",
        companyName: "Company Name",
        registration: "Registration / CR Number",
        address: "Address",
        postalCode: "Postal Code",
        phone: "Phone Number",
        documentsIntro: "Selected files will be saved as initial project documents and appear in Documents.",
        optional: "Optional",
        cancel: "Cancel",
        backStep: "Back",
        next: "Next",
        submit: "Create Project",
        retryUpload: "Retry File Upload",
        creating: "Creating project…",
        uploading: "Uploading files…",
        created: "Project created successfully.",
        requiredProject: "Complete all required project details, including location, assigned user, and supervisor.",
        requiredOwners: "Enter a valid name for every owner.",
        invalidOwnerEmail: "Enter a valid email address for every owner.",
        documentUploadFailed: "The project was created, but some files could not be uploaded. Retry to complete the upload.",
      }

  const stepIcons = [MapPin, UsersRound, Building2, FileUp]

  function setOwnerCount(count: number) {
    const safeCount = Math.max(1, Math.min(MAX_OWNERS, count))
    setOwners((current) => {
      if (safeCount === current.length) return current
      if (safeCount < current.length) return current.slice(0, safeCount)
      return [...current, ...Array.from({ length: safeCount - current.length }, () => emptyOwner())]
    })
    setSelectedOwnerViewers((current) => {
      if (safeCount === current.length) return current
      if (safeCount < current.length) return current.slice(0, safeCount)
      return [...current, ...Array.from({ length: safeCount - current.length }, () => null)]
    })
    setError(null)
  }

  function updateOwner<Field extends keyof OwnerDetails>(
    index: number,
    field: Field,
    value: OwnerDetails[Field],
  ) {
    setOwners((current) => current.map((owner, ownerIndex) => (
      ownerIndex === index ? { ...owner, [field]: value } : owner
    )))
    setError(null)
  }

  function selectOwnerViewer(ownerIndex: number, viewer: ProjectOwnerViewerOption) {
    setSelectedOwnerViewers((current) => current.map((selectedViewer, index) => (
      index === ownerIndex ? viewer : selectedViewer
    )))
    setOwners((current) => current.map((owner, index) => (
      index === ownerIndex
        ? {
            ...owner,
            name: viewer.ownerName,
            contactName: viewer.contactName,
            contactEmail: viewer.email,
            contactPhone: viewer.phone,
          }
        : owner
    )))
    setError(null)
  }

  function useManualOwnerEntry(ownerIndex: number) {
    setSelectedOwnerViewers((current) => current.map((selectedViewer, index) => (
      index === ownerIndex ? null : selectedViewer
    )))
    setError(null)
  }

  function validateStep(targetStep: number): string | null {
    if (targetStep === 1) {
      for (const image of projectImages) {
        const imageValidationError = validateProjectImageFile(image.file)
        if (imageValidationError) return imageValidationError
      }
      if (
        name.trim().length < 2 ||
        code.trim().length < 1 ||
        !projectType ||
        !supervisionType ||
        !location.address.trim() ||
        !assignedUserId ||
        !assignedSupervisorId
      ) {
        return copy.requiredProject
      }
      if (supervisionType === "other" && !supervisionTypeOther.trim()) {
        return copy.requiredSupervisionTypeOther
      }
      if (!isOptionalWholeNumber(includedStructureVisits) || !isOptionalWholeNumber(includedFinishingVisits)) {
        return copy.invalidVisitCounts
      }
      return null
    }
    if (targetStep === 2) {
      if (owners.some((owner) => owner.name.trim().length < 2)) return copy.requiredOwners
      const invalidEmail = owners.some((owner) => {
        const email = owner.contactEmail.trim()
        return email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      })
      if (invalidEmail) return copy.invalidOwnerEmail
      for (const owner of owners) {
        if (!owner.idCardFile) continue
        const validationError = validateOwnerIdCardFile(owner.idCardFile)
        if (validationError) return validationError
      }
      return null
    }
    if (targetStep === 3) {
      const financialValidation = validateProjectFinancialForm(financialValues)
      if (!financialValidation.ok) return copy.invalidFinancialAmounts
      return null
    }
    if (targetStep === 4) {
      for (const selection of initialDocuments) {
        const validationError = validateInitialDocumentFile(selection.file)
        if (validationError) return validationError
      }
    }
    return null
  }

  function goNext() {
    const validationError = validateStep(step)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setStep((current) => Math.min(4, current + 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function goBack() {
    setError(null)
    setStep((current) => Math.max(1, current - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function uploadProjectImages(projectId: string) {
    if (projectImages.length === 0) return

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error("Your session has expired. Sign in again.")

    const totalBytes = projectImages.reduce((total, image) => total + image.file.size, 0)
    let completedBytes = 0
    const uploadedPaths: string[] = []
    const records: Array<{
      storagePath: string
      originalFilename: string
      mimeType: string
      sizeBytes: number
      orderIndex: number
    }> = []

    try {
      for (const [index, image] of projectImages.entries()) {
        const file = image.file
        const validationError = validateProjectImageFile(file)
        if (validationError) throw new Error(validationError)

        const progressLabel = isArabic
          ? `جارٍ رفع صورة المشروع ${index + 1}/${projectImages.length}: ${file.name}`
          : `Uploading project image ${index + 1}/${projectImages.length}: ${file.name}`
        setSubmissionMessage(progressLabel)
        setUploadingFile(progressLabel)

        const storagePath = `${projectId}/${session.user.id}/gallery/${image.id}-${sanitizeStorageFileName(file.name)}`
        await uploadStorageAsset(
          file,
          storagePath,
          session.access_token,
          (fileProgress) => {
            const uploadedForCurrent = (fileProgress / 100) * file.size
            setUploadProgress(Math.round(((completedBytes + uploadedForCurrent) / Math.max(totalBytes, 1)) * 100))
          },
          PROJECT_IMAGE_BUCKET,
          true,
        )
        completedBytes += file.size
        uploadedPaths.push(storagePath)
        records.push({
          storagePath,
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          orderIndex: index,
        })
      }

      const savingMessage = isArabic ? "جارٍ حفظ معرض صور المشروع…" : "Saving project gallery…"
      setSubmissionMessage(savingMessage)
      setUploadingFile(savingMessage)
      const result = await attachProjectGalleryImages({ projectId, images: records })
      if (!result.ok) throw new Error(result.error)
      setUploadProgress(100)
    } catch (uploadError) {
      if (uploadedPaths.length) {
        await supabase.storage.from(PROJECT_IMAGE_BUCKET).remove(uploadedPaths).catch(() => undefined)
      }
      throw uploadError
    }
  }

  async function uploadOwnerIdCards(projectId: string, ownerIds: string[]) {
    const filesToUpload = owners.flatMap((owner, index) => {
      const ownerId = ownerIds[index]
      return owner.idCardFile && ownerId
        ? [{ ownerId, file: owner.idCardFile }]
        : []
    })
    if (filesToUpload.length === 0) return 0

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error("Your session has expired. Sign in again.")

    const totalBytes = filesToUpload.reduce((total, item) => total + item.file.size, 0)
    let completedBytes = 0
    const uploadedPaths: string[] = []
    const records: OwnerIdCardUploadInput[] = []

    try {
      for (const [index, { ownerId, file }] of filesToUpload.entries()) {
        const validationError = validateOwnerIdCardFile(file)
        if (validationError) throw new Error(validationError)
        const progressLabel = isArabic
          ? `جارٍ رفع بطاقة هوية المالك ${index + 1}/${filesToUpload.length}: ${file.name}`
          : `Uploading owner ID card ${index + 1}/${filesToUpload.length}: ${file.name}`
        setSubmissionMessage(progressLabel)
        setUploadingFile(progressLabel)
        const storagePath = `${projectId}/${session.user.id}/owner-id-cards/${ownerId}/${crypto.randomUUID()}-${sanitizeStorageFileName(file.name)}`
        await uploadDocumentAsset(file, storagePath, session.access_token, (fileProgress) => {
          const uploadedBytes = completedBytes + (file.size * fileProgress) / 100
          setUploadProgress(Math.min(99, Math.round((uploadedBytes / totalBytes) * 100)))
        })
        uploadedPaths.push(storagePath)
        completedBytes += file.size
        records.push({
          ownerId,
          storagePath,
          originalFilename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        })
      }

      const linkMessage = isArabic ? "جارٍ ربط بطاقات الهوية بالمالكين…" : "Linking owner ID cards…"
      setSubmissionMessage(linkMessage)
      setUploadingFile(linkMessage)
      const result = await attachProjectOwnerIdCards({ projectId, files: records })
      if (!result.ok) throw new Error(result.error)
      setUploadProgress(100)
      return result.data?.count ?? records.length
    } catch (uploadError) {
      if (uploadedPaths.length) {
        void supabase.storage.from(DOCUMENT_ASSET_BUCKET).remove(uploadedPaths).then(() => undefined, () => undefined)
      }
      throw uploadError
    }
  }

  async function uploadInitialProjectDocuments(projectId: string) {
    if (initialDocuments.length === 0) return 0

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error("Your session has expired. Sign in again.")

    const totalBytes = initialDocuments.reduce((total, item) => total + item.file.size, 0)
    let completedBytes = 0

    for (const [index, selection] of initialDocuments.entries()) {
      const file = selection.file
      const validationError = validateInitialDocumentFile(file)
      if (validationError) throw new Error(validationError)

      const progressLabel = isArabic
        ? `جارٍ رفع المستند الأولي ${index + 1}/${initialDocuments.length}: ${file.name}`
        : `Uploading initial document ${index + 1}/${initialDocuments.length}: ${file.name}`
      setSubmissionMessage(progressLabel)
      setUploadingFile(progressLabel)

      const storagePath = `${projectId}/${session.user.id}/${selection.id}/category-${selection.uploadCategory}/${sanitizeInitialDocumentFileName(file.name)}`
      await uploadStorageAsset(
        file,
        storagePath,
        session.access_token,
        (fileProgress) => {
          const uploadedBytes = completedBytes + (file.size * fileProgress) / 100
          setUploadProgress(Math.min(99, Math.round((uploadedBytes / Math.max(totalBytes, 1)) * 100)))
        },
        INITIAL_DOCUMENTS_BUCKET,
        true,
      )

      const result = await saveInitialDocumentAction({
        id: selection.id,
        projectId,
        category: selection.category,
        storagePath,
        originalFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      })
      if (!result.ok) throw new Error(`${file.name}: ${result.error}`)
      completedBytes += file.size
    }

    setUploadProgress(100)
    return initialDocuments.length
  }

  async function submitProject() {
    if (step !== 4 || pending || submissionLockRef.current) return

    for (let currentStep = 1; currentStep <= 4; currentStep += 1) {
      const validationError = validateStep(currentStep)
      if (validationError) {
        setStep(currentStep)
        setError(validationError)
        return
      }
    }

    submissionLockRef.current = true
    setError(null)
    setSuccess(false)
    setPending(true)
    setUploadProgress(0)
    setUploadingFile(null)
    setSubmissionMessage(copy.creating)

    let projectId = createdProjectId
    let ownerIds = createdOwnerIds
    let completed = false

    try {
      if (!projectId) {
        const result = await createProject({
          supervisingOrgId: supervisingOrg.id,
          name,
          code,
          projectType,
          supervisionType,
          supervisionTypeOther: supervisionType === "other" ? supervisionTypeOther.trim() : undefined,
          plotNo,
          supervisionStartDate,
          priority,
          includedStructureVisits: optionalWholeNumber(includedStructureVisits),
          includedFinishingVisits: optionalWholeNumber(includedFinishingVisits),
          location: location.address,
          region: areaDistrict,
          phase,
          latitude: location.latitude,
          longitude: location.longitude,
          description,
          startDate: projectStartDate,
          assignedUserId,
          assignedSupervisorId,
          structureSupervisionFee: financialValues.structureSupervisionFee,
          finishingSupervisionFee: financialValues.finishingSupervisionFee,
          receivedAmount: financialValues.receivedAmount,
          nextPaymentAmount: financialValues.nextPaymentAmount,
          nextPaymentDueDate: financialValues.nextPaymentDueDate,
          invoiceReferencePaymentNote: financialValues.invoiceReferencePaymentNote,
          initialRemarks: financialValues.initialRemarks,
          owners: owners.map((owner, index) => {
            const selectedViewer = selectedOwnerViewers[index] ?? null
            return {
              name: owner.name,
              contactName: owner.contactName,
              contactEmail: owner.contactEmail,
              contactPhone: owner.contactPhone,
              viewerUserId: selectedViewer?.source === "registered" ? selectedViewer.id : null,
              viewerInvitationId: selectedViewer?.source === "pending" ? selectedViewer.id : null,
            }
          }),
          contractor: {
            organizationId: contractorOrganizationId || null,
            companyName: contractorCompanyName,
            registrationNumber: contractorRegistrationNumber,
            address: contractorAddress,
            postalCode: contractorPostalCode,
            phone: contractorPhone,
          },
        })

        if (!result.ok) throw new Error(result.error)
        if (!result.data) throw new Error(isArabic ? "تعذر إنشاء المشروع." : "Could not create project.")

        projectId = result.data.id
        ownerIds = result.data.ownerIds
        setCreatedProjectId(projectId)
        setCreatedOwnerIds(ownerIds)
      }

      if (projectImages.length > 0 && !projectImagesUploaded) {
        setUploadProgress(0)
        await uploadProjectImages(projectId)
        setProjectImagesUploaded(true)
      }

      if (selectedOwnerIdCardCount > 0 && !ownerIdCardsUploaded) {
        setUploadProgress(0)
        await uploadOwnerIdCards(projectId, ownerIds)
        setOwnerIdCardsUploaded(true)
      }

      if (selectedDocumentCount > 0 && !initialDocumentsUploaded) {
        setUploadProgress(0)
        await uploadInitialProjectDocuments(projectId)
        setInitialDocumentsUploaded(true)
      }

      completed = true
      setUploadProgress(100)
      setSubmissionMessage(copy.created)
      setUploadingFile(copy.created)
      setSuccess(true)

      const destination = `/projects/${projectId}`
      router.replace(destination)
      window.setTimeout(() => {
        if (window.location.pathname !== destination) window.location.assign(destination)
      }, 1500)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Could not create project."
      setError(
        createdProjectId || projectId
          ? `${copy.documentUploadFailed} ${message}`.trim()
          : message,
      )
    } finally {
      if (!completed) {
        setPending(false)
        setUploadingFile(null)
        setSubmissionMessage(null)
        setUploadProgress(0)
        submissionLockRef.current = false
      }
    }
  }

  const CurrentIcon = stepIcons[step - 1]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <Link
        href="/projects"
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {copy.back}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">{copy.subtitle}</p>
      </div>

      <nav aria-label={isArabic ? "خطوات إنشاء المشروع" : "Project creation steps"} className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
        <ol className="grid grid-cols-4 gap-2 sm:gap-4">
          {copy.steps.map((label, index) => {
            const number = index + 1
            const complete = number < step
            const current = number === step
            return (
              <li key={label} className="relative min-w-0">
                {index < 3 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-4 h-0.5 w-[calc(100%-2rem)] bg-border ltr:left-[calc(50%+1rem)] rtl:right-[calc(50%+1rem)] sm:top-5",
                      number < step && "bg-primary",
                    )}
                  />
                ) : null}
                <div className="relative z-10 flex flex-col items-center gap-2 text-center">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full border bg-background text-xs font-bold text-muted-foreground sm:size-10 sm:text-sm",
                      complete && "border-primary bg-primary text-primary-foreground",
                      current && "border-primary text-primary ring-4 ring-primary/10",
                    )}
                    aria-current={current ? "step" : undefined}
                  >
                    {complete ? <Check className="size-4" /> : number}
                  </span>
                  <span className={cn("line-clamp-2 text-[11px] font-medium text-muted-foreground sm:text-xs", current && "text-foreground")}>{label}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </nav>

      <form onSubmit={(event) => event.preventDefault()}>
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-5 py-5 sm:px-7">
            <CardTitle className="flex items-start gap-3 text-lg">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CurrentIcon className="size-5" />
              </span>
              <span>
                <span className="block">{step}. {copy.steps[step - 1]}</span>
                <span className="mt-1 block text-sm font-normal text-muted-foreground">{copy.stepDescriptions[step - 1]}</span>
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-5 sm:p-7">
            {step === 1 ? (
              <div className="space-y-6">
                <div className="rounded-xl border bg-muted/25 px-4 py-3 text-sm">
                  <span className="font-medium">{copy.org}:</span> {supervisingOrg.name}
                </div>

                <div className="rounded-2xl border bg-muted/15 p-4 sm:p-5 lg:p-6">
                  <ProjectLocationField
                    id="new-project-location"
                    value={location}
                    onChange={setLocation}
                    areaField={{
                      value: areaDistrict,
                      onChange: setAreaDistrict,
                      label: copy.areaDistrict,
                      placeholder: copy.areaDistrictPlaceholder,
                    }}
                    contentAfterAreaField={
                      <Field label={`${copy.phase} (${copy.optional})`} htmlFor="new-project-phase">
                        <Input
                          id="new-project-phase"
                          value={phase}
                          onChange={(event) => setPhase(event.target.value)}
                          placeholder={copy.phasePlaceholder}
                          disabled={pending}
                          className="h-10"
                        />
                      </Field>
                    }
                    disabled={pending}
                  >
                    <div className="flex h-full min-h-0 flex-col gap-4">
                      <Field label={copy.name} htmlFor="new-project-name" required>
                        <Input
                          id="new-project-name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder={copy.namePlaceholder}
                          autoComplete="organization"
                          minLength={2}
                          disabled={pending}
                          className="h-10"
                        />
                      </Field>
                      <Field label={copy.code} htmlFor="new-project-code" required>
                        <Input
                          id="new-project-code"
                          value={code}
                          onChange={(event) => {
                            setCode(event.target.value)
                            setCodeTouched(Boolean(event.target.value.trim()))
                          }}
                          placeholder={copy.codePlaceholder}
                          disabled={pending}
                          className="h-10"
                        />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={`${copy.plotNo} (${copy.optional})`} htmlFor="new-project-plot-no">
                          <Input
                            id="new-project-plot-no"
                            value={plotNo}
                            onChange={(event) => setPlotNo(event.target.value)}
                            placeholder={copy.plotNoPlaceholder}
                            disabled={pending}
                            className="h-10"
                          />
                        </Field>
                        <Field label={copy.priority}>
                          <Select
                            value={priority}
                            onValueChange={(value) => value && setPriority(value as ProjectPriorityValue)}
                            disabled={pending}
                          >
                            <SelectTrigger className="h-10 w-full">
                              <SelectValue>
                                {(value) => {
                                  const option = PROJECT_PRIORITIES.find((item) => item.value === String(value))
                                  return option ? (isArabic ? option.labelAr : option.label) : String(value ?? "")
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {PROJECT_PRIORITIES.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {isArabic ? option.labelAr : option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={copy.projectType} required>
                          <Select value={projectType || null} onValueChange={(value) => setProjectType((value as ProjectTypeValue | null) ?? "")} disabled={pending}>
                            <SelectTrigger className="h-10 w-full">
                              <SelectValue placeholder={copy.projectTypePlaceholder}>
                                {(value) => {
                                  if (!value) return copy.projectTypePlaceholder
                                  const option = PROJECT_TYPES.find((item) => item.value === String(value))
                                  return option ? (isArabic ? option.labelAr : option.label) : humanizeMachineValue(String(value))
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {PROJECT_TYPES.map((option) => <SelectItem key={option.value} value={option.value}>{isArabic ? option.labelAr : option.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label={copy.supervisionType} required>
                          <Select
                            value={supervisionType || null}
                            onValueChange={(value) => {
                              const nextValue = (value as SupervisionTypeValue | null) ?? ""
                              setSupervisionType(nextValue)
                              if (nextValue !== "other") setSupervisionTypeOther("")
                              setError(null)
                            }}
                            disabled={pending}
                          >
                            <SelectTrigger className="h-10 w-full">
                              <SelectValue placeholder={copy.supervisionTypePlaceholder}>
                                {(value) => {
                                  if (!value) return copy.supervisionTypePlaceholder
                                  const option = SUPERVISION_TYPES.find((item) => item.value === String(value))
                                  return option ? (isArabic ? option.labelAr : option.label) : humanizeMachineValue(String(value))
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {SUPERVISION_TYPES.map((option) => <SelectItem key={option.value} value={option.value}>{isArabic ? option.labelAr : option.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                      {supervisionType === "other" ? (
                        <Field label={copy.supervisionTypeOther} htmlFor="new-project-supervision-type-other" required>
                          <Input
                            id="new-project-supervision-type-other"
                            value={supervisionTypeOther}
                            onChange={(event) => {
                              setSupervisionTypeOther(event.target.value)
                              setError(null)
                            }}
                            placeholder={copy.supervisionTypeOtherPlaceholder}
                            maxLength={150}
                            disabled={pending}
                            className="h-10"
                          />
                        </Field>
                      ) : null}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={`${copy.projectStartDate} (${copy.optional})`} htmlFor="new-project-start-date">
                          <div className="relative">
                            <Input
                              ref={projectStartDateInputRef}
                              id="new-project-start-date"
                              type="date"
                              value={projectStartDate}
                              onChange={(event) => setProjectStartDate(event.target.value)}
                              disabled={pending}
                              className="h-10 pe-11 [&::-webkit-calendar-picker-indicator]:opacity-0"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute end-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                const input = projectStartDateInputRef.current
                                if (!input || pending) return
                                try {
                                  input.showPicker()
                                } catch {
                                  input.focus()
                                  input.click()
                                }
                              }}
                              disabled={pending}
                              aria-label={copy.openProjectStartDateCalendar}
                              title={copy.openProjectStartDateCalendar}
                            >
                              <CalendarDays className="size-4" />
                            </Button>
                          </div>
                        </Field>
                        <Field label={`${copy.supervisionStartDate} (${copy.optional})`} htmlFor="new-project-supervision-start-date">
                          <div className="relative">
                            <Input
                              ref={supervisionStartDateInputRef}
                              id="new-project-supervision-start-date"
                              type="date"
                              value={supervisionStartDate}
                              onChange={(event) => setSupervisionStartDate(event.target.value)}
                              disabled={pending}
                              className="h-10 pe-11 [&::-webkit-calendar-picker-indicator]:opacity-0"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute end-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                const input = supervisionStartDateInputRef.current
                                if (!input || pending) return
                                try {
                                  input.showPicker()
                                } catch {
                                  input.focus()
                                  input.click()
                                }
                              }}
                              disabled={pending}
                              aria-label={copy.openSupervisionStartDateCalendar}
                              title={copy.openSupervisionStartDateCalendar}
                            >
                              <CalendarDays className="size-4" />
                            </Button>
                          </div>
                        </Field>
                      </div>
                      <div className="flex min-h-32 flex-1 flex-col gap-2">
                        <Label htmlFor="new-project-description">{copy.description} ({copy.optional})</Label>
                        <textarea
                          id="new-project-description"
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          placeholder={copy.descriptionPlaceholder}
                          disabled={pending}
                          rows={4}
                          className="min-h-24 flex-1 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 lg:resize-none"
                        />
                      </div>
                    </div>
                  </ProjectLocationField>
                </div>

                <ProjectGalleryField
                  images={projectImages}
                  onChange={(nextImages) => {
                    setProjectImages(nextImages)
                    setProjectImagesUploaded(false)
                    setError(null)
                  }}
                  disabled={pending}
                  label={`${copy.projectImages} (${copy.optional})`}
                  help={copy.projectImagesHelp}
                  addLabel={copy.addProjectImages}
                  coverLabel={copy.coverImage}
                  setCoverLabel={copy.setAsCover}
                  removeLabel={copy.removeProjectImage}
                  emptyLabel={copy.noProjectImages}
                  moveEarlierLabel={copy.moveImageEarlier}
                  moveLaterLabel={copy.moveImageLater}
                />

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label={copy.assignUser} required>
                    <Select
                      value={assignedUserId || null}
                      onValueChange={(value) => setAssignedUserId(value == null ? "" : String(value))}
                      disabled={pending}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder={copy.assignUserPlaceholder}>
                          {(value) => {
                            if (!value) return copy.assignUserPlaceholder
                            const user = users.find((item) => item.id === String(value))
                            return user ? userOptionLabel(user) : (isArabic ? "مستخدم محدد" : "Selected user")
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}{user.email && user.email !== user.name ? ` — ${user.email}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={copy.assignSupervisor} required>
                    <Select
                      value={assignedSupervisorId || null}
                      onValueChange={(value) => setAssignedSupervisorId(value == null ? "" : String(value))}
                      disabled={pending}
                    >
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder={copy.assignSupervisorPlaceholder}>
                          {(value) => {
                            if (!value) return copy.assignSupervisorPlaceholder
                            const user = supervisors.find((item) => item.id === String(value))
                            return user ? userOptionLabel(user) : (isArabic ? "مشرف محدد" : "Selected supervisor")
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {supervisors.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}{user.email && user.email !== user.name ? ` — ${user.email}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <section className="rounded-2xl border bg-muted/10 p-4 sm:p-5" aria-labelledby="project-supervision-scope-title">
                  <h3 id="project-supervision-scope-title" className="mb-3 text-sm font-semibold">{copy.includedVisits}</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={`${copy.includedStructureVisits} (${copy.optional})`} htmlFor="included-structure-visits">
                      <Input
                        id="included-structure-visits"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={includedStructureVisits}
                        onChange={(event) => {
                          setIncludedStructureVisits(event.target.value)
                          setError(null)
                        }}
                        placeholder={copy.visitsPlaceholder}
                        disabled={pending}
                        className="h-10"
                      />
                    </Field>
                    <Field label={`${copy.includedFinishingVisits} (${copy.optional})`} htmlFor="included-finishing-visits">
                      <Input
                        id="included-finishing-visits"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={includedFinishingVisits}
                        onChange={(event) => {
                          setIncludedFinishingVisits(event.target.value)
                          setError(null)
                        }}
                        placeholder={copy.visitsPlaceholder}
                        disabled={pending}
                        className="h-10"
                      />
                    </Field>
                  </div>
                </section>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="w-full space-y-2 sm:max-w-xs">
                    <Label htmlFor="owner-count">{copy.ownerCount}</Label>
                    <Select value={String(owners.length)} onValueChange={(value) => setOwnerCount(Number(value ?? 1))} disabled={pending}>
                      <SelectTrigger id="owner-count" className="h-10 w-full">
                        <SelectValue>{(value) => String(value ?? owners.length)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: MAX_OWNERS }, (_, index) => index + 1).map((count) => (
                          <SelectItem key={count} value={String(count)}>{count}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant="outline"
                    className="h-10 w-full bg-transparent sm:w-auto"
                    disabled={pending}
                    render={
                      <Link href="/users?tab=members" target="_blank" rel="noopener noreferrer">
                        {copy.inviteNewVisitor}
                      </Link>
                    }
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {owners.map((owner, index) => (
                    <section key={index} className="rounded-2xl border bg-muted/10 p-4 sm:p-5" aria-labelledby={`owner-${index}-title`}>
                      <h3 id={`owner-${index}-title`} className="mb-4 flex items-center gap-2 text-sm font-semibold">
                        <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{index + 1}</span>
                        {copy.owner} {index + 1}
                      </h3>

                      <div className="mb-4">
                        <ProjectOwnerViewerSelector
                          id={`owner-${index}-viewer`}
                          supervisingOrgId={supervisingOrg.id}
                          selectedViewer={selectedOwnerViewers[index] ?? null}
                          onSelectViewer={(viewer) => selectOwnerViewer(index, viewer)}
                          onManualEntry={() => useManualOwnerEntry(index)}
                          disabled={pending}
                          labels={{
                            label: copy.selectExistingVisitor,
                            placeholder: copy.selectExistingVisitorPlaceholder,
                            manual: copy.enterOwnerManually,
                            search: copy.searchVisitors,
                            loading: copy.loadingVisitors,
                            empty: copy.noVisitors,
                            retry: copy.retryVisitors,
                            pending: isArabic ? "معلق" : "Pending",
                          }}
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <Field label={copy.ownerName} htmlFor={`owner-name-${index}`} required>
                            <Input id={`owner-name-${index}`} value={owner.name} onChange={(event) => updateOwner(index, "name", event.target.value)} placeholder={copy.ownerNamePlaceholder} disabled={pending} className="h-10" />
                          </Field>
                        </div>
                        <Field label={`${copy.contactName} (${copy.optional})`} htmlFor={`owner-contact-${index}`}>
                          <Input id={`owner-contact-${index}`} value={owner.contactName} onChange={(event) => updateOwner(index, "contactName", event.target.value)} disabled={pending} className="h-10" />
                        </Field>
                        <Field label={`${copy.contactPhone} (${copy.optional})`} htmlFor={`owner-phone-${index}`}>
                          <Input id={`owner-phone-${index}`} type="tel" value={owner.contactPhone} onChange={(event) => updateOwner(index, "contactPhone", event.target.value)} disabled={pending} className="h-10" />
                        </Field>
                        <div className="sm:col-span-2">
                          <Field label={`${copy.contactEmail} (${copy.optional})`} htmlFor={`owner-email-${index}`}>
                            <Input id={`owner-email-${index}`} type="email" value={owner.contactEmail} onChange={(event) => updateOwner(index, "contactEmail", event.target.value)} disabled={pending} className="h-10" />
                          </Field>
                        </div>
                        <div className="sm:col-span-2">
                          <OwnerIdCardField
                            id={`owner-id-card-${index}`}
                            file={owner.idCardFile}
                            onChange={(file) => updateOwner(index, "idCardFile", file)}
                            disabled={pending}
                            label={`${copy.idCard} (${copy.optional})`}
                            help={copy.idCardHelp}
                            chooseLabel={copy.chooseIdCard}
                            captureLabel={copy.captureIdCard}
                            replaceLabel={copy.replaceIdCard}
                            removeLabel={copy.removeIdCard}
                            emptyLabel={copy.noIdCard}
                          />
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-6">
                <ProjectFinancialFields
                  idPrefix="new-project-financial"
                  values={financialValues}
                  onChange={(field, value) => {
                    setFinancialValues((current) => ({ ...current, [field]: value }))
                    setError(null)
                  }}
                  includedStructureVisits={includedStructureVisits}
                  onChangeIncludedStructureVisits={(value) => {
                    setIncludedStructureVisits(value)
                    setError(null)
                  }}
                  includedFinishingVisits={includedFinishingVisits}
                  onChangeIncludedFinishingVisits={(value) => {
                    setIncludedFinishingVisits(value)
                    setError(null)
                  }}
                  disabled={pending}
                  isArabic={isArabic}
                />
                <Field label={`${copy.assignContractor} (${copy.optional})`}>
                  <Select
                    value={contractorOrganizationId || "none"}
                    onValueChange={(value) => {
                      const nextId = value === "none" || value == null ? "" : String(value)
                      setContractorOrganizationId(nextId)
                      const selectedOrganization = contractorOrganizations.find((organization) => organization.id === nextId)

                      // Copy the registered contractor profile into the editable project snapshot.
                      // These local values are submitted only to the project record; the global
                      // organization profile is never updated from this wizard.
                      setContractorCompanyName(selectedOrganization?.name ?? "")
                      setContractorRegistrationNumber(selectedOrganization?.registrationNumber ?? "")
                      setContractorAddress(selectedOrganization?.address ?? "")
                      setContractorPostalCode(selectedOrganization?.postalCode ?? "")
                      setContractorPhone(selectedOrganization?.phone ?? "")
                    }}
                    disabled={pending}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue>
                        {(value) => {
                          if (!value || value === "none") return copy.noContractor
                          const organization = contractorOrganizations.find((item) => item.id === String(value))
                          if (!organization) return isArabic ? "مقاول محدد" : "Selected contractor"
                          const isApproved = organization.status === "active"
                          return (
                            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                              <span className="truncate">{organization.name}</span>
                              <span className={cn(
                                "flex shrink-0 items-center gap-1 text-xs font-medium",
                                isApproved ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
                              )}>
                                {isApproved ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                                {isApproved ? copy.approvedOrganization : copy.pendingApproval}
                              </span>
                            </span>
                          )
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{copy.noContractor}</SelectItem>
                      {activeContractorOrganizations.length ? (
                        <SelectGroup>
                          <SelectLabel>{copy.activeOrganizations}</SelectLabel>
                          {activeContractorOrganizations.map((organization) => (
                            <SelectItem key={organization.id} value={organization.id}>
                              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                <span className="truncate">{organization.name}</span>
                                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="size-3.5" />
                                  {copy.approvedOrganization}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                      {pendingContractorOrganizations.length ? (
                        <SelectGroup>
                          <SelectLabel>{copy.pendingOrganizations}</SelectLabel>
                          {pendingContractorOrganizations.map((organization) => (
                            <SelectItem key={organization.id} value={organization.id}>
                              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                <span className="truncate">{organization.name}</span>
                                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="size-3.5" />
                                  {copy.pendingApproval}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                    </SelectContent>
                  </Select>
                </Field>

                {selectedContractorOrganization && selectedContractorOrganization.status !== "active" ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" role="status">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>{copy.pendingContractorWarning}</span>
                  </div>
                ) : null}

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label={`${copy.companyName} (${copy.optional})`} htmlFor="contractor-company-name">
                    <Input id="contractor-company-name" value={contractorCompanyName} onChange={(event) => setContractorCompanyName(event.target.value)} disabled={pending} className="h-10" />
                  </Field>
                  <Field label={`${copy.registration} (${copy.optional})`} htmlFor="contractor-registration">
                    <Input id="contractor-registration" value={contractorRegistrationNumber} onChange={(event) => setContractorRegistrationNumber(event.target.value)} disabled={pending} className="h-10" />
                  </Field>
                  <Field label={`${copy.address} (${copy.optional})`} htmlFor="contractor-address">
                    <Input id="contractor-address" value={contractorAddress} onChange={(event) => setContractorAddress(event.target.value)} disabled={pending} className="h-10" />
                  </Field>
                  <Field label={`${copy.postalCode} (${copy.optional})`} htmlFor="contractor-postal-code">
                    <Input id="contractor-postal-code" value={contractorPostalCode} onChange={(event) => setContractorPostalCode(event.target.value)} disabled={pending} className="h-10" />
                  </Field>
                  <Field label={`${copy.phone} (${copy.optional})`} htmlFor="contractor-phone">
                    <Input id="contractor-phone" type="tel" value={contractorPhone} onChange={(event) => setContractorPhone(event.target.value)} disabled={pending} className="h-10" />
                  </Field>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="space-y-5">
                <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between">
                  <span>{copy.documentsIntro}</span>
                  <span className="shrink-0 rounded-full bg-background/80 px-3 py-1 text-xs font-semibold">{selectedDocumentCount} selected</span>
                </div>
                <ProjectInitialDocumentUploadStep
                  selections={initialDocuments}
                  onChange={setInitialDocuments}
                  disabled={pending}
                  onValidationError={setError}
                />
                {pending ? (
                  <div className="rounded-xl border bg-muted/20 px-4 py-3" role="status" aria-live="polite">
                    <div className={cn("flex items-center justify-between gap-4 text-xs font-medium", selectedUploadCount > 0 && "mb-2")}>
                      <span className="flex min-w-0 items-center gap-2">
                        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                        <span className="truncate">{submissionMessage || uploadingFile || copy.creating}</span>
                      </span>
                      {selectedUploadCount > 0 ? <span className="tabular-nums">{uploadProgress}%</span> : null}
                    </div>
                    {selectedUploadCount > 0 ? (
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div role="alert" className="mt-6 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            {success ? (
              <div role="status" className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" />
                {copy.created}
              </div>
            ) : null}
          </CardContent>

          <CardFooter className="flex flex-col-reverse gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              {step === 1 ? (
                <Button type="button" variant="outline" render={<Link href="/projects" />} disabled={pending}>{copy.cancel}</Button>
              ) : (
                <Button type="button" variant="outline" onClick={goBack} disabled={pending}>
                  <ArrowLeft className="size-4 rtl:rotate-180" />
                  {copy.backStep}
                </Button>
              )}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              {step < 4 ? (
                <Button type="button" className="w-full sm:w-auto" onClick={goNext} disabled={pending}>
                  {copy.next}
                  <ArrowRight className="size-4 rtl:rotate-180" />
                </Button>
              ) : (
                <Button type="button" size="lg" className="w-full sm:w-auto" onClick={submitProject} disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <ClipboardList className="size-4" />}
                  {pending ? (selectedUploadCount > 0 ? copy.uploading : copy.creating) : createdProjectId ? copy.retryUpload : copy.submit}
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}

function humanizeMachineValue(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function userOptionLabel(user: UserOption) {
  return `${user.name}${user.email && user.email !== user.name ? ` — ${user.email}` : ""}`
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ms-1 text-destructive" aria-hidden="true">*</span> : null}
      </Label>
      {children}
    </div>
  )
}

function ProjectGalleryField({
  images,
  onChange,
  disabled,
  label,
  help,
  addLabel,
  coverLabel,
  setCoverLabel,
  removeLabel,
  emptyLabel,
  moveEarlierLabel,
  moveLaterLabel,
}: {
  images: ProjectImageDraft[]
  onChange: (images: ProjectImageDraft[]) => void
  disabled: boolean
  label: string
  help: string
  addLabel: string
  coverLabel: string
  setCoverLabel: string
  removeLabel: string
  emptyLabel: string
  moveEarlierLabel: string
  moveLaterLabel: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  function addFiles(files: FileList | null) {
    if (!files?.length) return
    const accepted: ProjectImageDraft[] = []
    const errors: string[] = []

    for (const file of Array.from(files)) {
      const validationError = validateProjectImageFile(file)
      if (validationError) errors.push(`${file.name}: ${validationError}`)
      else accepted.push({ id: crypto.randomUUID(), file })
    }

    if (accepted.length > 0) onChange([...images, ...accepted])
    setLocalError(errors.length > 0 ? errors.join(" ") : null)
    if (inputRef.current) inputRef.current.value = ""
  }

  function moveImage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= images.length) return
    const next = images.slice()
    const [moved] = next.splice(index, 1)
    next.splice(nextIndex, 0, moved)
    onChange(next)
  }

  function setCover(index: number) {
    if (index === 0) return
    const next = images.slice()
    const [cover] = next.splice(index, 1)
    next.unshift(cover)
    onChange(next)
  }

  return (
    <section className="space-y-3 rounded-2xl border bg-muted/10 p-4 sm:p-5" aria-labelledby="project-images-label">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Label id="project-images-label" htmlFor="project-images-input">{label}</Label>
          <p className="mt-1 text-xs text-muted-foreground">{help}</p>
        </div>
        <input
          ref={inputRef}
          id="project-images-input"
          type="file"
          multiple
          accept={`${PROJECT_IMAGE_ACCEPT},.jpg,.jpeg,.png,.webp`}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => addFiles(event.target.files)}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled}>
          <Images className="size-4" data-icon="inline-start" />
          {addLabel}
        </Button>
      </div>

      {images.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {images.map((image, index) => (
            <ProjectImageDraftCard
              key={image.id}
              image={image}
              index={index}
              count={images.length}
              disabled={disabled}
              coverLabel={coverLabel}
              setCoverLabel={setCoverLabel}
              removeLabel={removeLabel}
              moveEarlierLabel={moveEarlierLabel}
              moveLaterLabel={moveLaterLabel}
              onSetCover={() => setCover(index)}
              onMove={(direction) => moveImage(index, direction)}
              onRemove={() => onChange(images.filter((item) => item.id !== image.id))}
            />
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-background/70 px-4 text-center text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
        >
          <ImageIcon className="size-9" />
          <span className="text-sm font-medium">{emptyLabel}</span>
          <span className="text-xs">{addLabel}</span>
        </button>
      )}

      {localError ? <p role="alert" className="text-xs text-destructive">{localError}</p> : null}
    </section>
  )
}

function ProjectImageDraftCard({
  image,
  index,
  count,
  disabled,
  coverLabel,
  setCoverLabel,
  removeLabel,
  moveEarlierLabel,
  moveLaterLabel,
  onSetCover,
  onMove,
  onRemove,
}: {
  image: ProjectImageDraft
  index: number
  count: number
  disabled: boolean
  coverLabel: string
  setCoverLabel: string
  removeLabel: string
  moveEarlierLabel: string
  moveLaterLabel: string
  onSetCover: () => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(image.file)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [image.file])

  return (
    <article className="group overflow-hidden rounded-xl border bg-background shadow-xs">
      <div className="relative aspect-[4/3] bg-muted/30">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={image.file.name} className="size-full object-cover" />
        ) : null}
        <span className="absolute start-2 top-2 rounded-full bg-background/90 px-2 py-1 text-[11px] font-semibold shadow-sm backdrop-blur">
          {index + 1}
        </span>
        {index === 0 ? (
          <span className="absolute end-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm">
            <Star className="size-3 fill-current" />
            {coverLabel}
          </span>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{image.file.name}</p>
          <p className="text-xs text-muted-foreground">{(image.file.size / (1024 * 1024)).toFixed(1)} MB</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="icon-xs" aria-label={moveEarlierLabel} title={moveEarlierLabel} onClick={() => onMove(-1)} disabled={disabled || index === 0}>
              <ChevronLeft className="size-3.5 rtl:rotate-180" />
            </Button>
            <Button type="button" variant="outline" size="icon-xs" aria-label={moveLaterLabel} title={moveLaterLabel} onClick={() => onMove(1)} disabled={disabled || index === count - 1}>
              <ChevronRight className="size-3.5 rtl:rotate-180" />
            </Button>
          </div>
          <div className="flex gap-1">
            {index !== 0 ? (
              <Button type="button" variant="ghost" size="xs" onClick={onSetCover} disabled={disabled}>
                <Star className="size-3.5" />
                {setCoverLabel}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="icon-xs" aria-label={removeLabel} title={removeLabel} onClick={onRemove} disabled={disabled} className="text-destructive hover:text-destructive">
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}

function OwnerIdCardField({
  id,
  file,
  onChange,
  disabled,
  label,
  help,
  chooseLabel,
  captureLabel,
  replaceLabel,
  removeLabel,
  emptyLabel,
}: {
  id: string
  file: File | null
  onChange: (file: File | null) => void
  disabled: boolean
  label: string
  help: string
  chooseLabel: string
  captureLabel: string
  replaceLabel: string
  removeLabel: string
  emptyLabel: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const captureInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  function selectFile(nextFile: File | null) {
    if (!nextFile) return
    const validationError = validateOwnerIdCardFile(nextFile)
    if (validationError) {
      setLocalError(validationError)
      if (inputRef.current) inputRef.current.value = ""
      if (captureInputRef.current) captureInputRef.current.value = ""
      return
    }
    setLocalError(null)
    onChange(nextFile)
    if (inputRef.current) inputRef.current.value = ""
    if (captureInputRef.current) captureInputRef.current.value = ""
  }

  function removeFile() {
    setLocalError(null)
    onChange(null)
    if (inputRef.current) inputRef.current.value = ""
    if (captureInputRef.current) captureInputRef.current.value = ""
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={OWNER_ID_CARD_ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />
      <input
        ref={captureInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        aria-label={captureLabel}
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />
      <div className="rounded-xl border border-dashed bg-background p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
            {previewUrl ? (
              // This preview is created from the local file and is never uploaded before final submission.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={file?.name || label} className="size-full object-cover" />
            ) : file ? (
              file.type === "application/pdf" ? <FileText className="size-7 text-muted-foreground" /> : <ImageIcon className="size-7 text-muted-foreground" />
            ) : (
              <Camera className="size-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-sm font-medium", !file && "text-muted-foreground")}>
              {file?.name || emptyLabel}
            </p>
            {file ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(file.size >= 1024 * 1024 ? 1 : 2)} MB
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
              >
                <FileUp className="size-4" />
                {file ? replaceLabel : chooseLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => captureInputRef.current?.click()}
                disabled={disabled}
              >
                <Camera className="size-4" />
                {captureLabel}
              </Button>
              {file ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeFile}
                  disabled={disabled}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  {removeLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
      {localError ? <p role="alert" className="text-xs text-destructive">{localError}</p> : null}
    </div>
  )
}
