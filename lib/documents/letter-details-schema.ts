export type LetterFieldType = "text" | "date" | "textarea" | "select"

export type LetterFieldOption = {
  value: string
  label: string
}

export type LetterFieldConfig = {
  key: string
  label: string
  description?: string
  placeholder?: string
  type: LetterFieldType
  options?: LetterFieldOption[]
  templateToken: string
}

export type LetterDetailsSchema = {
  documentType: string
  title: string
  description: string
  fields: LetterFieldConfig[]
  buildText: (values: Record<string, string>) => string
  parseValuesFromText?: (text: string) => Record<string, string>
}

// 1. NCR Schema (Phase 1)
export const NCR_LETTER_DETAILS_SCHEMA: LetterDetailsSchema = {
  documentType: "ncr",
  title: "Letter Details — Non-Conformance Report",
  description: "Fill in the structured fields below to automatically update the letter text.",
  fields: [
    {
      key: "issue",
      label: "Non-Conformance Issue",
      description: "Briefly describe what does not comply with the approved drawing, specification, or requirement.",
      placeholder: "e.g. Concrete compressive strength below specified requirement",
      type: "text",
      templateToken: "[describe the non-conformance issue]",
    },
    {
      key: "location",
      label: "Location / Area",
      description: "Where was the issue identified?",
      placeholder: "e.g. Ground Floor – Grid A4",
      type: "text",
      templateToken: "[location / area]",
    },
    {
      key: "inspectionDate",
      label: "Inspection Date",
      description: "Date when the issue was identified.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "activity",
      label: "Affected Work Activity",
      description: "Describe the work activity related to the issue.",
      placeholder: "e.g. Pouring of Ground Floor Columns",
      type: "text",
      templateToken: "[describe activity]",
    },
    {
      key: "observedIssue",
      label: "Observed Issue",
      description: "Describe what was actually observed on site.",
      placeholder: "e.g. Honeycombing observed at the base of column C2 after formwork removal...",
      type: "textarea",
      templateToken: "[describe the observed issue]",
    },
    {
      key: "correctiveAction",
      label: "Required Corrective Action",
      description: "Describe the action required to resolve the issue.",
      placeholder: "e.g. Chipping loose concrete, clean with air blower, apply structural epoxy mortar...",
      type: "textarea",
      templateToken: "[describe required corrective action]",
    },
    {
      key: "responsibleParty",
      label: "Responsible Party",
      description: "Company or person responsible for corrective action.",
      placeholder: "e.g. Main Contractor / Concrete Team",
      type: "text",
      templateToken: "[company / person]",
    },
    {
      key: "targetCompletionDate",
      label: "Target Completion Date",
      description: "Target date to complete the corrective action.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "status",
      label: "NCR Status",
      description: "Current status of this NCR.",
      type: "select",
      options: [
        { value: "Open", label: "Open" },
        { value: "Under Review", label: "Under Review" },
        { value: "Closed", label: "Closed" },
      ],
      templateToken: "[Open / Under Review / Closed]",
    },
  ],
  buildText: (values: Record<string, string>) => {
    const issue = values.issue?.trim() || "[describe the non-conformance issue]"
    const location = values.location?.trim() || "[location / area]"
    const inspectionDate = values.inspectionDate?.trim() || "[date]"
    const activity = values.activity?.trim() || "[describe activity]"
    const observedIssue = values.observedIssue?.trim() || "[describe the observed issue]"
    const correctiveAction = values.correctiveAction?.trim() || "[describe required corrective action]"
    const responsibleParty = values.responsibleParty?.trim() || "[company / person]"
    const targetCompletionDate = values.targetCompletionDate?.trim() || "[date]"
    const status = values.status?.trim() || "[Open / Under Review / Closed]"

    return `This NCR has been issued regarding ${issue}.

The issue was identified at ${location} on ${inspectionDate}.

The affected work activity is ${activity}.

The details of the non-conformance are:
${observedIssue}.

The required corrective action is:
${correctiveAction}.

The responsible party for corrective action is:
${responsibleParty}.

The target completion date is:
${targetCompletionDate}.

Current status of this NCR is:
${status}.`
  },
  parseValuesFromText: (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    if (!text) return result

    const issueMatch = text.match(/This NCR has been issued regarding (.*?)\.\s*\n/i)
    if (issueMatch && issueMatch[1] && !issueMatch[1].includes("[describe")) {
      result.issue = issueMatch[1].trim()
    }

    const locDateMatch = text.match(/The issue was identified at (.*?) on (.*?)\.\s*\n/i)
    if (locDateMatch) {
      if (locDateMatch[1] && !locDateMatch[1].includes("[location")) {
        result.location = locDateMatch[1].trim()
      }
      if (locDateMatch[2] && !locDateMatch[2].includes("[date]")) {
        result.inspectionDate = locDateMatch[2].trim()
      }
    }

    const actMatch = text.match(/The affected work activity is (.*?)\.\s*\n/i)
    if (actMatch && actMatch[1] && !actMatch[1].includes("[describe")) {
      result.activity = actMatch[1].trim()
    }

    const obsMatch = text.match(/The details of the non-conformance are:\s*\n(.*?)\.\s*\n/is)
    if (obsMatch && obsMatch[1] && !obsMatch[1].includes("[describe")) {
      result.observedIssue = obsMatch[1].trim()
    }

    const corrMatch = text.match(/The required corrective action is:\s*\n(.*?)\.\s*\n/is)
    if (corrMatch && corrMatch[1] && !corrMatch[1].includes("[describe")) {
      result.correctiveAction = corrMatch[1].trim()
    }

    const respMatch = text.match(/The responsible party for corrective action is:\s*\n(.*?)\.\s*\n/is)
    if (respMatch && respMatch[1] && !respMatch[1].includes("[company")) {
      result.responsibleParty = respMatch[1].trim()
    }

    const targetMatch = text.match(/The target completion date is:\s*\n(.*?)\.\s*\n/is)
    if (targetMatch && targetMatch[1] && !targetMatch[1].includes("[date]")) {
      result.targetCompletionDate = targetMatch[1].trim()
    }

    const statusMatch = text.match(/Current status of this NCR is:\s*\n(.*?)\./i)
    if (statusMatch && statusMatch[1] && !statusMatch[1].includes("[Open")) {
      result.status = statusMatch[1].trim()
    }

    return result
  },
}

