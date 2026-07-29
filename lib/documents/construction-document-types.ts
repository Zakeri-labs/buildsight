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

The required corrective action is [describe required action].

The responsible party for corrective action is [company / person].

The target completion date is [date].

Current status of this NCR is [open / under review / closed].`,
  request_for_information: `This Request for Information (RFI) has been raised regarding [subject].

The clarification required is:
[describe the question or required information].

The request was submitted by [name / company] on [date].

The required response date is [date].

The received response / clarification is:
[write response].

Current status is [open / answered / closed].`,
  wir_ir: `This Work Inspection Request is submitted for inspection of [work activity].

The inspection location is [location].

The inspection date is [date].

The inspected works include:
[describe inspected works].

Inspection result:
[approved / rejected / approved with comments].

Additional comments:
[write comments].`,
  material_inspection_request: `This Material Inspection Request is submitted for approval of [material name].

The supplier / manufacturer is [company name].

Material details and specifications:
[write details].

The delivery date is [date].

Inspection result:
[approved / rejected / approved with comments].

Additional remarks:
[write remarks].`,
  ipc: `This Interim Payment Certificate relates to payment period [period].

The submitted amount is [amount].

The certified amount is [amount].

The works completed during this period include:
[describe completed works].

The certification status is [approved / under review / rejected].

Additional remarks:
[write remarks].`,
  variation_order: `This Variation Order relates to [describe variation].

The reason for this variation is:
[explain reason].

The impact on project cost is:
[describe cost impact].

The impact on project schedule is:
[describe time impact].

Approval status:
[approved / pending / rejected].

Additional remarks:
[write remarks].`,
  other: `This document relates to [describe document purpose].

The document contains information regarding:
[write details].

Additional notes:
[write notes].`,
}

export function getDocumentDetailsTemplate(value: ConstructionDocumentTypeValue): string {
  return DOCUMENT_DETAIL_TEMPLATES[value]
}
