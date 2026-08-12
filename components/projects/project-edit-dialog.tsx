"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  updateProject,
  type OwnerIdCardUploadInput,
} from "@/lib/actions/projects"
import { saveInitialDocumentAction } from "@/lib/actions/initial-documents"
import { useI18n } from "@/lib/i18n"
import { type ProjectLocationValue } from "@/lib/locations/types"
import { DOCUMENT_ASSET_BUCKET, sanitizeStorageFileName } from "@/lib/documents/simple-upload"
import {
  sanitizeInitialDocumentFileName,
  validateInitialDocumentFile,
} from "@/lib/initial-documents/config"
import { uploadDocumentAsset, uploadStorageAsset } from "@/lib/documents/storage-upload"
import { createClient } from "@/lib/supabase/client"
import {
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
  SUPERVISION_TYPES,
  isProjectPriorityValue,
  isSupervisionTypeValue,
  supervisionTypeLabel,
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
import { calculateProjectOutstandingAmount, validateProjectFinancialForm } from "@/lib/projects/project-financial"
import type { ProjectSupervisorCandidate } from "@/lib/projects/supervisor-candidates"
import type { ProjectOwnerViewerOption } from "@/lib/actions/project-owner-viewers"
import {
  normalizeProjectStatus,
  PROJECT_STATUS_OPTIONS,
  type ProjectStatusValue,
} from "@/lib/projects/project-status"
import { cn } from "@/lib/utils"

export { normalizeProjectStatus, PROJECT_STATUS_OPTIONS }
export type { ProjectStatusValue }

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

export type ProjectEditData = {
  id: string
  name: string
  code: string
  address: string
  areaDistrict?: string | null
  projectTypeLabel: string
  projectTypeValue?: ProjectTypeValue | null
  supervisionType?: string | null
  supervisionTypeOther?: string | null
  status: string
  plotNo?: string | null
  phase?: string | null
  startDate?: string | null
  supervisionStartDate?: string | null
  priority?: string | null
  includedStructureVisits?: number | null
  includedFinishingVisits?: number | null
  structureSupervisionFee?: number | null
  finishingSupervisionFee?: number | null
  receivedAmount?: number | null
  outstandingAmount?: number | null
  nextPaymentAmount?: number | null
  nextPaymentDueDate?: string | null
  invoiceReferencePaymentNote?: string | null
  initialRemarks?: string | null
  description?: string
  latitude?: number | null
  longitude?: number | null
  assignedUserId?: string | null
  assignedSupervisorId?: string | null
  owners?: Array<{
    name: string
    contactName?: string | null
    contactEmail?: string | null
    contactPhone?: string | null
  }>
  contractorOrganizationId?: string | null
  contractorCompanyName?: string | null
  contractorRegistrationNumber?: string | null
  contractorAddress?: string | null
  contractorPostalCode?: string | null
  contractorPhone?: string | null
}

export function ProjectEditDialog({
  project,
  locale,
  supervisorOptions = [],
  onClose,
  onSaved,
}: {
  project: ProjectEditData
  locale: string
  supervisorOptions?: ProjectSupervisorCandidate[]
  onClose: () => void
  onSaved: (project: ProjectEditData & { supervisionTypeLabel: string }) => void
}) {
  const isArabic = locale === "ar"
  const [step, setStep] = useState(1)
  const [name, setName] = useState(project.name)
  const [code, setCode] = useState(project.code === "—" || project.code === "Not set" ? "" : project.code)
  const [projectType, setProjectType] = useState<ProjectTypeValue | "">(project.projectTypeValue ?? "")
  const [supervisionType, setSupervisionType] = useState(project.supervisionType ?? "")
  const [supervisionTypeOther, setSupervisionTypeOther] = useState(project.supervisionTypeOther ?? "")
  const [status, setStatus] = useState<ProjectStatusValue>(normalizeProjectStatus(project.status))
  const [plotNo, setPlotNo] = useState(project.plotNo ?? "")
  const [phase, setPhase] = useState(project.phase ?? "")
  const [projectStartDate, setProjectStartDate] = useState(project.startDate ?? "")
  const [supervisionStartDate, setSupervisionStartDate] = useState(project.supervisionStartDate ?? "")
  const [priority, setPriority] = useState<ProjectPriorityValue | "">(
    isProjectPriorityValue(project.priority) ? project.priority : "medium",
  )
  const [includedStructureVisits, setIncludedStructureVisits] = useState(
    project.includedStructureVisits == null ? "" : String(project.includedStructureVisits),
  )
  const [includedFinishingVisits, setIncludedFinishingVisits] = useState(
    project.includedFinishingVisits == null ? "" : String(project.includedFinishingVisits),
  )
  const [areaDistrict, setAreaDistrict] = useState(project.areaDistrict ?? "")
  const [description, setDescription] = useState(project.description ?? "")
  const [assignedUserId, setAssignedUserId] = useState(project.assignedUserId ?? "")
  const [assignedSupervisorId, setAssignedSupervisorId] = useState(project.assignedSupervisorId ?? "")
  const [projectImages, setProjectImages] = useState<ProjectImageDraft[]>([])
  const [contractorOrganizationId, setContractorOrganizationId] = useState(project.contractorOrganizationId ?? "")
  const [contractorCompanyName, setContractorCompanyName] = useState(project.contractorCompanyName ?? "")
  const [contractorRegistrationNumber, setContractorRegistrationNumber] = useState(project.contractorRegistrationNumber ?? "")
  const [contractorAddress, setContractorAddress] = useState(project.contractorAddress ?? "")
  const [contractorPostalCode, setContractorPostalCode] = useState(project.contractorPostalCode ?? "")
  const [contractorPhone, setContractorPhone] = useState(project.contractorPhone ?? "")

  const [financialValues, setFinancialValues] = useState<ProjectFinancialFormValues>({
    structureSupervisionFee: project.structureSupervisionFee == null ? "" : String(project.structureSupervisionFee),
    finishingSupervisionFee: project.finishingSupervisionFee == null ? "" : String(project.finishingSupervisionFee),
    receivedAmount: project.receivedAmount == null ? "" : String(project.receivedAmount),
    nextPaymentAmount: project.nextPaymentAmount == null ? "" : String(project.nextPaymentAmount),
    nextPaymentDueDate: project.nextPaymentDueDate ?? "",
    invoiceReferencePaymentNote: project.invoiceReferencePaymentNote ?? "",
    initialRemarks: project.initialRemarks ?? "",
  })

  const [owners, setOwners] = useState<OwnerDetails[]>(() => {
    if (project.owners && project.owners.length > 0) {
      return project.owners.map((o) => ({
        name: o.name || "",
        contactName: o.contactName || "",
        contactEmail: o.contactEmail || "",
        contactPhone: o.contactPhone || "",
        idCardFile: null,
      }))
    }
    return [emptyOwner()]
  })
  const [selectedOwnerViewers, setSelectedOwnerViewers] = useState<(ProjectOwnerViewerOption | null)[]>(() =>
    Array.from({ length: Math.max(1, project.owners?.length || 1) }, () => null),
  )

  const [initialDocuments, setInitialDocuments] = useState<InitialProjectDocumentSelection[]>([])
  const [location, setLocation] = useState<ProjectLocationValue>({
    address: project.address === "—" || project.address === "Location not set" ? "" : project.address,
    latitude: project.latitude ?? null,
    longitude: project.longitude ?? null,
    verified: project.latitude != null && project.longitude != null,
    source: project.latitude != null && project.longitude != null ? "map" : "manual",
  })

  const [contractorOrganizations, setContractorOrganizations] = useState<ContractorOrganization[]>([])
  const [users, setUsers] = useState<UserOption[]>([])

  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadingFile, setUploadingFile] = useState<string | null>(null)
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null)
  const [removedDocumentIds, setRemovedDocumentIds] = useState<string[]>([])

  const [supervisingOrgId, setSupervisingOrgId] = useState<string>("")
  const hasInitializedRef = useRef(false)
  const hasInitializedDocsRef = useRef(false)

  const projectStartDateInputRef = useRef<HTMLInputElement>(null)
  const supervisionStartDateInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    async function loadData() {
      try {
        const [{ data: orgs }, { data: profiles }, { data: currentProjectRow }, { data: ownerRows }, { data: docRows }] = await Promise.all([
          supabase
            .from("organizations")
            .select("id, name, status, organization_category, registration_number, address, postal_code, phone")
            .eq("type", "external")
            .neq("status", "suspended"),
          supabase
            .from("profiles")
            .select("id, full_name, email"),
          supabase
            .from("projects")
            .select("supervising_organization_id, assigned_user_id, assigned_supervisor_id, phase, start_date, contractor_organization_id, contractor_registration_number, contractor_address, contractor_postal_code, contractor_phone, contractor")
            .eq("id", project.id)
            .maybeSingle(),
          supabase
            .from("project_owners")
            .select("id, owner_order, name, contact_name, contact_email, contact_phone, viewer_user_id, viewer_invitation_id")
            .eq("project_id", project.id)
            .order("owner_order", { ascending: true }),
          supabase
            .from("initial_docs")
            .select("id, category, file_name, original_file_name, file_path, file_size")
            .eq("project_id", project.id)
            .order("created_at", { ascending: true }),
        ])

        if (!active) return

        if (orgs) {
          setContractorOrganizations(
            orgs.map((o) => ({
              id: o.id,
              name: o.name,
              status: o.status === "active" ? "active" : o.status === "invited" ? "invited" : "pending",
              registrationNumber: o.registration_number?.trim() || "",
              address: o.address?.trim() || "",
              postalCode: o.postal_code?.trim() || "",
              phone: o.phone?.trim() || "",
            })),
          )
        }

        if (profiles) {
          setUsers(
            profiles.map((p) => ({
              id: p.id,
              name: p.full_name?.trim() || p.email || "User",
              email: p.email || "",
              organizationRole: "member",
            })),
          )
        }

        if (currentProjectRow) {
          if (currentProjectRow.supervising_organization_id) {
            setSupervisingOrgId(currentProjectRow.supervising_organization_id)
          }
          if (currentProjectRow.assigned_supervisor_id && !assignedSupervisorId) {
            setAssignedSupervisorId(currentProjectRow.assigned_supervisor_id)
          }
          if (currentProjectRow.assigned_user_id && !assignedUserId) {
            setAssignedUserId(currentProjectRow.assigned_user_id)
          }
          if (currentProjectRow.phase && !phase) {
            setPhase(currentProjectRow.phase)
          }
          if (currentProjectRow.start_date && !projectStartDate) {
            setProjectStartDate(currentProjectRow.start_date)
          }
          if (currentProjectRow.contractor_organization_id && !contractorOrganizationId) {
            setContractorOrganizationId(currentProjectRow.contractor_organization_id)
          }
          if (currentProjectRow.contractor && !contractorCompanyName) {
            setContractorCompanyName(currentProjectRow.contractor)
          }
          if (currentProjectRow.contractor_registration_number && !contractorRegistrationNumber) {
            setContractorRegistrationNumber(currentProjectRow.contractor_registration_number)
          }
          if (currentProjectRow.contractor_address && !contractorAddress) {
            setContractorAddress(currentProjectRow.contractor_address)
          }
          if (currentProjectRow.contractor_postal_code && !contractorPostalCode) {
            setContractorPostalCode(currentProjectRow.contractor_postal_code)
          }
          if (currentProjectRow.contractor_phone && !contractorPhone) {
            setContractorPhone(currentProjectRow.contractor_phone)
          }
        }

        if (ownerRows && ownerRows.length > 0 && !hasInitializedRef.current) {
          hasInitializedRef.current = true
          const loadedOwners: OwnerDetails[] = ownerRows.map((row) => ({
            name: row.name || "",
            contactName: row.contact_name || "",
            contactEmail: row.contact_email || "",
            contactPhone: row.contact_phone || "",
            idCardFile: null,
          }))
          setOwners(loadedOwners)

          const loadedViewers: (ProjectOwnerViewerOption | null)[] = ownerRows.map((row) => {
            if (row.viewer_user_id) {
              const prof = profiles?.find((p) => p.id === row.viewer_user_id)
              return {
                id: row.viewer_user_id,
                source: "registered" as const,
                name: prof?.full_name?.trim() || prof?.email || row.name,
                ownerName: row.name,
                contactName: row.contact_name || "",
                email: row.contact_email || prof?.email || "",
                phone: row.contact_phone || "",
              }
            }
            if (row.viewer_invitation_id) {
              return {
                id: row.viewer_invitation_id,
                source: "pending" as const,
                name: row.contact_email || row.name,
                ownerName: row.name,
                contactName: row.contact_name || "",
                email: row.contact_email || "",
                phone: row.contact_phone || "",
              }
            }
            return null
          })
          setSelectedOwnerViewers(loadedViewers)
        }

        if (docRows && docRows.length > 0 && !hasInitializedDocsRef.current) {
          hasInitializedDocsRef.current = true
          const loadedDocs: InitialProjectDocumentSelection[] = docRows.map((doc) => {
            const uploadCat =
              getInitialDocumentUploadCategoryFromPath(doc.file_path)?.value ||
              (doc.category === "approved_drawings"
                ? "drawing"
                : doc.category === "consultant_agreement"
                ? "supervision_agreement"
                : doc.category === "contractor_agreement"
                ? "contract_agreement"
                : doc.category === "permits_approvals"
                ? "approval_document"
                : doc.category === "initial_site_reports"
                ? "test_reports"
                : "additional_documents")

            return {
              id: doc.id,
              category: getInitialDocumentCategory(doc.category).value,
              uploadCategory: uploadCat as InitialDocumentUploadCategory,
              fileName: doc.original_file_name || doc.file_name,
              fileSize: Number(doc.file_size) || 0,
              filePath: doc.file_path,
              isExisting: true,
            }
          })
          setInitialDocuments(loadedDocs)
        }
      } catch {
        // Safe fallback for background lookups
      }
    }
    loadData()
    return () => {
      active = false
    }
  }, [project.id])

  const supervisorsList: UserOption[] = useMemo(() => {
    if (supervisorOptions.length > 0) {
      return supervisorOptions.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        organizationRole: s.organizationRole,
      }))
    }
    return users
  }, [supervisorOptions, users])

  const activeContractorOrganizations = useMemo(
    () => contractorOrganizations.filter((o) => o.status === "active"),
    [contractorOrganizations],
  )
  const pendingContractorOrganizations = useMemo(
    () => contractorOrganizations.filter((o) => o.status !== "active"),
    [contractorOrganizations],
  )

  const selectedContractorOrganization = useMemo(
    () => contractorOrganizations.find((o) => o.id === contractorOrganizationId) ?? null,
    [contractorOrganizationId, contractorOrganizations],
  )

  const copy = isArabic
    ? {
        title: "تعديل المشروع",
        subtitle: "تعديل تفاصيل المشروع من خلال الخطوات الأربع.",
        steps: ["تفاصيل المشروع", "بيانات المالك / العميل", "المقاول", "المستندات"],
        stepDescriptions: [
          "تعديل معلومات المشروع وموقعه والمشرف والمالية.",
          "تعديل بيانات المالك أو العميل ومعلومات الاتصال.",
          "تعديل المقاول وبيانات الشركة.",
          "تعديل المستندات الأولية للمشروع.",
        ],
        name: "اسم المشروع",
        namePlaceholder: "مثال: برج المرسى السكني",
        code: "رقم / رمز المشروع",
        codePlaceholder: "مثال: PRJ-009",
        status: "حالة المشروع",
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
        requiredSupervisionStartDate: "تاريخ بدء الإشراف مطلوب.",
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
        idCardHelp: "JPG أو PNG أو WebP أو PDF، بحد أقصى 10 ميجابايت.",
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
        saveChanges: "حفظ التعديلات",
        saving: "جارٍ حفظ التعديلات…",
        uploading: "جارٍ رفع الملفات…",
        requiredProject: "أكمل جميع حقول تفاصيل المشروع المطلوبة، بما فيها الاسم والنوع والإشراف والموقع والمشرف والمستخدم.",
        requiredOwners: "أدخل اسمًا صحيحًا لكل مالك.",
        invalidOwnerEmail: "أدخل بريدًا إلكترونيًا صحيحًا لكل مالك.",
      }
    : {
        title: "Edit Project",
        subtitle: "Update project details using the four-step wizard.",
        steps: ["Project Details", "Owner / Client Information", "Contractor", "Documents"],
        stepDescriptions: [
          "Edit project details, location, supervisor assignments, and financials.",
          "Edit owner or client details and contact information.",
          "Edit contractor assignment and company information.",
          "Edit initial project documents.",
        ],
        name: "Project Name",
        namePlaceholder: "e.g. Marina West Residences",
        code: "Project Number / Code",
        codePlaceholder: "e.g. PRJ-009",
        status: "Project Status",
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
        requiredSupervisionStartDate: "Supervision Start Date is required.",
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
        idCardHelp: "JPG, PNG, WebP, or PDF up to 10 MB.",
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
        saveChanges: "Save Changes",
        saving: "Saving changes…",
        uploading: "Uploading files…",
        requiredProject: "Complete all required project details, including name, type, supervision, location, supervisor, and user.",
        requiredOwners: "Enter a valid name for every owner.",
        invalidOwnerEmail: "Enter a valid email address for every owner.",
      }

  const stepIcons = [MapPin, UsersRound, Building2, FileUp]
  const CurrentIcon = stepIcons[step - 1]

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

  function updateOwner<Field extends keyof OwnerDetails>(index: number, field: Field, value: OwnerDetails[Field]) {
    setOwners((current) => current.map((owner, i) => (i === index ? { ...owner, [field]: value } : owner)))
    setError(null)
  }

  function selectOwnerViewer(index: number, viewer: ProjectOwnerViewerOption) {
    setSelectedOwnerViewers((current) => current.map((item, i) => (i === index ? viewer : item)))
    setOwners((current) =>
      current.map((owner, i) =>
        i === index
          ? {
              ...owner,
              name: viewer.ownerName,
              contactName: viewer.contactName,
              contactEmail: viewer.email,
              contactPhone: viewer.phone,
            }
          : owner,
      ),
    )
    setError(null)
  }

  function useManualOwnerEntry(index: number) {
    setSelectedOwnerViewers((current) => current.map((item, i) => (i === index ? null : item)))
    setError(null)
  }

  function validateStep(targetStep: number): string | null {
    if (targetStep === 1) {
      for (const image of projectImages) {
        const err = validateProjectImageFile(image.file)
        if (err) return err
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
      if (!supervisionStartDate) return copy.requiredSupervisionStartDate
      if (supervisionType === "other" && !supervisionTypeOther.trim()) {
        return copy.requiredSupervisionTypeOther
      }
      if (!isOptionalWholeNumber(includedStructureVisits) || !isOptionalWholeNumber(includedFinishingVisits)) {
        return copy.invalidVisitCounts
      }
      const financialValidation = validateProjectFinancialForm(financialValues)
      if (!financialValidation.ok) return copy.invalidFinancialAmounts
      return null
    }

    if (targetStep === 2) {
      if (owners.some((o) => o.name.trim().length < 2)) return copy.requiredOwners
      const invalidEmail = owners.some((o) => {
        const email = o.contactEmail.trim()
        return email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      })
      if (invalidEmail) return copy.invalidOwnerEmail
      for (const owner of owners) {
        if (!owner.idCardFile) continue
        const err = validateOwnerIdCardFile(owner.idCardFile)
        if (err) return err
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
        if (selection.file && !selection.isExisting) {
          const err = validateInitialDocumentFile(selection.file)
          if (err) return err
        }
      }
    }
    return null
  }

  function goNext() {
    const err = validateStep(step)
    if (err) {
      setError(err)
      return
    }
    setError(null)
    setStep((current) => Math.min(4, current + 1))
  }

  function goBack() {
    setError(null)
    setStep((current) => Math.max(1, current - 1))
  }

  async function saveProject() {
    for (let s = 1; s <= 4; s++) {
      const err = validateStep(s)
      if (err) {
        setStep(s)
        setError(err)
        return
      }
    }

    setError(null)
    setPending(true)
    setSubmissionMessage(copy.saving)

    try {
      const normalizedSupervisionTypeOther = supervisionTypeOther.trim()
      const validSupervisionType = isSupervisionTypeValue(supervisionType) ? supervisionType : undefined
      const submittedSupervisionStartDate = supervisionStartDateInputRef.current?.value ?? supervisionStartDate

      const result = await updateProject({
        projectId: project.id,
        name: name.trim(),
        code: code.trim(),
        status,
        projectType: projectType || undefined,
        supervisionType: validSupervisionType,
        supervisionTypeOther: validSupervisionType
          ? validSupervisionType === "other"
            ? normalizedSupervisionTypeOther
            : null
          : undefined,
        plotNo: plotNo.trim() || undefined,
        phase: phase.trim() || undefined,
        startDate: projectStartDate || undefined,
        supervisionStartDate: submittedSupervisionStartDate,
        priority: priority || undefined,
        includedStructureVisits: optionalWholeNumber(includedStructureVisits),
        includedFinishingVisits: optionalWholeNumber(includedFinishingVisits),
        structureSupervisionFee: financialValues.structureSupervisionFee,
        finishingSupervisionFee: financialValues.finishingSupervisionFee,
        receivedAmount: financialValues.receivedAmount,
        nextPaymentAmount: financialValues.nextPaymentAmount,
        nextPaymentDueDate: financialValues.nextPaymentDueDate,
        invoiceReferencePaymentNote: financialValues.invoiceReferencePaymentNote,
        initialRemarks: financialValues.initialRemarks,
        description: description.trim(),
        region: areaDistrict.trim(),
        location: location.address.trim(),
        latitude: location.latitude,
        longitude: location.longitude,
        assignedUserId: assignedUserId || null,
        assignedSupervisorId: assignedSupervisorId || null,
        contractor: {
          organizationId: contractorOrganizationId || null,
          companyName: contractorCompanyName.trim(),
          registrationNumber: contractorRegistrationNumber.trim(),
          address: contractorAddress.trim(),
          postalCode: contractorPostalCode.trim(),
          phone: contractorPhone.trim(),
        },
        owners: owners.map((o, idx) => {
          const viewer = selectedOwnerViewers[idx]
          return {
            name: o.name.trim(),
            contactName: o.contactName.trim() || null,
            contactEmail: o.contactEmail.trim().toLowerCase() || null,
            contactPhone: o.contactPhone.trim() || null,
            viewerUserId: viewer?.source === "registered" ? viewer.id : null,
            viewerInvitationId: viewer?.source === "pending" ? viewer.id : null,
          }
        }),
      })

      if (!result.ok) {
        setError(result.error)
        setPending(false)
        return
      }

      if (projectImages.length > 0) {
        setSubmissionMessage(copy.uploading)
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const records: Array<{ storagePath: string; originalFilename: string; mimeType: string; sizeBytes: number; orderIndex: number }> = []
          for (const [index, img] of projectImages.entries()) {
            const storagePath = `${project.id}/${session.user.id}/gallery/${img.id}-${sanitizeStorageFileName(img.file.name)}`
            await uploadStorageAsset(img.file, storagePath, session.access_token, undefined, PROJECT_IMAGE_BUCKET, true)
            records.push({
              storagePath,
              originalFilename: img.file.name,
              mimeType: img.file.type,
              sizeBytes: img.file.size,
              orderIndex: index,
            })
          }
          await attachProjectGalleryImages({ projectId: project.id, images: records })
        }
      }

      const supabase = createClient()
      if (removedDocumentIds.length > 0) {
        await supabase.from("initial_docs").delete().in("id", removedDocumentIds)
      }

      const newInitialDocSelections = initialDocuments.filter((sel) => sel.file && !sel.isExisting)
      if (newInitialDocSelections.length > 0) {
        setSubmissionMessage(copy.uploading)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          for (const selection of newInitialDocSelections) {
            if (!selection.file) continue
            const storagePath = `${project.id}/${session.user.id}/${selection.id}/category-${selection.uploadCategory}/${sanitizeInitialDocumentFileName(selection.file.name)}`
            await uploadStorageAsset(selection.file, storagePath, session.access_token)
            await saveInitialDocumentAction({
              projectId: project.id,
              category: selection.category,
              file: {
                name: selection.file.name,
                size: selection.file.size,
                type: selection.file.type,
                storagePath,
              },
            })
          }
        }
      }

      const projectTypeOption = PROJECT_TYPES.find((opt) => opt.value === projectType)
      const nextSupervisionType = validSupervisionType ?? project.supervisionType ?? null
      const nextSupervisionTypeOther = validSupervisionType
        ? validSupervisionType === "other"
          ? normalizedSupervisionTypeOther
          : null
        : project.supervisionTypeOther ?? null

      onSaved({
        ...project,
        name: name.trim(),
        code: code.trim() || "—",
        projectTypeLabel: projectTypeOption?.label ?? project.projectTypeLabel,
        projectTypeValue: projectType || project.projectTypeValue || null,
        supervisionType: nextSupervisionType,
        supervisionTypeOther: nextSupervisionTypeOther,
        supervisionTypeLabel: supervisionTypeLabel(nextSupervisionType, nextSupervisionTypeOther),
        status,
        plotNo: plotNo.trim() || null,
        phase: phase.trim() || null,
        startDate: projectStartDate || null,
        supervisionStartDate: (result.data?.supervisionStartDate ?? submittedSupervisionStartDate) || null,
        priority: priority || project.priority || null,
        includedStructureVisits: optionalWholeNumber(includedStructureVisits),
        includedFinishingVisits: optionalWholeNumber(includedFinishingVisits),
        structureSupervisionFee: financialValues.structureSupervisionFee === "" ? null : Number(financialValues.structureSupervisionFee),
        finishingSupervisionFee: financialValues.finishingSupervisionFee === "" ? null : Number(financialValues.finishingSupervisionFee),
        receivedAmount: financialValues.receivedAmount === "" ? null : Number(financialValues.receivedAmount),
        outstandingAmount:
          financialValues.structureSupervisionFee !== "" || financialValues.finishingSupervisionFee !== "" || financialValues.receivedAmount !== ""
            ? calculateProjectOutstandingAmount(
                financialValues.structureSupervisionFee,
                financialValues.finishingSupervisionFee,
                financialValues.receivedAmount,
              )
            : null,
        nextPaymentAmount: financialValues.nextPaymentAmount === "" ? null : Number(financialValues.nextPaymentAmount),
        nextPaymentDueDate: financialValues.nextPaymentDueDate || null,
        invoiceReferencePaymentNote: financialValues.invoiceReferencePaymentNote.trim() || null,
        initialRemarks: financialValues.initialRemarks.trim() || null,
        description: description.trim(),
        address: location.address.trim() || "—",
        areaDistrict: areaDistrict.trim() || null,
        latitude: location.latitude,
        longitude: location.longitude,
        assignedUserId: assignedUserId || null,
        assignedSupervisorId: assignedSupervisorId || null,
        owners: owners.map((o) => ({
          name: o.name.trim(),
          contactName: o.contactName.trim() || null,
          contactEmail: o.contactEmail.trim() || null,
          contactPhone: o.contactPhone.trim() || null,
        })),
        contractorOrganizationId: contractorOrganizationId || null,
        contractorCompanyName: contractorCompanyName.trim() || null,
        contractorRegistrationNumber: contractorRegistrationNumber.trim() || null,
        contractorAddress: contractorAddress.trim() || null,
        contractorPostalCode: contractorPostalCode.trim() || null,
        contractorPhone: contractorPhone.trim() || null,
      })
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update project.")
    } finally {
      setPending(false)
      setUploadingFile(null)
      setSubmissionMessage(null)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl" showCloseButton={!pending}>
        <DialogHeader className="pb-2">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.subtitle}</DialogDescription>
        </DialogHeader>

        <nav aria-label={isArabic ? "خطوات تعديل المشروع" : "Project edit steps"} className="rounded-2xl border bg-card p-3 sm:p-4">
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
                  <button
                    type="button"
                    onClick={() => {
                      if (!pending) {
                        setError(null)
                        setStep(number)
                      }
                    }}
                    className={cn(
                      "relative z-10 flex w-full flex-col items-center gap-1.5 text-center transition-opacity",
                      "cursor-pointer hover:opacity-80",
                    )}
                  >
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
                    <span className={cn("line-clamp-2 text-[11px] font-medium text-muted-foreground sm:text-xs", current && "text-foreground")}>
                      {label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <div className="mb-5 border-b pb-4">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CurrentIcon className="size-4" />
              </span>
              <span>
                {step}. {copy.steps[step - 1]}
              </span>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{copy.stepDescriptions[step - 1]}</p>
          </div>

          {step === 1 ? (
            <div className="space-y-6">
              <div className="rounded-2xl border bg-muted/15 p-4 sm:p-5">
                <ProjectLocationField
                  id={`edit-project-location-${project.id}`}
                  value={location}
                  onChange={setLocation}
                  areaField={{
                    value: areaDistrict,
                    onChange: setAreaDistrict,
                    label: copy.areaDistrict,
                    placeholder: copy.areaDistrictPlaceholder,
                  }}
                  contentAfterAreaField={
                    <Field label={`${copy.phase} (${copy.optional})`} htmlFor="edit-project-phase">
                      <Input
                        id="edit-project-phase"
                        value={phase}
                        onChange={(e) => setPhase(e.target.value)}
                        placeholder={copy.phasePlaceholder}
                        disabled={pending}
                        className="h-10"
                      />
                    </Field>
                  }
                  disabled={pending}
                >
                  <div className="flex h-full min-h-0 flex-col gap-4">
                    <Field label={copy.name} htmlFor={`edit-project-name-${project.id}`} required>
                      <Input
                        id={`edit-project-name-${project.id}`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={copy.namePlaceholder}
                        disabled={pending}
                        className="h-10"
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={copy.code} htmlFor={`edit-project-code-${project.id}`} required>
                        <Input
                          id={`edit-project-code-${project.id}`}
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          placeholder={copy.codePlaceholder}
                          disabled={pending}
                          className="h-10"
                        />
                      </Field>
                      <Field label={copy.status} required>
                        <Select
                          value={status}
                          onValueChange={(val) => val && setStatus(val as ProjectStatusValue)}
                          disabled={pending}
                        >
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROJECT_STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {isArabic ? opt.labelAr : opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={`${copy.plotNo} (${copy.optional})`} htmlFor={`edit-project-plot-${project.id}`}>
                        <Input
                          id={`edit-project-plot-${project.id}`}
                          value={plotNo}
                          onChange={(e) => setPlotNo(e.target.value)}
                          placeholder={copy.plotNoPlaceholder}
                          disabled={pending}
                          className="h-10"
                        />
                      </Field>
                      <Field label={copy.priority}>
                        <Select
                          value={priority}
                          onValueChange={(val) => val && setPriority(val as ProjectPriorityValue)}
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
                        <Select
                          value={projectType || null}
                          onValueChange={(val) => setProjectType((val as ProjectTypeValue | null) ?? "")}
                          disabled={pending}
                        >
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue placeholder={copy.projectTypePlaceholder}>
                              {(value) => {
                                if (!value) return copy.projectTypePlaceholder
                                const option = PROJECT_TYPES.find((item) => item.value === String(value))
                                return option ? (isArabic ? option.labelAr : option.label) : String(value)
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {PROJECT_TYPES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {isArabic ? option.labelAr : option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={copy.supervisionType} required>
                        <Select
                          value={supervisionType || null}
                          onValueChange={(val) => {
                            const next = (val as SupervisionTypeValue | null) ?? ""
                            setSupervisionType(next)
                            if (next !== "other") setSupervisionTypeOther("")
                            setError(null)
                          }}
                          disabled={pending}
                        >
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue placeholder={copy.supervisionTypePlaceholder}>
                              {(value) => {
                                if (!value) return copy.supervisionTypePlaceholder
                                const option = SUPERVISION_TYPES.find((item) => item.value === String(value))
                                return option ? (isArabic ? option.labelAr : option.label) : String(value)
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {SUPERVISION_TYPES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {isArabic ? option.labelAr : option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    {supervisionType === "other" ? (
                      <Field label={copy.supervisionTypeOther} htmlFor="edit-project-supervision-other" required>
                        <Input
                          id="edit-project-supervision-other"
                          value={supervisionTypeOther}
                          onChange={(e) => {
                            setSupervisionTypeOther(e.target.value)
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
                      <Field label={`${copy.projectStartDate} (${copy.optional})`} htmlFor="edit-project-start-date">
                        <div className="relative">
                          <Input
                            ref={projectStartDateInputRef}
                            id="edit-project-start-date"
                            type="date"
                            value={projectStartDate}
                            onChange={(e) => setProjectStartDate(e.target.value)}
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
                      <Field label={copy.supervisionStartDate} htmlFor="edit-project-supervision-start-date" required>
                        <div className="relative">
                          <Input
                            ref={supervisionStartDateInputRef}
                            id="edit-project-supervision-start-date"
                            type="date"
                            value={supervisionStartDate}
                            onChange={(e) => setSupervisionStartDate(e.target.value)}
                            required
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
                      <Label htmlFor="edit-project-description">
                        {copy.description} ({copy.optional})
                      </Label>
                      <textarea
                        id="edit-project-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
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
                    onValueChange={(val) => setAssignedUserId(val == null ? "" : String(val))}
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
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                          {u.email && u.email !== u.name ? ` — ${u.email}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={copy.assignSupervisor} required>
                  <Select
                    value={assignedSupervisorId || null}
                    onValueChange={(val) => setAssignedSupervisorId(val == null ? "" : String(val))}
                    disabled={pending}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder={copy.assignSupervisorPlaceholder}>
                        {(value) => {
                          if (!value) return copy.assignSupervisorPlaceholder
                          const user = supervisorsList.find((item) => item.id === String(value))
                          return user ? userOptionLabel(user) : (isArabic ? "مشرف محدد" : "Selected supervisor")
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {supervisorsList.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                          {u.email && u.email !== u.name ? ` — ${u.email}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <section className="rounded-2xl border bg-muted/10 p-4 sm:p-5">
                <h4 className="mb-3 text-sm font-semibold">{copy.includedVisits}</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={`${copy.includedStructureVisits} (${copy.optional})`} htmlFor="edit-structure-visits">
                    <Input
                      id="edit-structure-visits"
                      type="number"
                      min={0}
                      step={1}
                      value={includedStructureVisits}
                      onChange={(e) => {
                        setIncludedStructureVisits(e.target.value)
                        setError(null)
                      }}
                      placeholder={copy.visitsPlaceholder}
                      disabled={pending}
                      className="h-10"
                    />
                  </Field>
                  <Field label={`${copy.includedFinishingVisits} (${copy.optional})`} htmlFor="edit-finishing-visits">
                    <Input
                      id="edit-finishing-visits"
                      type="number"
                      min={0}
                      step={1}
                      value={includedFinishingVisits}
                      onChange={(e) => {
                        setIncludedFinishingVisits(e.target.value)
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
                  <Label htmlFor="edit-owner-count">{copy.ownerCount}</Label>
                  <Select value={String(owners.length)} onValueChange={(val) => setOwnerCount(Number(val ?? 1))} disabled={pending}>
                    <SelectTrigger id="edit-owner-count" className="h-10 w-full">
                      <SelectValue>{(val) => String(val ?? owners.length)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: MAX_OWNERS }, (_, i) => i + 1).map((cnt) => (
                        <SelectItem key={cnt} value={String(cnt)}>
                          {cnt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {owners.map((owner, index) => (
                  <section key={index} className="rounded-2xl border bg-muted/10 p-4 sm:p-5">
                    <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                        {index + 1}
                      </span>
                      {copy.owner} {index + 1}
                    </h4>

                    <div className="mb-4">
                      <ProjectOwnerViewerSelector
                        id={`edit-owner-${index}-viewer`}
                        supervisingOrgId={supervisingOrgId || undefined}
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
                        <Field label={copy.ownerName} htmlFor={`edit-owner-name-${index}`} required>
                          <Input
                            id={`edit-owner-name-${index}`}
                            value={owner.name}
                            onChange={(e) => updateOwner(index, "name", e.target.value)}
                            placeholder={copy.ownerNamePlaceholder}
                            disabled={pending}
                            className="h-10"
                          />
                        </Field>
                      </div>
                      <Field label={`${copy.contactName} (${copy.optional})`} htmlFor={`edit-owner-contact-${index}`}>
                        <Input
                          id={`edit-owner-contact-${index}`}
                          value={owner.contactName}
                          onChange={(e) => updateOwner(index, "contactName", e.target.value)}
                          disabled={pending}
                          className="h-10"
                        />
                      </Field>
                      <Field label={`${copy.contactPhone} (${copy.optional})`} htmlFor={`edit-owner-phone-${index}`}>
                        <Input
                          id={`edit-owner-phone-${index}`}
                          type="tel"
                          value={owner.contactPhone}
                          onChange={(e) => updateOwner(index, "contactPhone", e.target.value)}
                          disabled={pending}
                          className="h-10"
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label={`${copy.contactEmail} (${copy.optional})`} htmlFor={`edit-owner-email-${index}`}>
                          <Input
                            id={`edit-owner-email-${index}`}
                            type="email"
                            value={owner.contactEmail}
                            onChange={(e) => updateOwner(index, "contactEmail", e.target.value)}
                            disabled={pending}
                            className="h-10"
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <OwnerIdCardField
                          id={`edit-owner-id-card-${index}`}
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
                idPrefix="edit-project-financial"
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
                  onValueChange={(val) => {
                    const nextId = val === "none" || val == null ? "" : String(val)
                    setContractorOrganizationId(nextId)
                    const selOrg = contractorOrganizations.find((o) => o.id === nextId)
                    if (selOrg) {
                      setContractorCompanyName(selOrg.name)
                      setContractorRegistrationNumber(selOrg.registrationNumber)
                      setContractorAddress(selOrg.address)
                      setContractorPostalCode(selOrg.postalCode)
                      setContractorPhone(selOrg.phone)
                    }
                  }}
                  disabled={pending}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue>
                      {(val) => {
                        if (!val || val === "none") return copy.noContractor
                        const org = contractorOrganizations.find((item) => item.id === String(val))
                        if (!org) return isArabic ? "مقاول محدد" : "Selected contractor"
                        const isApproved = org.status === "active"
                        return (
                          <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                            <span className="truncate">{org.name}</span>
                            <span
                              className={cn(
                                "flex shrink-0 items-center gap-1 text-xs font-medium",
                                isApproved ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
                              )}
                            >
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
                        {activeContractorOrganizations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                              <span className="truncate">{org.name}</span>
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
                        {pendingContractorOrganizations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                              <span className="truncate">{org.name}</span>
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
                <div
                  className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  role="status"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{copy.pendingContractorWarning}</span>
                </div>
              ) : null}

              <div className="grid gap-5 md:grid-cols-2">
                <Field label={`${copy.companyName} (${copy.optional})`} htmlFor="edit-contractor-company-name">
                  <Input
                    id="edit-contractor-company-name"
                    value={contractorCompanyName}
                    onChange={(e) => setContractorCompanyName(e.target.value)}
                    disabled={pending}
                    className="h-10"
                  />
                </Field>
                <Field label={`${copy.registration} (${copy.optional})`} htmlFor="edit-contractor-registration">
                  <Input
                    id="edit-contractor-registration"
                    value={contractorRegistrationNumber}
                    onChange={(e) => setContractorRegistrationNumber(e.target.value)}
                    disabled={pending}
                    className="h-10"
                  />
                </Field>
                <Field label={`${copy.address} (${copy.optional})`} htmlFor="edit-contractor-address">
                  <Input
                    id="edit-contractor-address"
                    value={contractorAddress}
                    onChange={(e) => setContractorAddress(e.target.value)}
                    disabled={pending}
                    className="h-10"
                  />
                </Field>
                <Field label={`${copy.postalCode} (${copy.optional})`} htmlFor="edit-contractor-postal-code">
                  <Input
                    id="edit-contractor-postal-code"
                    value={contractorPostalCode}
                    onChange={(e) => setContractorPostalCode(e.target.value)}
                    disabled={pending}
                    className="h-10"
                  />
                </Field>
                <Field label={`${copy.phone} (${copy.optional})`} htmlFor="edit-contractor-phone">
                  <Input
                    id="edit-contractor-phone"
                    type="tel"
                    value={contractorPhone}
                    onChange={(e) => setContractorPhone(e.target.value)}
                    disabled={pending}
                    className="h-10"
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between">
                <span>{copy.documentsIntro}</span>
                <span className="shrink-0 rounded-full bg-background/80 px-3 py-1 text-xs font-semibold">
                  {initialDocuments.length} selected
                </span>
              </div>
              <ProjectInitialDocumentUploadStep
                selections={initialDocuments}
                onChange={setInitialDocuments}
                disabled={pending}
                onValidationError={setError}
              />
              {pending ? (
                <div className="rounded-xl border bg-muted/20 px-4 py-3" role="status" aria-live="polite">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                    <span className="truncate">{submissionMessage || uploadingFile || copy.saving}</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="mt-6 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {step === 1 ? (
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                {copy.cancel}
              </Button>
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
              <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => void saveProject()} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <ClipboardList className="size-4" />}
                {pending ? copy.saving : copy.saveChanges}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
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

  function removeImage(id: string) {
    onChange(images.filter((img) => img.id !== id))
  }

  function moveImage(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= images.length) return
    const next = [...images]
    const temp = next[index]
    next[index] = next[targetIndex]
    next[targetIndex] = temp
    onChange(next)
  }

  return (
    <section className="rounded-2xl border bg-muted/10 p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold">{label}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept={PROJECT_IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="h-9 gap-1.5"
          >
            <Camera className="size-4 text-primary" />
            {addLabel}
          </Button>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-8 text-center">
          <Images className="size-8 text-muted-foreground/60" />
          <p className="mt-2 text-xs text-muted-foreground">{emptyLabel}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image, index) => {
            const isCover = index === 0
            const previewUrl = URL.createObjectURL(image.file)
            return (
              <div key={image.id} className="group relative overflow-hidden rounded-xl border bg-card p-1.5">
                <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg bg-muted">
                  <img src={previewUrl} alt={image.file.name} className="h-full w-full object-cover" />
                  {isCover ? (
                    <span className="absolute start-1.5 top-1.5 flex items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground backdrop-blur">
                      <Star className="size-3 fill-current" />
                      {coverLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1 px-1">
                  <span className="truncate text-[11px] text-muted-foreground">{image.file.name}</span>
                  <div className="flex items-center gap-0.5">
                    {index > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        onClick={() => moveImage(index, -1)}
                        disabled={disabled}
                        title={moveEarlierLabel}
                      >
                        <ChevronLeft className="size-3.5 rtl:rotate-180" />
                      </Button>
                    ) : null}
                    {index < images.length - 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        onClick={() => moveImage(index, 1)}
                        disabled={disabled}
                        title={moveLaterLabel}
                      >
                        <ChevronRight className="size-3.5 rtl:rotate-180" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 text-destructive hover:bg-destructive/10"
                      onClick={() => removeImage(image.id)}
                      disabled={disabled}
                      title={removeLabel}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {localError ? <p className="mt-2 text-xs text-destructive">{localError}</p> : null}
    </section>
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
  disabled?: boolean
  label: string
  help: string
  chooseLabel: string
  captureLabel: string
  replaceLabel: string
  removeLabel: string
  emptyLabel: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const captureInputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  function handleFileChange(selected: File | null) {
    if (!selected) return
    const validationError = validateOwnerIdCardFile(selected)
    if (validationError) {
      setLocalError(validationError)
      return
    }
    setLocalError(null)
    onChange(selected)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept={OWNER_ID_CARD_ACCEPT}
        className="hidden"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        disabled={disabled}
      />
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        disabled={disabled}
      />

      <div className="flex flex-col gap-2.5 rounded-xl border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {file ? <FileCheck2 className="size-4" /> : <ImageIcon className="size-4 text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{file ? file.name : emptyLabel}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{help}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {file ? (
            <>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
                {replaceLabel}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-destructive" onClick={() => onChange(null)} disabled={disabled}>
                {removeLabel}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
                <FileText className="size-3.5" />
                {chooseLabel}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5 sm:hidden" onClick={() => captureInputRef.current?.click()} disabled={disabled}>
                <Camera className="size-3.5" />
                {captureLabel}
              </Button>
            </>
          )}
        </div>
      </div>

      {localError ? <p className="text-xs text-destructive">{localError}</p> : null}
    </div>
  )
}