// 2. RFI Schema (Request for Information)
export const RFI_LETTER_DETAILS_SCHEMA: LetterDetailsSchema = {
  documentType: "request_for_information",
  title: "Letter Details — Request for Information (RFI)",
  description: "Fill in the clarification details below to automatically update the RFI letter text.",
  fields: [
    {
      key: "subject",
      label: "RFI Subject / Topic",
      description: "Briefly describe the subject or topic requiring clarification.",
      placeholder: "e.g. Structural drawing ambiguity at Grid B3",
      type: "text",
      templateToken: "[describe the subject]",
    },
    {
      key: "question",
      label: "Clarification / Question",
      description: "State the specific question or details needing clarification from the consultant/engineer.",
      placeholder: "e.g. Please clarify the required rebar lap length for MEP penetration through beam B2...",
      type: "textarea",
      templateToken: "[write the question or required information]",
    },
    {
      key: "submittedBy",
      label: "Submitted By",
      description: "Name or company submitting this Request for Information.",
      placeholder: "e.g. Main Contractor / Engineering Department",
      type: "text",
      templateToken: "[name / company]",
    },
    {
      key: "submissionDate",
      label: "Submission Date",
      description: "Date when this RFI is officially submitted.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "requiredResponseDate",
      label: "Required Response Date",
      description: "Target date for receiving the required clarification.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "receivedResponse",
      label: "Received Response / Clarification",
      description: "Official response or clarification received from the consultant or engineer.",
      placeholder: "e.g. Refer to revised structural detail drawing ST-204 Rev B for rebar lap length...",
      type: "textarea",
      templateToken: "[write response]",
    },
    {
      key: "status",
      label: "RFI Status",
      description: "Current tracking status of this Request for Information.",
      type: "select",
      options: [
        { value: "Open", label: "Open" },
        { value: "Answered", label: "Answered" },
        { value: "Closed", label: "Closed" },
      ],
      templateToken: "[Open / Answered / Closed]",
    },
  ],
  buildText: (values: Record<string, string>) => {
    const subject = values.subject?.trim() || "[describe the subject]"
    const question = values.question?.trim() || "[write the question or required information]"
    const submittedBy = values.submittedBy?.trim() || "[name / company]"
    const submissionDate = values.submissionDate?.trim() || "[date]"
    const requiredResponseDate = values.requiredResponseDate?.trim() || "[date]"
    const receivedResponse = values.receivedResponse?.trim() || "[write response]"
    const status = values.status?.trim() || "[Open / Answered / Closed]"

    return `This Request for Information (RFI) has been raised regarding:
${subject}.

The clarification required is:

${question}.

This request was submitted by:
${submittedBy}.

Submission date:
${submissionDate}.

Required response date:
${requiredResponseDate}.

Received response / clarification:

${receivedResponse}.

Current status:
${status}.`
  },
  parseValuesFromText: (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    if (!text) return result

    const subjectMatch = text.match(/This Request for Information \(RFI\) has been raised regarding:\s*\n(.*?)\.\s*\n/i)
    if (subjectMatch && subjectMatch[1] && !subjectMatch[1].includes("[describe")) {
      result.subject = subjectMatch[1].trim()
    }

    const questionMatch = text.match(/The clarification required is:\s*\n\s*(.*?)\s*\n\s*This request was submitted by:/is)
    if (questionMatch && questionMatch[1] && !questionMatch[1].includes("[write")) {
      result.question = questionMatch[1].trim()
    }

    const submittedByMatch = text.match(/This request was submitted by:\s*\n(.*?)\.\s*\n/i)
    if (submittedByMatch && submittedByMatch[1] && !submittedByMatch[1].includes("[name")) {
      result.submittedBy = submittedByMatch[1].trim()
    }

    const subDateMatch = text.match(/Submission date:\s*\n(.*?)\.\s*\n/i)
    if (subDateMatch && subDateMatch[1] && !subDateMatch[1].includes("[date]")) {
      result.submissionDate = subDateMatch[1].trim()
    }

    const reqDateMatch = text.match(/Required response date:\s*\n(.*?)\.\s*\n/i)
    if (reqDateMatch && reqDateMatch[1] && !reqDateMatch[1].includes("[date]")) {
      result.requiredResponseDate = reqDateMatch[1].trim()
    }

    const respMatch = text.match(/Received response \/ clarification:\s*\n\s*(.*?)\s*\n\s*Current status:/is)
    if (respMatch && respMatch[1] && !respMatch[1].includes("[write")) {
      result.receivedResponse = respMatch[1].trim()
    }

    const statusMatch = text.match(/Current status:\s*\n(.*?)\./i)
    if (statusMatch && statusMatch[1] && !statusMatch[1].includes("[Open")) {
      result.status = statusMatch[1].trim()
    }

    return result
  },
}

