import type { DocumentTypeValue } from "@/lib/documents/document-types"

export const CONSTRUCTION_DOCUMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  ncr: "NCR - Non-Conformance Report",
  non_conformance_report: "NCR - Non-Conformance Report",
  request_for_information: "RFI - Request for Information",
  wir_ir: "WIR / IR - Work Inspection Request",
  work_inspection_request: "WIR / IR - Work Inspection Request",
  material_inspection_request: "MIR - Material Inspection Request",
  ipc: "IPC - Interim Payment Certificate",
  interim_payment_certificate: "IPC - Interim Payment Certificate",
  variation_order: "VO - Variation Order",
  inspection_report: "Inspection",
  inspection: "Inspection",
  other: "General Documents",
  general_document: "General Documents",
}

export const CONSTRUCTION_DOCUMENT_TYPES = [
  { value: "ncr", label: CONSTRUCTION_DOCUMENT_TYPE_LABELS.ncr, shortLabel: "NCR" },
  { value: "request_for_information", label: CONSTRUCTION_DOCUMENT_TYPE_LABELS.request_for_information, shortLabel: "RFI" },
  { value: "wir_ir", label: CONSTRUCTION_DOCUMENT_TYPE_LABELS.wir_ir, shortLabel: "WIR / IR" },
  { value: "material_inspection_request", label: CONSTRUCTION_DOCUMENT_TYPE_LABELS.material_inspection_request, shortLabel: "MIR" },
  { value: "ipc", label: CONSTRUCTION_DOCUMENT_TYPE_LABELS.ipc, shortLabel: "IPC" },
  { value: "variation_order", label: CONSTRUCTION_DOCUMENT_TYPE_LABELS.variation_order, shortLabel: "VO" },
  { value: "inspection_report", label: CONSTRUCTION_DOCUMENT_TYPE_LABELS.inspection_report, shortLabel: "Inspection" },
  { value: "other", label: CONSTRUCTION_DOCUMENT_TYPE_LABELS.other, shortLabel: "General" },
] as const satisfies ReadonlyArray<{ value: DocumentTypeValue; label: string; shortLabel: string }>

export type ConstructionDocumentTypeValue = (typeof CONSTRUCTION_DOCUMENT_TYPES)[number]["value"]

const VALUES = new Set<string>(CONSTRUCTION_DOCUMENT_TYPES.map((type) => type.value))
const BY_VALUE = new Map(CONSTRUCTION_DOCUMENT_TYPES.map((type) => [type.value, type]))

export function isConstructionDocumentType(value: unknown): value is ConstructionDocumentTypeValue {
  return typeof value === "string" && VALUES.has(value)
}

export function getConstructionDocumentType(value: unknown) {
  return isConstructionDocumentType(value) ? BY_VALUE.get(value)! : null
}

export function getConstructionDocumentTypeLabel(value: unknown): string | null {
  if (typeof value !== "string") return null
  return CONSTRUCTION_DOCUMENT_TYPE_LABELS[value] ?? null
}

export const DOCUMENT_DETAIL_TEMPLATES: Record<ConstructionDocumentTypeValue, string> = {
  ncr: `This NCR has been issued regarding [describe the non-conformance issue].

The issue was identified at [location / area] on [date].

The affected work activity is [describe activity].

The details of the non-conformance are:
[describe the observed issue].

The required corrective action is:
[describe required corrective action].

The responsible party for corrective action is:
[company / person].

The target completion date is:
[date].

Current status of this NCR is:
[Open / Under Review / Closed].`,
  request_for_information: `This Request for Information (RFI) has been raised regarding:
[describe the subject].

The clarification required is:

[write the question or required information].

This request was submitted by:
[name / company].

Submission date:
[date].

Required response date:
[date].

Received response / clarification:

[write response].

Current status:
[Open / Answered / Closed].`,
  wir_ir: `This Work Inspection Request is submitted for inspection of:
[describe work activity].

Inspection location:
[location].

Inspection date:
[date].

The inspected works include:

[describe inspected works].

Inspection result:

[Approved / Rejected / Approved with Comments].

Inspection comments:

[write comments].

Current status:
[status].`,
  material_inspection_request: `This Material Inspection Request is submitted for approval of:

[material name].

Supplier / Manufacturer:

[company name].

Material details and specifications:

[write material details].

Delivery date:

[date].

Inspection result:

[Approved / Rejected / Approved with Comments].

Additional remarks:

[write remarks].`,
  ipc: `This Interim Payment Certificate relates to payment period:

[period].

Submitted amount:

[amount].

Certified amount:

[amount].

The completed works during this period include:

[describe completed works].

Certification status:

[Approved / Under Review / Rejected].

Additional remarks:

[write remarks].`,
  variation_order: `This Variation Order relates to:

[describe variation].

The reason for this variation is:

[explain reason].

The impact on project cost is:

[describe cost impact].

The impact on project schedule is:

[describe time impact].

Approval status:

[Approved / Pending / Rejected].

Additional remarks:

[write remarks].`,
  inspection_report: `Inspection Report

Project / Location:
[Enter project name or location]

Inspection Date:
[Enter inspection date]

Inspection Type:
[Enter type of inspection]

Inspected By:
[Enter inspector name]

Inspection Findings:
[Describe inspection observations and findings]

Non-Conformities Identified:
[Describe any non-conformance or issues found]

Required Actions:
[Describe required corrective actions]

Recommendations:
[Enter recommendations]

Inspection Status:
[Open / Under Review / Closed]

Additional Comments:
[Add any additional notes]`,
  other: `This document relates to:

[describe document purpose].

The document contains information regarding:

[write document details].

Additional notes:

[write notes].`,
}

export function getDocumentDetailsTemplate(value: ConstructionDocumentTypeValue): string {
  return DOCUMENT_DETAIL_TEMPLATES[value]
}
