"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useRef, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  FileUp,
  Loader2,
  MapPin,
  UsersRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ProjectLocationField } from "@/components/projects/project-location-field"
import {
  ProjectDocumentUploadStep,
  createEmptyProjectDocumentSelections,
  type ProjectDocumentSelections,
} from "@/components/projects/project-document-upload-step"
import { createProject } from "@/lib/actions/projects"
import { createUploadedDocumentsAction, type SimpleUploadedFileInput } from "@/lib/actions/documents"
import { useI18n } from "@/lib/i18n"
import { EMPTY_PROJECT_LOCATION, type ProjectLocationValue } from "@/lib/locations/types"
import {
  DOCUMENT_ASSET_BUCKET,
  SIMPLE_UPLOAD_CATEGORIES,
  sanitizeStorageFileName,
  validateSimpleUploadFile,
} from "@/lib/documents/simple-upload"
import { uploadDocumentAsset } from "@/lib/documents/storage-upload"
import { createClient } from "@/lib/supabase/client"
import {
  PROJECT_TYPES,
  SUPERVISION_TYPES,
  type ProjectTypeValue,
  type SupervisionTypeValue,
} from "@/lib/projects/project-options"
import { cn } from "@/lib/utils"

type OwnerDetails = {
  name: string
  contactName: string
  contactEmail: string
  contactPhone: string
}

type ContractorOrganization = { id: string; name: string }

const MAX_OWNERS = 10

function emptyOwner(): OwnerDetails {
  return { name: "", contactName: "", contactEmail: "", contactPhone: "" }
}