// 3. WIR / IR Schema (Work Inspection Request)
export const WIR_LETTER_DETAILS_SCHEMA: LetterDetailsSchema = {
  documentType: "wir_ir",
  title: "Letter Details — Work Inspection Request (WIR)",
  description: "Fill in the work inspection details below to automatically update the WIR letter text.",
  fields: [
    {
      key: "activity",
      label: "Work Activity",
      description: "Describe the specific work activity submitted for inspection.",
      placeholder: "e.g. Formwork and rebar installation for slab S1",
      type: "text",
      templateToken: "[describe work activity]",
    },
    {
      key: "location",
      label: "Inspection Location",
      description: "Where on site the inspection is taking place.",
      placeholder: "e.g. First Floor – Sector B",
      type: "text",
      templateToken: "[location]",
    },
    {
      key: "inspectionDate",
      label: "Inspection Date",
      description: "Scheduled or actual date of the work inspection.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "inspectedWorks",
      label: "Inspected Works Scope",
      description: "Detailed description of elements, materials, or items being inspected.",
      placeholder: "e.g. Reinforcement steel spacing, cover blocks, formwork alignment...",
      type: "textarea",
      templateToken: "[describe inspected works]",
    },
    {
      key: "inspectionResult",
      label: "Inspection Result",
      description: "Official result of the work inspection.",
      type: "select",
      options: [
        { value: "Approved", label: "Approved" },
        { value: "Approved with Comments", label: "Approved with Comments" },
        { value: "Rejected", label: "Rejected" },
      ],
      templateToken: "[Approved / Rejected / Approved with Comments]",
    },
    {
      key: "comments",
      label: "Inspection Comments",
      description: "Notes, site observations, or conditions attached to the inspection result.",
      placeholder: "e.g. Approved subject to cleaning formwork before concrete pour...",
      type: "textarea",
      templateToken: "[write comments]",
    },
    {
      key: "status",
      label: "WIR Status",
      description: "Current tracking status of this inspection request.",
      type: "select",
      options: [
        { value: "Submitted", label: "Submitted" },
        { value: "In Progress", label: "In Progress" },
        { value: "Approved", label: "Approved" },
        { value: "Rejected", label: "Rejected" },
        { value: "Closed", label: "Closed" },
      ],
      templateToken: "[status]",
    },
  ],
  buildText: (values: Record<string, string>) => {
    const activity = values.activity?.trim() || "[describe work activity]"
    const location = values.location?.trim() || "[location]"
    const inspectionDate = values.inspectionDate?.trim() || "[date]"
    const inspectedWorks = values.inspectedWorks?.trim() || "[describe inspected works]"
    const inspectionResult = values.inspectionResult?.trim() || "[Approved / Rejected / Approved with Comments]"
    const comments = values.comments?.trim() || "[write comments]"
    const status = values.status?.trim() || "[status]"

    return `This Work Inspection Request is submitted for inspection of:
${activity}.

Inspection location:
${location}.

Inspection date:
${inspectionDate}.

The inspected works include:

${inspectedWorks}.

Inspection result:

${inspectionResult}.

Inspection comments:

${comments}.

Current status:
${status}.`
  },
  parseValuesFromText: (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    if (!text) return result

    const actMatch = text.match(/This Work Inspection Request is submitted for inspection of:\s*\n(.*?)\.\s*\n/i)
    if (actMatch && actMatch[1] && !actMatch[1].includes("[describe")) {
      result.activity = actMatch[1].trim()
    }

    const locMatch = text.match(/Inspection location:\s*\n(.*?)\.\s*\n/i)
    if (locMatch && locMatch[1] && !locMatch[1].includes("[location")) {
      result.location = locMatch[1].trim()
    }

    const dateMatch = text.match(/Inspection date:\s*\n(.*?)\.\s*\n/i)
    if (dateMatch && dateMatch[1] && !dateMatch[1].includes("[date]")) {
      result.inspectionDate = dateMatch[1].trim()
    }

    const worksMatch = text.match(/The inspected works include:\s*\n\s*(.*?)\s*\n\s*Inspection result:/is)
    if (worksMatch && worksMatch[1] && !worksMatch[1].includes("[describe")) {
      result.inspectedWorks = worksMatch[1].trim()
    }

    const resMatch = text.match(/Inspection result:\s*\n\s*(.*?)\s*\n\s*Inspection comments:/is)
    if (resMatch && resMatch[1] && !resMatch[1].includes("[Approved")) {
      result.inspectionResult = resMatch[1].trim()
    }

    const commMatch = text.match(/Inspection comments:\s*\n\s*(.*?)\s*\n\s*Current status:/is)
    if (commMatch && commMatch[1] && !commMatch[1].includes("[write")) {
      result.comments = commMatch[1].trim()
    }

    const statusMatch = text.match(/Current status:\s*\n(.*?)\./i)
    if (statusMatch && statusMatch[1] && !statusMatch[1].includes("[status")) {
      result.status = statusMatch[1].trim()
    }

    return result
  },
}

