"use client"

import { useRef, useState, useTransition } from "react"
import { CalendarDays, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  ProjectFinancialFields,
  type ProjectFinancialFormValues,
} from "@/components/projects/project-financial-fields"
import { updateProject } from "@/lib/actions/projects"
import type { ProjectLocationValue } from "@/lib/locations/types"
import {
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
  SUPERVISION_TYPES,
  isProjectPriorityValue,
  isSupervisionTypeValue,
  supervisionTypeLabel,
  type ProjectPriorityValue,
  type ProjectTypeValue,
} from "@/lib/projects/project-options"
import { calculateProjectOutstandingAmount, validateProjectFinancialForm } from "@/lib/projects/project-financial"
import {
  normalizeProjectStatus,
  PROJECT_STATUS_OPTIONS,
  type ProjectStatusValue,
} from "@/lib/projects/project-status"

export { normalizeProjectStatus, PROJECT_STATUS_OPTIONS }
export type { ProjectStatusValue }

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
}

export function ProjectEditDialog({
  project,
  locale,
  onClose,
  onSaved,
}: {
  project: ProjectEditData
  locale: string
  onClose: () => void
  onSaved: (project: ProjectEditData & { supervisionTypeLabel: string }) => void
}) {
  const isArabic = locale === "ar"
  const [name, setName] = useState(project.name)
  const [code, setCode] = useState(project.code === "—" || project.code === "Not set" ? "" : project.code)
  const [projectType, setProjectType] = useState<ProjectTypeValue | "">(project.projectTypeValue ?? "")
  const [supervisionType, setSupervisionType] = useState(project.supervisionType ?? "")
  const [supervisionTypeOther, setSupervisionTypeOther] = useState(project.supervisionTypeOther ?? "")
  const [status, setStatus] = useState<ProjectStatusValue>(normalizeProjectStatus(project.status))
  const [plotNo, setPlotNo] = useState(project.plotNo ?? "")
  const [supervisionStartDate, setSupervisionStartDate] = useState(project.supervisionStartDate ?? "")
  const [priority, setPriority] = useState<ProjectPriorityValue | "">(
    isProjectPriorityValue(project.priority) ? project.priority : "",
  )
  const [includedStructureVisits, setIncludedStructureVisits] = useState(
    project.includedStructureVisits == null ? "" : String(project.includedStructureVisits),
  )
  const [includedFinishingVisits, setIncludedFinishingVisits] = useState(
    project.includedFinishingVisits == null ? "" : String(project.includedFinishingVisits),
  )
  const [areaDistrict, setAreaDistrict] = useState(project.areaDistrict ?? "")
  const [description, setDescription] = useState(project.description ?? "")
  const [financialValues, setFinancialValues] = useState<ProjectFinancialFormValues>({
    structureSupervisionFee: project.structureSupervisionFee == null ? "" : String(project.structureSupervisionFee),
    finishingSupervisionFee: project.finishingSupervisionFee == null ? "" : String(project.finishingSupervisionFee),
    receivedAmount: project.receivedAmount == null ? "" : String(project.receivedAmount),
    nextPaymentAmount: project.nextPaymentAmount == null ? "" : String(project.nextPaymentAmount),
    nextPaymentDueDate: project.nextPaymentDueDate ?? "",
    invoiceReferencePaymentNote: project.invoiceReferencePaymentNote ?? "",
    initialRemarks: project.initialRemarks ?? "",
  })
  const supervisionStartDateInputRef = useRef<HTMLInputElement>(null)
  const [location, setLocation] = useState<ProjectLocationValue>({
    address: project.address === "—" || project.address === "Location not set" ? "" : project.address,
    latitude: project.latitude ?? null,
    longitude: project.longitude ?? null,
    verified: project.latitude != null && project.longitude != null,
    source: project.latitude != null && project.longitude != null ? "map" : "manual",
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    const normalizedSupervisionTypeOther = supervisionTypeOther.trim()
    const validSupervisionType = isSupervisionTypeValue(supervisionType) ? supervisionType : undefined
    if (validSupervisionType === "other" && !normalizedSupervisionTypeOther) {
      setError(isArabic ? "يرجى تحديد نوع الإشراف." : "Please specify the supervision type.")
      return
    }
    if (!isOptionalWholeNumber(includedStructureVisits) || !isOptionalWholeNumber(includedFinishingVisits)) {
      setError(
        isArabic
          ? "يجب أن تكون الزيارات المشمولة أعدادًا صحيحة غير سالبة."
          : "Included visits must be non-negative whole numbers.",
      )
      return
    }
    const financialValidation = validateProjectFinancialForm(financialValues)
    if (!financialValidation.ok) {
      setError(
        isArabic
          ? "أدخل مبالغ صحيحة غير سالبة، ويجب ألا يتجاوز المبلغ المستلم إجمالي رسوم الإشراف."
          : financialValidation.error,
      )
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await updateProject({
        projectId: project.id,
        name,
        code,
        projectType: projectType || undefined,
        supervisionType: validSupervisionType,
        supervisionTypeOther: validSupervisionType
          ? (validSupervisionType === "other" ? normalizedSupervisionTypeOther : null)
          : undefined,
        status,
        plotNo,
        supervisionStartDate,
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
        description,
        region: areaDistrict,
        location: location.address,
        latitude: location.latitude,
        longitude: location.longitude,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }

      const projectTypeOption = PROJECT_TYPES.find((option) => option.value === projectType)
      const nextSupervisionType = validSupervisionType ?? project.supervisionType ?? null
      const nextSupervisionTypeOther = validSupervisionType
        ? (validSupervisionType === "other" ? normalizedSupervisionTypeOther : null)
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
        supervisionStartDate: supervisionStartDate || null,
        priority: priority || project.priority || null,
        includedStructureVisits: optionalWholeNumber(includedStructureVisits),
        includedFinishingVisits: optionalWholeNumber(includedFinishingVisits),
        structureSupervisionFee: financialValues.structureSupervisionFee === "" ? null : Number(financialValues.structureSupervisionFee),
        finishingSupervisionFee: financialValues.finishingSupervisionFee === "" ? null : Number(financialValues.finishingSupervisionFee),
        receivedAmount: financialValues.receivedAmount === "" ? null : Number(financialValues.receivedAmount),
        outstandingAmount:
          (financialValues.structureSupervisionFee !== "" || financialValues.finishingSupervisionFee !== "" || financialValues.receivedAmount !== "")
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
      })
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-6xl" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{isArabic ? "تعديل المشروع" : "Edit Project"}</DialogTitle>
          <DialogDescription>
            {isArabic
              ? "حدّث معلومات المشروع الأساسية وموقعه الدقيق."
              : "Update the project's core information and precise map location."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ProjectLocationField
            id={`project-edit-location-${project.id}`}
            value={location}
            onChange={setLocation}
            areaField={{
              value: areaDistrict,
              onChange: setAreaDistrict,
              label: isArabic ? "المنطقة / الحي" : "Area / District",
              placeholder: isArabic ? "مثال: وسط المدينة أو منطقة الأعمال" : "e.g. Downtown or Business District",
            }}
            disabled={pending}
          >
            <div className="flex h-full min-h-0 flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor={`project-edit-name-${project.id}`}>{isArabic ? "اسم المشروع" : "Project Name"}</Label>
                <Input
                  id={`project-edit-name-${project.id}`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={pending}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`project-edit-code-${project.id}`}>{isArabic ? "رقم / رمز المشروع" : "Project Number / Code"}</Label>
                <Input
                  id={`project-edit-code-${project.id}`}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={pending}
                  className="h-10"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`project-edit-plot-no-${project.id}`}>{isArabic ? "رقم قطعة الأرض" : "Plot No."}</Label>
                  <Input
                    id={`project-edit-plot-no-${project.id}`}
                    value={plotNo}
                    onChange={(event) => setPlotNo(event.target.value)}
                    placeholder={isArabic ? "مثال: 42-B" : "e.g. 42-B"}
                    disabled={pending}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isArabic ? "الأولوية" : "Priority"}</Label>
                  <Select
                    value={priority || null}
                    onValueChange={(value) => setPriority((value as ProjectPriorityValue | null) ?? "")}
                    disabled={pending}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder={isArabic ? "غير محدد" : "Not set"}>
                        {(value) => {
                          if (!value) return isArabic ? "غير محدد" : "Not set"
                          const option = PROJECT_PRIORITIES.find((item) => item.value === String(value))
                          return option ? (isArabic ? option.labelAr : option.label) : String(value)
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
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{isArabic ? "نوع المشروع" : "Project Type"}</Label>
                  <Select
                    value={projectType || null}
                    onValueChange={(value) => setProjectType((value as ProjectTypeValue | null) ?? "")}
                    disabled={pending}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder={isArabic ? "اختر نوع المشروع" : "Select project type"}>
                        {(value) => {
                          if (!value) return isArabic ? "اختر نوع المشروع" : "Select project type"
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
                </div>
                <div className="space-y-2">
                  <Label>{isArabic ? "نوع الإشراف" : "Supervision Type"}</Label>
                  <Select
                    value={supervisionType || null}
                    onValueChange={(value) => {
                      const nextValue = value ? String(value) : ""
                      setSupervisionType(nextValue)
                      if (nextValue !== "other") setSupervisionTypeOther("")
                      setError(null)
                    }}
                    disabled={pending}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder={isArabic ? "اختر نوع الإشراف" : "Select supervision type"}>
                        {(value) => {
                          if (!value) return isArabic ? "اختر نوع الإشراف" : "Select supervision type"
                          const option = SUPERVISION_TYPES.find((item) => item.value === String(value))
                          return option
                            ? (isArabic ? option.labelAr : option.label)
                            : supervisionTypeLabel(String(value), project.supervisionTypeOther)
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
                </div>
              </div>
              {supervisionType === "other" ? (
                <div className="space-y-2">
                  <Label htmlFor={`project-edit-supervision-other-${project.id}`}>
                    {isArabic ? "تحديد نوع الإشراف" : "Specify Supervision Type"}
                  </Label>
                  <Input
                    id={`project-edit-supervision-other-${project.id}`}
                    value={supervisionTypeOther}
                    onChange={(event) => {
                      setSupervisionTypeOther(event.target.value)
                      setError(null)
                    }}
                    placeholder={isArabic ? "أدخل نوع الإشراف" : "Enter the supervision type"}
                    maxLength={150}
                    disabled={pending}
                    className="h-10"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>{isArabic ? "الحالة" : "Status"}</Label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    if (value) setStatus(value as ProjectStatusValue)
                  }}
                  disabled={pending}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue>
                      {(value) => {
                        const option = PROJECT_STATUS_OPTIONS.find((item) => item.value === String(value))
                        return option ? (isArabic ? option.labelAr : option.label) : String(value ?? "")
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {isArabic ? option.labelAr : option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`project-edit-supervision-start-date-${project.id}`}>
                  {isArabic ? "تاريخ بدء الإشراف" : "Supervision Start Date"}
                </Label>
                <div className="relative">
                  <Input
                    ref={supervisionStartDateInputRef}
                    id={`project-edit-supervision-start-date-${project.id}`}
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
                    aria-label={isArabic ? "فتح تقويم تاريخ بدء الإشراف" : "Open supervision start date calendar"}
                    title={isArabic ? "فتح تقويم تاريخ بدء الإشراف" : "Open supervision start date calendar"}
                  >
                    <CalendarDays className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`project-edit-included-structure-visits-${project.id}`}>
                    {isArabic ? "زيارات الهيكل الإنشائي المشمولة" : "Included Structure Visits"}
                  </Label>
                  <Input
                    id={`project-edit-included-structure-visits-${project.id}`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={includedStructureVisits}
                    onChange={(event) => {
                      setIncludedStructureVisits(event.target.value)
                      setError(null)
                    }}
                    disabled={pending}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`project-edit-included-finishing-visits-${project.id}`}>
                    {isArabic ? "زيارات التشطيبات المشمولة" : "Included Finishing Visits"}
                  </Label>
                  <Input
                    id={`project-edit-included-finishing-visits-${project.id}`}
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={includedFinishingVisits}
                    onChange={(event) => {
                      setIncludedFinishingVisits(event.target.value)
                      setError(null)
                    }}
                    disabled={pending}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="flex min-h-32 flex-1 flex-col gap-2">
                <Label htmlFor={`project-edit-description-${project.id}`}>{isArabic ? "وصف المشروع" : "Project Description"}</Label>
                <textarea
                  id={`project-edit-description-${project.id}`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={pending}
                  rows={4}
                  className="min-h-24 flex-1 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 lg:resize-none"
                />
              </div>
            </div>
          </ProjectLocationField>
          <ProjectFinancialFields
            idPrefix={`project-edit-financial-${project.id}`}
            values={financialValues}
            onChange={(field, value) => {
              setFinancialValues((current) => ({ ...current, [field]: value }))
              setError(null)
            }}
            disabled={pending}
            isArabic={isArabic}
          />
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="bg-transparent" disabled={pending} onClick={onClose}>
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="button" disabled={pending || name.trim().length < 2} onClick={save}>
            {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
            {isArabic ? "حفظ التغييرات" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
