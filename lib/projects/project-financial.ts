export const PROJECT_AMOUNT_MAX = 99_999_999_999.999
export const PROJECT_FINANCIAL_NOTE_MAX_LENGTH = 250
export const PROJECT_INITIAL_REMARKS_MAX_LENGTH = 2_000

export type ProjectFinancialFormValues = {
  structureSupervisionFee: string
  finishingSupervisionFee: string
  receivedAmount: string
  nextPaymentAmount: string
  nextPaymentDueDate: string
  invoiceReferencePaymentNote: string
  initialRemarks: string
}

type AmountResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string }

function roundOmr(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000
}

export function normalizeOptionalProjectAmount(
  value: string | number | null | undefined,
  fieldLabel: string,
): AmountResult {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return { ok: true, value: null }
  }

  const raw = typeof value === "number" ? String(value) : value.trim()
  if (!/^\d+(?:\.\d{1,3})?$/.test(raw)) {
    return { ok: false, error: `${fieldLabel} must be a valid non-negative amount with up to 3 decimal places.` }
  }

  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0 || amount > PROJECT_AMOUNT_MAX) {
    return { ok: false, error: `${fieldLabel} must be a valid non-negative amount.` }
  }

  return { ok: true, value: roundOmr(amount) }
}

export function isOptionalProjectAmountInput(value: string) {
  return normalizeOptionalProjectAmount(value, "Amount").ok
}

export function projectAmountForCalculation(value: string | number | null | undefined) {
  const result = normalizeOptionalProjectAmount(value, "Amount")
  return result.ok ? result.value ?? 0 : 0
}

export function calculateProjectOutstandingAmount(
  structureSupervisionFee: string | number | null | undefined,
  finishingSupervisionFee: string | number | null | undefined,
  receivedAmount: string | number | null | undefined,
) {
  return roundOmr(
    projectAmountForCalculation(structureSupervisionFee) +
      projectAmountForCalculation(finishingSupervisionFee) -
      projectAmountForCalculation(receivedAmount),
  )
}

export function validateProjectFinancialForm(values: ProjectFinancialFormValues) {
  const amountFields: Array<[string, string]> = [
    ["Structure Supervision Fee", values.structureSupervisionFee],
    ["Finishing Supervision Fee", values.finishingSupervisionFee],
    ["Received Amount", values.receivedAmount],
    ["Next Payment Amount", values.nextPaymentAmount],
  ]

  for (const [label, value] of amountFields) {
    const result = normalizeOptionalProjectAmount(value, label)
    if (!result.ok) return { ok: false as const, error: result.error }
  }

  if (calculateProjectOutstandingAmount(
    values.structureSupervisionFee,
    values.finishingSupervisionFee,
    values.receivedAmount,
  ) < 0) {
    return { ok: false as const, error: "Received Amount cannot exceed the total supervision fees." }
  }

  if (values.invoiceReferencePaymentNote.trim().length > PROJECT_FINANCIAL_NOTE_MAX_LENGTH) {
    return { ok: false as const, error: `Invoice Reference / Payment Note must be ${PROJECT_FINANCIAL_NOTE_MAX_LENGTH} characters or fewer.` }
  }
  if (values.initialRemarks.trim().length > PROJECT_INITIAL_REMARKS_MAX_LENGTH) {
    return { ok: false as const, error: `Initial Remarks must be ${PROJECT_INITIAL_REMARKS_MAX_LENGTH} characters or fewer.` }
  }

  return { ok: true as const }
}

export function formatProjectAmountOmr(value: number | string | null | undefined, notSet: string) {
  if (value == null || value === "") return notSet
  const amount = Number(value)
  if (!Number.isFinite(amount)) return notSet
  return `OMR ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount)}`
}