// 4. MIR Schema (Material Inspection Request)
export const MIR_LETTER_DETAILS_SCHEMA: LetterDetailsSchema = {
  documentType: "material_inspection_request",
  title: "Letter Details — Material Inspection Request (MIR)",
  description: "Fill in the material submittal details below to automatically update the MIR letter text.",
  fields: [
    {
      key: "materialName",
      label: "Material Name",
      description: "Name and description of the delivered material submitted for inspection.",
      placeholder: "e.g. High-density polyethylene (HDPE) drainage pipes 110mm",
      type: "text",
      templateToken: "[material name]",
    },
    {
      key: "supplier",
      label: "Supplier / Manufacturer",
      description: "Company or manufacturer providing the material.",
      placeholder: "e.g. Al Bawardi Building Materials Co.",
      type: "text",
      templateToken: "[company name]",
    },
    {
      key: "materialDetails",
      label: "Material Specifications & Details",
      description: "Technical specifications, batch numbers, compliance certificates, or quantities.",
      placeholder: "e.g. Grade A pipes conforming to BS EN 1329 with mill test certificates...",
      type: "textarea",
      templateToken: "[write material details]",
    },
    {
      key: "deliveryDate",
      label: "Delivery Date",
      description: "Date when materials were delivered to the site.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "inspectionResult",
      label: "Inspection Result",
      description: "Official material approval decision.",
      type: "select",
      options: [
        { value: "Approved", label: "Approved" },
        { value: "Approved with Comments", label: "Approved with Comments" },
        { value: "Rejected", label: "Rejected" },
      ],
      templateToken: "[Approved / Rejected / Approved with Comments]",
    },
    {
      key: "remarks",
      label: "Additional Remarks",
      description: "Additional notes regarding storage, sample testing, or conditional approval.",
      placeholder: "e.g. Material approved for installation in Basement Level 1 only...",
      type: "textarea",
      templateToken: "[write remarks]",
    },
  ],
  buildText: (values: Record<string, string>) => {
    const materialName = values.materialName?.trim() || "[material name]"
    const supplier = values.supplier?.trim() || "[company name]"
    const materialDetails = values.materialDetails?.trim() || "[write material details]"
    const deliveryDate = values.deliveryDate?.trim() || "[date]"
    const inspectionResult = values.inspectionResult?.trim() || "[Approved / Rejected / Approved with Comments]"
    const remarks = values.remarks?.trim() || "[write remarks]"

    return `This Material Inspection Request is submitted for approval of:

${materialName}.

Supplier / Manufacturer:

${supplier}.

Material details and specifications:

${materialDetails}.

Delivery date:

${deliveryDate}.

Inspection result:

${inspectionResult}.

Additional remarks:

${remarks}.`
  },
  parseValuesFromText: (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    if (!text) return result

    const matMatch = text.match(/This Material Inspection Request is submitted for approval of:\s*\n\s*(.*?)\s*\n\s*Supplier \/ Manufacturer:/is)
    if (matMatch && matMatch[1] && !matMatch[1].includes("[material")) {
      result.materialName = matMatch[1].trim()
    }

    const supMatch = text.match(/Supplier \/ Manufacturer:\s*\n\s*(.*?)\s*\n\s*Material details and specifications:/is)
    if (supMatch && supMatch[1] && !supMatch[1].includes("[company")) {
      result.supplier = supMatch[1].trim()
    }

    const detMatch = text.match(/Material details and specifications:\s*\n\s*(.*?)\s*\n\s*Delivery date:/is)
    if (detMatch && detMatch[1] && !detMatch[1].includes("[write")) {
      result.materialDetails = detMatch[1].trim()
    }

    const delDateMatch = text.match(/Delivery date:\s*\n\s*(.*?)\s*\n\s*Inspection result:/is)
    if (delDateMatch && delDateMatch[1] && !delDateMatch[1].includes("[date]")) {
      result.deliveryDate = delDateMatch[1].trim()
    }

    const resMatch = text.match(/Inspection result:\s*\n\s*(.*?)\s*\n\s*Additional remarks:/is)
    if (resMatch && resMatch[1] && !resMatch[1].includes("[Approved")) {
      result.inspectionResult = resMatch[1].trim()
    }

    const remMatch = text.match(/Additional remarks:\s*\n\s*(.*?)\s*$/is)
    if (remMatch && remMatch[1] && !remMatch[1].includes("[write")) {
      result.remarks = remMatch[1].trim()
    }

    return result
  },
}

