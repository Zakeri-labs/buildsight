"use client"

import { useMemo, useRef } from "react"
import { CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  calculateProjectOutstandingAmount,
  isOptionalProjectAmountInput,
  PROJECT_FINANCIAL_NOTE_MAX_LENGTH,
  PROJECT_INITIAL_REMARKS_MAX_LENGTH,
  type ProjectFinancialFormValues,
} from "@/lib/projects/project-financial"
import { cn } from "@/lib/utils"

export type { ProjectFinancialFormValues }

type FinancialField = keyof ProjectFinancialFormValues

export function ProjectFinancialFields({
  idPrefix,
  values,
  onChange,
  includedStructureVisits,
  onChangeIncludedStructureVisits,
  includedFinishingVisits,
  onChangeIncludedFinishingVisits,
  disabled = false,
  isArabic = false,
  className,
}: {
  idPrefix: string
  values: ProjectFinancialFormValues
  onChange: (field: FinancialField, value: string) => void
  includedStructureVisits?: string
  onChangeIncludedStructureVisits?: (value: string) => void
  includedFinishingVisits?: string
  onChangeIncludedFinishingVisits?: (value: string) => void
  disabled?: boolean
  isArabic?: boolean
  className?: string
}) {
  const nextPaymentDueDateRef = useRef<HTMLInputElement>(null)
  const outstandingAmount = useMemo(
    () => calculateProjectOutstandingAmount(
      values.structureSupervisionFee,
      values.finishingSupervisionFee,
      values.receivedAmount,
    ),
    [values.finishingSupervisionFee, values.receivedAmount, values.structureSupervisionFee],
  )

  const copy = isArabic
    ? {
        title: "الخلاصة المالية",
        includedStructureVisits: "زيارات الهيكل الإنشائي المشمولة",
        includedFinishingVisits: "زيارات التشطيبات المشمولة",
        structureFee: "رسوم الإشراف الإنشائي",
        finishingFee: "رسوم الإشراف على التشطيبات",
        received: "المبلغ المستلم",
        outstanding: "المبلغ المستحق",
        nextPayment: "مبلغ الدفعة التالية",
        nextDueDate: "تاريخ استحقاق الدفعة التالية",
        paymentNote: "مرجع الفاتورة / ملاحظة الدفع",
        remarks: "ملاحظات أولية",
        openCalendar: "فتح تقويم تاريخ استحقاق الدفعة التالية",
        optional: "اختياري",
      }
    : {
        title: "Financial Summary",
        includedStructureVisits: "Included Structure Visits",
        includedFinishingVisits: "Included Finishing Visits",
        structureFee: "Structure Supervision Fee",
        finishingFee: "Finishing Supervision Fee",
        received: "Received Amount",
        outstanding: "Outstanding Amount",
        nextPayment: "Next Payment Amount",
        nextDueDate: "Next Payment Due Date",
        paymentNote: "Invoice Reference / Payment Note",
        remarks: "Initial Remarks",
        openCalendar: "Open next payment due date calendar",
        optional: "Optional",
      }

  function amountInput(field: "structureSupervisionFee" | "finishingSupervisionFee" | "receivedAmount" | "nextPaymentAmount", label: string) {
    const id = `${idPrefix}-${field}`
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label} ({copy.optional})</Label>
        <div className="relative">
          <Input
            id={id}
            type="number"
            min={0}
            max={99999999999.999}
            step="0.001"
            inputMode="decimal"
            value={values[field]}
            onChange={(event) => {
              const nextValue = event.target.value
              if (nextValue.startsWith("-")) return

              const nextValues = { ...values, [field]: nextValue }
              const relatedValuesAreValid =
                isOptionalProjectAmountInput(nextValues.structureSupervisionFee) &&
                isOptionalProjectAmountInput(nextValues.finishingSupervisionFee) &&
                isOptionalProjectAmountInput(nextValues.receivedAmount)
              if (
                relatedValuesAreValid &&
                calculateProjectOutstandingAmount(
                  nextValues.structureSupervisionFee,
                  nextValues.finishingSupervisionFee,
                  nextValues.receivedAmount,
                ) < 0
              ) {
                return
              }

              onChange(field, nextValue)
            }}
            disabled={disabled}
            placeholder="0.000"
            className="h-10 pe-14 tabular-nums"
          />
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">OMR</span>
        </div>
      </div>
    )
  }

  return (
    <section className={cn("rounded-2xl border bg-muted/10 p-4 sm:p-5", className)} aria-labelledby={`${idPrefix}-title`}>
      <h3 id={`${idPrefix}-title`} className="mb-4 text-sm font-semibold">{copy.title}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {onChangeIncludedStructureVisits ? (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-included-structure-visits`}>{copy.includedStructureVisits} ({copy.optional})</Label>
            <Input
              id={`${idPrefix}-included-structure-visits`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={includedStructureVisits ?? ""}
              onChange={(e) => onChangeIncludedStructureVisits(e.target.value)}
              disabled={disabled}
              placeholder="—"
              className="h-10"
            />
          </div>
        ) : null}
        {onChangeIncludedFinishingVisits ? (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-included-finishing-visits`}>{copy.includedFinishingVisits} ({copy.optional})</Label>
            <Input
              id={`${idPrefix}-included-finishing-visits`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={includedFinishingVisits ?? ""}
              onChange={(e) => onChangeIncludedFinishingVisits(e.target.value)}
              disabled={disabled}
              placeholder="—"
              className="h-10"
            />
          </div>
        ) : null}
        {amountInput("structureSupervisionFee", copy.structureFee)}
        {amountInput("finishingSupervisionFee", copy.finishingFee)}
        {amountInput("receivedAmount", copy.received)}
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-outstanding-amount`}>{copy.outstanding}</Label>
          <div className="relative">
            <Input
              id={`${idPrefix}-outstanding-amount`}
              type="number"
              value={outstandingAmount.toFixed(3)}
              readOnly
              disabled={disabled}
              className="h-10 bg-muted/40 pe-14 font-medium tabular-nums"
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">OMR</span>
          </div>
        </div>
        {amountInput("nextPaymentAmount", copy.nextPayment)}
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-next-payment-due-date`}>{copy.nextDueDate} ({copy.optional})</Label>
          <div className="relative">
            <Input
              ref={nextPaymentDueDateRef}
              id={`${idPrefix}-next-payment-due-date`}
              type="date"
              value={values.nextPaymentDueDate}
              onChange={(event) => onChange("nextPaymentDueDate", event.target.value)}
              disabled={disabled}
              className="h-10 pe-11 [&::-webkit-calendar-picker-indicator]:opacity-0"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute end-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                const input = nextPaymentDueDateRef.current
                if (!input || disabled) return
                try {
                  input.showPicker()
                } catch {
                  input.focus()
                  input.click()
                }
              }}
              disabled={disabled}
              aria-label={copy.openCalendar}
              title={copy.openCalendar}
            >
              <CalendarDays className="size-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-payment-note`}>{copy.paymentNote} ({copy.optional})</Label>
          <Input
            id={`${idPrefix}-payment-note`}
            value={values.invoiceReferencePaymentNote}
            onChange={(event) => onChange("invoiceReferencePaymentNote", event.target.value)}
            maxLength={PROJECT_FINANCIAL_NOTE_MAX_LENGTH}
            disabled={disabled}
            className="h-10"
          />
        </div>
        <div className="space-y-2 sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <Label htmlFor={`${idPrefix}-initial-remarks`}>{copy.remarks} ({copy.optional})</Label>
          <textarea
            id={`${idPrefix}-initial-remarks`}
            value={values.initialRemarks}
            onChange={(event) => onChange("initialRemarks", event.target.value)}
            maxLength={PROJECT_INITIAL_REMARKS_MAX_LENGTH}
            disabled={disabled}
            rows={3}
            className="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>
    </section>
  )
}
