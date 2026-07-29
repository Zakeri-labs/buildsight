import type { DocumentTypeValue } from "@/lib/documents/document-types"

export const CONSTRUCTION_DOCUMENT_TYPES = [
  { value: "ncr", label: "NCR - Non-Conformance Report", shortLabel: "NCR" },
  { value: "request_for_information", label: "RFI - Request for Information", shortLabel: "RFI" },
  { value: "wir_ir", label: "WIR / IR - Work Inspection Request", shortLabel: "WIR / IR" },
  { value: "material_inspection_request", label: "MIR - Material Inspection Request", shortLabel: "MIR" },
  { value: "ipc", label: "IPC - Interim Payment Certificate", shortLabel: "IPC" },
  { value: "variation_order", label: "VO - Variation Order", shortLabel: "VO" },
  { value: "other", label: "General Documents", shortLabel: "General" },
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