// 5. Inspection Report Schema
export const INSPECTION_LETTER_DETAILS_SCHEMA: LetterDetailsSchema = {
  documentType: "inspection_report",
  title: "Letter Details — Inspection Report",
  description: "Fill in the inspection report details below to automatically update the letter text.",
  fields: [
    {
      key: "location",
      label: "Project / Location",
      description: "Specific site location or project area inspected.",
      placeholder: "e.g. Building A – Roof Level",
      type: "text",
      templateToken: "[Enter project name or location]",
    },
    {
      key: "inspectionDate",
      label: "Inspection Date",
      description: "Date on which the inspection was conducted.",
      type: "date",
      templateToken: "[Enter inspection date]",
    },
    {
      key: "inspectionType",
      label: "Inspection Type",
      description: "Category of inspection (e.g. Structural, MEP, Safety, Architectural).",
      placeholder: "e.g. Structural Steel Welding Inspection",
      type: "text",
      templateToken: "[Enter type of inspection]",
    },
    {
      key: "inspectorName",
      label: "Inspected By",
      description: "Name and title of the inspector conducting the site visit.",
      placeholder: "e.g. Eng. Ahmed Al-Mansoor (Senior QA/QC)",
      type: "text",
      templateToken: "[Enter inspector name]",
    },
    {
      key: "findings",
      label: "Inspection Findings",
      description: "Detailed observations, test results, or general condition of inspected elements.",
      placeholder: "e.g. All main beam welds inspected visually and via NDT. Full penetration achieved...",
      type: "textarea",
      templateToken: "[Describe inspection observations and findings]",
    },
    {
      key: "nonConformities",
      label: "Non-Conformities Identified",
      description: "Any defects, deviations, or non-conformance identified during inspection.",
      placeholder: "e.g. Minor undercut observed on beam joint B-12 weld seam...",
      type: "textarea",
      templateToken: "[Describe any non-conformance or issues found]",
    },
    {
      key: "requiredActions",
      label: "Required Actions",
      description: "Corrective steps required to address identified findings or defects.",
      placeholder: "e.g. Grind back defective weld section and re-weld per WPS-04...",
      type: "textarea",
      templateToken: "[Describe required corrective actions]",
    },
    {
      key: "recommendations",
      label: "Recommendations",
      description: "Inspector recommendations for quality assurance or preventive measures.",
      placeholder: "e.g. Increase pre-heating temperature for outdoor welding during high wind...",
      type: "textarea",
      templateToken: "[Enter recommendations]",
    },
    {
      key: "status",
      label: "Inspection Status",
      description: "Overall status of the inspection report.",
      type: "select",
      options: [
        { value: "Open", label: "Open" },
        { value: "Under Review", label: "Under Review" },
        { value: "Closed", label: "Closed" },
      ],
      templateToken: "[Open / Under Review / Closed]",
    },
    {
      key: "additionalComments",
      label: "Additional Comments",
      description: "Any extra notes, reference standards, or attached test logs.",
      placeholder: "e.g. NDT ultrasonic inspection report attached under document ref UT-882.",
      type: "textarea",
      templateToken: "[Add any additional notes]",
    },
  ],
  buildText: (values: Record<string, string>) => {
    const location = values.location?.trim() || "[Enter project name or location]"
    const inspectionDate = values.inspectionDate?.trim() || "[Enter inspection date]"
    const inspectionType = values.inspectionType?.trim() || "[Enter type of inspection]"
    const inspectorName = values.inspectorName?.trim() || "[Enter inspector name]"
    const findings = values.findings?.trim() || "[Describe inspection observations and findings]"
    const nonConformities = values.nonConformities?.trim() || "[Describe any non-conformance or issues found]"
    const requiredActions = values.requiredActions?.trim() || "[Describe required corrective actions]"
    const recommendations = values.recommendations?.trim() || "[Enter recommendations]"
    const status = values.status?.trim() || "[Open / Under Review / Closed]"
    const additionalComments = values.additionalComments?.trim() || "[Add any additional notes]"

    return `Inspection Report

Project / Location:
${location}

Inspection Date:
${inspectionDate}

Inspection Type:
${inspectionType}

Inspected By:
${inspectorName}

Inspection Findings:
${findings}

Non-Conformities Identified:
${nonConformities}

Required Actions:
${requiredActions}

Recommendations:
${recommendations}

Inspection Status:
${status}

Additional Comments:
${additionalComments}`
  },
  parseValuesFromText: (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    if (!text) return result

    const locMatch = text.match(/Project \/ Location:\s*\n(.*?)\s*\n/i)
    if (locMatch && locMatch[1] && !locMatch[1].includes("[Enter")) {
      result.location = locMatch[1].trim()
    }

    const dateMatch = text.match(/Inspection Date:\s*\n(.*?)\s*\n/i)
    if (dateMatch && dateMatch[1] && !dateMatch[1].includes("[Enter")) {
      result.inspectionDate = dateMatch[1].trim()
    }

    const typeMatch = text.match(/Inspection Type:\s*\n(.*?)\s*\n/i)
    if (typeMatch && typeMatch[1] && !typeMatch[1].includes("[Enter")) {
      result.inspectionType = typeMatch[1].trim()
    }

    const inspMatch = text.match(/Inspected By:\s*\n(.*?)\s*\n/i)
    if (inspMatch && inspMatch[1] && !inspMatch[1].includes("[Enter")) {
      result.inspectorName = inspMatch[1].trim()
    }

    const findMatch = text.match(/Inspection Findings:\s*\n\s*(.*?)\s*\n\s*Non-Conformities Identified:/is)
    if (findMatch && findMatch[1] && !findMatch[1].includes("[Describe")) {
      result.findings = findMatch[1].trim()
    }

    const nonConfMatch = text.match(/Non-Conformities Identified:\s*\n\s*(.*?)\s*\n\s*Required Actions:/is)
    if (nonConfMatch && nonConfMatch[1] && !nonConfMatch[1].includes("[Describe")) {
      result.nonConformities = nonConfMatch[1].trim()
    }

    const reqActMatch = text.match(/Required Actions:\s*\n\s*(.*?)\s*\n\s*Recommendations:/is)
    if (reqActMatch && reqActMatch[1] && !reqActMatch[1].includes("[Describe")) {
      result.requiredActions = reqActMatch[1].trim()
    }

    const recMatch = text.match(/Recommendations:\s*\n\s*(.*?)\s*\n\s*Inspection Status:/is)
    if (recMatch && recMatch[1] && !recMatch[1].includes("[Enter")) {
      result.recommendations = recMatch[1].trim()
    }

    const statMatch = text.match(/Inspection Status:\s*\n(.*?)\s*\n/i)
    if (statMatch && statMatch[1] && !statMatch[1].includes("[Open")) {
      result.status = statMatch[1].trim()
    }

    const commMatch = text.match(/Additional Comments:\s*\n\s*(.*?)\s*$/is)
    if (commMatch && commMatch[1] && !commMatch[1].includes("[Add")) {
      result.additionalComments = commMatch[1].trim()
    }

    return result
  },
}

export const LETTER_DETAILS_SCHEMAS: Record<string, LetterDetailsSchema> = {
  ncr: NCR_LETTER_DETAILS_SCHEMA,
  non_conformance_report: NCR_LETTER_DETAILS_SCHEMA,

  request_for_information: RFI_LETTER_DETAILS_SCHEMA,
  rfi: RFI_LETTER_DETAILS_SCHEMA,

  wir_ir: WIR_LETTER_DETAILS_SCHEMA,
  work_inspection_request: WIR_LETTER_DETAILS_SCHEMA,

  material_inspection_request: MIR_LETTER_DETAILS_SCHEMA,
  mir: MIR_LETTER_DETAILS_SCHEMA,

  inspection_report: INSPECTION_LETTER_DETAILS_SCHEMA,
  inspection: INSPECTION_LETTER_DETAILS_SCHEMA,
}

export function getLetterDetailsSchema(documentType: string | null | undefined): LetterDetailsSchema | null {
  if (!documentType) return null
  return LETTER_DETAILS_SCHEMAS[documentType] ?? null
}