export function ProjectCreateForm({
  supervisingOrg,
  contractorOrganizations,
}: {
  supervisingOrg: { id: string; name: string }
  contractorOrganizations: ContractorOrganization[]
}) {
  const router = useRouter()
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const [step, setStep] = useState(1)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [projectType, setProjectType] = useState<ProjectTypeValue | "">("")
  const [supervisionType, setSupervisionType] = useState<SupervisionTypeValue | "">("")
  const [region, setRegion] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState<ProjectLocationValue>(EMPTY_PROJECT_LOCATION)
  const [owners, setOwners] = useState<OwnerDetails[]>([emptyOwner()])
  const [contractorOrganizationId, setContractorOrganizationId] = useState("")
  const [contractorCompanyName, setContractorCompanyName] = useState("")
  const [contractorRegistrationNumber, setContractorRegistrationNumber] = useState("")
  const [contractorAddress, setContractorAddress] = useState("")
  const [contractorPostalCode, setContractorPostalCode] = useState("")
  const [contractorPhone, setContractorPhone] = useState("")
  const [documents, setDocuments] = useState<ProjectDocumentSelections>(createEmptyProjectDocumentSelections)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadingFile, setUploadingFile] = useState<string | null>(null)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const submissionLockRef = useRef(false)

  const selectedDocumentCount = useMemo(
    () => SIMPLE_UPLOAD_CATEGORIES.reduce((total, category) => total + documents[category.value].length, 0),
    [documents],
  )

  const copy = isArabic
    ? {
        back: "العودة إلى المشاريع",
        title: "إضافة مشروع جديد",
        subtitle: `سيتم إنشاء هذا المشروع ضمن ${supervisingOrg.name}.`,
        org: "الجهة المشرفة",
        steps: ["تفاصيل المشروع", "تفاصيل المالك", "المقاول", "المستندات"],
        stepDescriptions: [
          "أدخل المعلومات الأساسية وموقع المشروع.",
          "أضف بيانات المالك أو العميل.",
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
        region: "المنطقة",
        regionPlaceholder: "مثال: مسقط",
        description: "وصف المشروع",
        descriptionPlaceholder: "ملخص نطاق المشروع وأهدافه…",
        ownerCount: "عدد المالكين",
        owner: "المالك",
        ownerName: "اسم المالك",
        ownerNamePlaceholder: "اسم المالك أو الجهة",
        contactName: "اسم جهة الاتصال",
        contactEmail: "البريد الإلكتروني",
        contactPhone: "رقم الهاتف",
        assignContractor: "تعيين مقاول مسجل",
        noContractor: "بدون تعيين جهة مسجلة",
        companyName: "اسم الشركة",
        registration: "رقم السجل التجاري",
        address: "العنوان",
        postalCode: "الرمز البريدي",
        phone: "رقم الهاتف",
        documentsIntro: "ستُحفظ الملفات المحددة كمستندات مشروع عادية وستظهر في صفحة المستندات.",
        optional: "اختياري",
        cancel: "إلغاء",
        backStep: "السابق",
        next: "التالي",
        submit: "إنشاء المشروع",
        retryUpload: "إعادة محاولة رفع المستندات",
        creating: "جارٍ إنشاء المشروع…",
        uploading: "جارٍ رفع المستندات…",
        created: "تم إنشاء المشروع بنجاح.",
        requiredProject: "أدخل اسم مشروع صحيحًا واختر نوع المشروع ونوع الإشراف.",
        requiredOwners: "أدخل اسمًا صحيحًا لكل مالك.",
        invalidOwnerEmail: "أدخل بريدًا إلكترونيًا صحيحًا لكل مالك.",
        documentUploadFailed: "تم إنشاء المشروع، لكن تعذر رفع المستندات. أعد المحاولة لإكمال الرفع.",
      }
    : {
        back: "Back to Projects",
        title: "Add New Project",
        subtitle: `This project will be created under ${supervisingOrg.name}.`,
        org: "Supervising organization",
        steps: ["Project Details", "Owner Details", "Contractor", "Documents"],
        stepDescriptions: [
          "Enter the project basics and working location.",
          "Capture owner or client contact details.",
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
        region: "Region",
        regionPlaceholder: "e.g. Muscat",
        description: "Project Description",
        descriptionPlaceholder: "Summarize the project scope and objectives…",
        ownerCount: "Number of Owners",
        owner: "Owner",
        ownerName: "Owner Name",
        ownerNamePlaceholder: "Owner or client organization",
        contactName: "Contact Name",
        contactEmail: "Contact Email",
        contactPhone: "Contact Phone",
        assignContractor: "Assign Registered Contractor",
        noContractor: "No registered organization assigned",
        companyName: "Company Name",
        registration: "Registration / CR Number",
        address: "Address",
        postalCode: "Postal Code",
        phone: "Phone Number",
        documentsIntro: "Selected files will be saved as normal project document records and appear in Project → Documents.",
        optional: "Optional",
        cancel: "Cancel",
        backStep: "Back",
        next: "Next",
        submit: "Create Project",
        retryUpload: "Retry Document Upload",
        creating: "Creating project…",
        uploading: "Uploading documents…",
        created: "Project created successfully.",
        requiredProject: "Enter a valid project name and select the project and supervision types.",
        requiredOwners: "Enter a valid name for every owner.",
        invalidOwnerEmail: "Enter a valid email address for every owner.",
        documentUploadFailed: "The project was created, but its documents could not be uploaded. Retry to complete the upload.",
      }

  const stepIcons = [MapPin, UsersRound, Building2, FileUp]

  function setOwnerCount(count: number) {
    const safeCount = Math.max(1, Math.min(MAX_OWNERS, count))
    setOwners((current) => {
      if (safeCount === current.length) return current
      if (safeCount < current.length) return current.slice(0, safeCount)
      return [...current, ...Array.from({ length: safeCount - current.length }, emptyOwner)]
    })
    setError(null)
  }

  function updateOwner(index: number, field: keyof OwnerDetails, value: string) {
    setOwners((current) => current.map((owner, ownerIndex) => (
      ownerIndex === index ? { ...owner, [field]: value } : owner
    )))
  }

  function validateStep(targetStep: number): string | null {
    if (targetStep === 1) {
      if (name.trim().length < 2 || !projectType || !supervisionType) return copy.requiredProject
      return null
    }
    if (targetStep === 2) {
      if (owners.some((owner) => owner.name.trim().length < 2)) return copy.requiredOwners
      const invalidEmail = owners.some((owner) => {
        const email = owner.contactEmail.trim()
        return email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      })
      if (invalidEmail) return copy.invalidOwnerEmail
      return null
    }
    if (targetStep === 4) {
      for (const category of SIMPLE_UPLOAD_CATEGORIES) {
        for (const file of documents[category.value]) {
          const validationError = validateSimpleUploadFile(file)
          if (validationError) return validationError
        }
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

  async function uploadProjectDocuments(projectId: string) {
    const filesToUpload = SIMPLE_UPLOAD_CATEGORIES.flatMap((category) =>
      documents[category.value].map((file) => ({ category, file })),
    )
    if (filesToUpload.length === 0) return 0

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error("Your session has expired. Sign in again.")

    const totalBytes = filesToUpload.reduce((total, item) => total + item.file.size, 0)
    let completedBytes = 0
    const uploadedPaths: string[] = []
    const records: SimpleUploadedFileInput[] = []

    try {
      for (const { category, file } of filesToUpload) {
        const validationError = validateSimpleUploadFile(file)
        if (validationError) throw new Error(validationError)
        setUploadingFile(file.name)
        const storagePath = `${projectId}/${session.user.id}/files/${crypto.randomUUID()}-${sanitizeStorageFileName(file.name)}`
        await uploadDocumentAsset(file, storagePath, session.access_token, (fileProgress) => {
          const uploadedBytes = completedBytes + (file.size * fileProgress) / 100
          setUploadProgress(Math.min(99, Math.round((uploadedBytes / totalBytes) * 100)))
        })
        uploadedPaths.push(storagePath)
        completedBytes += file.size
        records.push({
          category: category.value,
          storagePath,
          originalFilename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        })
      }

      setUploadingFile(isArabic ? "جارٍ حفظ سجلات المستندات" : "Saving document records")
      const result = await createUploadedDocumentsAction({ projectId, files: records })
      if (!result.ok) throw new Error(result.error)
      setUploadProgress(100)
      return result.count
    } catch (uploadError) {
      if (uploadedPaths.length) await supabase.storage.from(DOCUMENT_ASSET_BUCKET).remove(uploadedPaths)
      throw uploadError
    }
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

    let projectId = createdProjectId
    try {
      if (!projectId) {
        const result = await createProject({
          supervisingOrgId: supervisingOrg.id,
          name,
          code,
          projectType,
          supervisionType,
          region,
          description,
          location: location.address,
          latitude: location.latitude,
          longitude: location.longitude,
          owners,
          contractor: {
            organizationId: contractorOrganizationId || null,
            companyName: contractorCompanyName,
            registrationNumber: contractorRegistrationNumber,
            address: contractorAddress,
            postalCode: contractorPostalCode,
            phone: contractorPhone,
          },
        })

        if (!result.ok) {
          setError(result.error)
          setPending(false)
          submissionLockRef.current = false
          return
        }
        if (!result.data) {
          setError(isArabic ? "تعذر إنشاء المشروع." : "Could not create project.")
          setPending(false)
          submissionLockRef.current = false
          return
        }
        projectId = result.data.id
        setCreatedProjectId(projectId)
      }

      if (selectedDocumentCount > 0) {
        await uploadProjectDocuments(projectId)
      }

      setSuccess(true)
      router.replace(`/projects?created=${encodeURIComponent(projectId)}`)
      router.refresh()
    } catch (submitError) {
      setError(
        createdProjectId || projectId
          ? `${copy.documentUploadFailed} ${submitError instanceof Error ? submitError.message : ""}`.trim()
          : submitError instanceof Error ? submitError.message : "Could not create project.",
      )
      setPending(false)
      setUploadingFile(null)
      setUploadProgress(0)
      submissionLockRef.current = false
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

                <div className="grid gap-5 md:grid-cols-2">
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
                  <Field label={copy.code} htmlFor="new-project-code">
                    <Input
                      id="new-project-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder={copy.codePlaceholder}
                      disabled={pending}
                      className="h-10"
                    />
                  </Field>
                  <Field label={copy.projectType} required>
                    <Select value={projectType || null} onValueChange={(value) => setProjectType((value as ProjectTypeValue | null) ?? "")} disabled={pending}>
                      <SelectTrigger className="h-10 w-full"><SelectValue placeholder={copy.projectTypePlaceholder} /></SelectTrigger>
                      <SelectContent>
                        {PROJECT_TYPES.map((option) => <SelectItem key={option.value} value={option.value}>{isArabic ? option.labelAr : option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={copy.supervisionType} required>
                    <Select value={supervisionType || null} onValueChange={(value) => setSupervisionType((value as SupervisionTypeValue | null) ?? "")} disabled={pending}>
                      <SelectTrigger className="h-10 w-full"><SelectValue placeholder={copy.supervisionTypePlaceholder} /></SelectTrigger>
                      <SelectContent>
                        {SUPERVISION_TYPES.map((option) => <SelectItem key={option.value} value={option.value}>{isArabic ? option.labelAr : option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={`${copy.region} (${copy.optional})`} htmlFor="new-project-region">
                    <Input
                      id="new-project-region"
                      value={region}
                      onChange={(event) => setRegion(event.target.value)}
                      placeholder={copy.regionPlaceholder}
                      disabled={pending}
                      className="h-10"
                    />
                  </Field>
                </div>

                <div className="rounded-2xl border bg-muted/15 p-4 sm:p-5">
                  <ProjectLocationField
                    id="new-project-location"
                    value={location}
                    onChange={setLocation}
                    disabled={pending}
                  />
                </div>

                <Field label={`${copy.description} (${copy.optional})`} htmlFor="new-project-description">
                  <textarea
                    id="new-project-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={copy.descriptionPlaceholder}
                    disabled={pending}
                    rows={4}
                    className="flex w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
                  />
                </Field>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-5">
                <div className="max-w-xs space-y-2">
                  <Label htmlFor="owner-count">{copy.ownerCount}</Label>
                  <Select value={String(owners.length)} onValueChange={(value) => setOwnerCount(Number(value ?? 1))} disabled={pending}>
                    <SelectTrigger id="owner-count" className="h-10 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: MAX_OWNERS }, (_, index) => index + 1).map((count) => (
                        <SelectItem key={count} value={String(count)}>{count}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {owners.map((owner, index) => (
                    <section key={index} className="rounded-2xl border bg-muted/10 p-4 sm:p-5" aria-labelledby={`owner-${index}-title`}>
                      <h3 id={`owner-${index}-title`} className="mb-4 flex items-center gap-2 text-sm font-semibold">
                        <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{index + 1}</span>
                        {copy.owner} {index + 1}
                      </h3>
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
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-6">
                <Field label={`${copy.assignContractor} (${copy.optional})`}>
                  <Select
                    value={contractorOrganizationId || "none"}
                    onValueChange={(value) => {
                      const nextId = value === "none" || value == null ? "" : String(value)
                      setContractorOrganizationId(nextId)
                      const selectedOrganization = contractorOrganizations.find((organization) => organization.id === nextId)
                      if (selectedOrganization) setContractorCompanyName(selectedOrganization.name)
                    }}
                    disabled={pending}
                  >
                    <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{copy.noContractor}</SelectItem>
                      {contractorOrganizations.map((organization) => (
                        <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label={`${copy.companyName} (${copy.optional})`} htmlFor="contractor-company-name">
                    <Input id="contractor-company-name" value={contractorCompanyName} onChange={(event) => setContractorCompanyName(event.target.value)} disabled={pending || Boolean(contractorOrganizationId)} className="h-10" />
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
                <ProjectDocumentUploadStep
                  selections={documents}
                  onChange={setDocuments}
                  disabled={pending}
                  onValidationError={setError}
                />
                {pending && selectedDocumentCount > 0 ? (
                  <div className="rounded-xl border bg-muted/20 px-4 py-3" role="status" aria-live="polite">
                    <div className="mb-2 flex items-center justify-between gap-4 text-xs font-medium">
                      <span className="flex min-w-0 items-center gap-2"><Loader2 className="size-4 shrink-0 animate-spin text-primary" /><span className="truncate">{uploadingFile || copy.uploading}</span></span>
                      <span className="tabular-nums">{uploadProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} />
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
                  {pending ? (selectedDocumentCount > 0 ? copy.uploading : copy.creating) : createdProjectId ? copy.retryUpload : copy.submit}
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
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
