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

// 1. NCR Schema (Non-Conformance Report)
export const NCR_LETTER_DETAILS_SCHEMA: LetterDetailsSchema = {
  documentType: "ncr",
  title: "Letter Details — Non-Conformance Report",
  description: "Fill in the structured fields below to automatically update the letter text.",
  fields: [
    {
      key: "issue",
      label: "Non-Conformance Issue",
      description: "Briefly describe what does not comply with the approved drawing, specification, or requirement.",
      type: "text",
      templateToken: "[describe the non-conformance issue]",
    },
    {
      key: "location",
      label: "Location / Area",
      description: "Where was the issue identified?",
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
      type: "text",
      templateToken: "[describe activity]",
    },
    {
      key: "observedIssue",
      label: "Observed Issue",
      description: "Describe what was actually observed on site.",
      type: "textarea",
      templateToken: "[describe the observed issue]",
    },
    {
      key: "correctiveAction",
      label: "Required Corrective Action",
      description: "Describe the action required to resolve the issue.",
      type: "textarea",
      templateToken: "[describe required corrective action]",
    },
    {
      key: "responsibleParty",
      label: "Responsible Party",
      description: "Company or person responsible for corrective action.",
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
      label: "Information Subject",
      description: "Main topic or subject of the request for information.",
      type: "text",
      templateToken: "[subject / topic of request]",
    },
    {
      key: "question",
      label: "Question / Clarification Requested",
      description: "Detailed description of the technical or design question.",
      type: "textarea",
      templateToken: "[describe the technical or design question]",
    },
    {
      key: "submittedBy",
      label: "Submitted By",
      description: "Company, department, or engineer submitting the RFI.",
      type: "text",
      templateToken: "[company / department]",
    },
    {
      key: "submissionDate",
      label: "Submission Date",
      description: "Date when the RFI was formally submitted.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "requiredResponseDate",
      label: "Required Response Date",
      description: "Target response date required to prevent site delay.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "receivedResponse",
      label: "Engineer / Consultant Response",
      description: "Official response, instruction, or clarification provided by the Consultant.",
      type: "textarea",
      templateToken: "[details of the consultant's response]",
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
    const subject = values.subject?.trim() || "[subject / topic of request]"
    const question = values.question?.trim() || "[describe the technical or design question]"
    const submittedBy = values.submittedBy?.trim() || "[company / department]"
    const submissionDate = values.submissionDate?.trim() || "[date]"
    const requiredResponseDate = values.requiredResponseDate?.trim() || "[date]"
    const receivedResponse = values.receivedResponse?.trim() || "[details of the consultant's response]"
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
    if (subjectMatch && subjectMatch[1] && !subjectMatch[1].includes("[subject")) {
      result.subject = subjectMatch[1].trim()
    }

    const questionMatch = text.match(/The clarification required is:\s*\n\s*(.*?)\s*\n\s*This request was submitted by:/is)
    if (questionMatch && questionMatch[1] && !questionMatch[1].includes("[describe")) {
      result.question = questionMatch[1].trim()
    }

    const submittedByMatch = text.match(/This request was submitted by:\s*\n(.*?)\.\s*\n/i)
    if (submittedByMatch && submittedByMatch[1] && !submittedByMatch[1].includes("[company")) {
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
    if (respMatch && respMatch[1] && !respMatch[1].includes("[details")) {
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
      label: "Inspection Work Activity",
      description: "Description of the work activity or element ready for inspection.",
      type: "text",
      templateToken: "[describe work activity / element]",
    },
    {
      key: "location",
      label: "Location / Area",
      description: "Exact site location, floor level, or grid reference.",
      type: "text",
      templateToken: "[location / floor / grid]",
    },
    {
      key: "inspectionDate",
      label: "Requested Inspection Date",
      description: "Date when site inspection was performed or requested.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "inspectedWorks",
      label: "Inspected Works Details",
      description: "Specific details of items presented for inspection.",
      type: "textarea",
      templateToken: "[describe inspected items / elements]",
    },
    {
      key: "inspectionResult",
      label: "Inspection Result",
      description: "Official result of the work inspection.",
      type: "select",
      options: [
        { value: "Approved", label: "Approved" },
        { value: "Approved as Noted", label: "Approved as Noted" },
        { value: "Rejected", label: "Rejected" },
        { value: "Pending Resubmission", label: "Pending Resubmission" },
      ],
      templateToken: "[Approved / Approved as Noted / Rejected]",
    },
    {
      key: "comments",
      label: "Inspector Remarks / Conditions",
      description: "Specific observations, conditions of approval, or required rectifications.",
      type: "textarea",
      templateToken: "[remarks / conditions / required actions]",
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
    const activity = values.activity?.trim() || "[describe work activity / element]"
    const location = values.location?.trim() || "[location / floor / grid]"
    const inspectionDate = values.inspectionDate?.trim() || "[date]"
    const inspectedWorks = values.inspectedWorks?.trim() || "[describe inspected items / elements]"
    const inspectionResult = values.inspectionResult?.trim() || "[Approved / Approved as Noted / Rejected]"
    const comments = values.comments?.trim() || "[remarks / conditions / required actions]"
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
    if (commMatch && commMatch[1] && !commMatch[1].includes("[remarks")) {
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
      label: "Material Name & Specification",
      description: "Full description, brand, or grade of the material.",
      type: "text",
      templateToken: "[material name / specification / grade]",
    },
    {
      key: "supplier",
      label: "Supplier / Manufacturer",
      description: "Name of supplier, vendor, or manufacturer.",
      type: "text",
      templateToken: "[supplier / manufacturer]",
    },
    {
      key: "materialDetails",
      label: "Delivery Details & Compliance",
      description: "Quantity, batch numbers, mill certificates, or compliance standards.",
      type: "textarea",
      templateToken: "[delivery details / mill certificates / standards]",
    },
    {
      key: "deliveryDate",
      label: "Delivery Date",
      description: "Date when material arrived on site.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "inspectionResult",
      label: "Inspection Status",
      description: "Outcome of physical inspection on site.",
      type: "select",
      options: [
        { value: "Accepted", label: "Accepted" },
        { value: "Accepted with Comments", label: "Accepted with Comments" },
        { value: "Rejected", label: "Rejected" },
      ],
      templateToken: "[Accepted / Accepted with Comments / Rejected]",
    },
    {
      key: "remarks",
      label: "Inspection Remarks",
      description: "Observations on material condition, storage requirements, or test requirements.",
      type: "textarea",
      templateToken: "[inspection observations / storage conditions]",
    },
  ],
  buildText: (values: Record<string, string>) => {
    const materialName = values.materialName?.trim() || "[material name / specification / grade]"
    const supplier = values.supplier?.trim() || "[supplier / manufacturer]"
    const materialDetails = values.materialDetails?.trim() || "[delivery details / mill certificates / standards]"
    const deliveryDate = values.deliveryDate?.trim() || "[date]"
    const inspectionResult = values.inspectionResult?.trim() || "[Accepted / Accepted with Comments / Rejected]"
    const remarks = values.remarks?.trim() || "[inspection observations / storage conditions]"

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
    if (supMatch && supMatch[1] && !supMatch[1].includes("[supplier")) {
      result.supplier = supMatch[1].trim()
    }

    const detMatch = text.match(/Material details and specifications:\s*\n\s*(.*?)\s*\n\s*Delivery date:/is)
    if (detMatch && detMatch[1] && !detMatch[1].includes("[delivery")) {
      result.materialDetails = detMatch[1].trim()
    }

    const delDateMatch = text.match(/Delivery date:\s*\n\s*(.*?)\s*\n\s*Inspection result:/is)
    if (delDateMatch && delDateMatch[1] && !delDateMatch[1].includes("[date]")) {
      result.deliveryDate = delDateMatch[1].trim()
    }

    const resMatch = text.match(/Inspection result:\s*\n\s*(.*?)\s*\n\s*Additional remarks:/is)
    if (resMatch && resMatch[1] && !resMatch[1].includes("[Accepted")) {
      result.inspectionResult = resMatch[1].trim()
    }

    const remMatch = text.match(/Additional remarks:\s*\n\s*(.*?)\s*$/is)
    if (remMatch && remMatch[1] && !remMatch[1].includes("[inspection")) {
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
      label: "Inspection Location / Area",
      description: "Exact site area, zone, or structural element inspected.",
      type: "text",
      templateToken: "[location / zone / element]",
    },
    {
      key: "inspectionDate",
      label: "Inspection Date",
      description: "Date of site inspection.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "activity",
      label: "Inspected Activity / Trade",
      description: "Construction trade or activity inspected.",
      type: "text",
      templateToken: "[trade / activity]",
    },
    {
      key: "inspectorName",
      label: "Inspector / Engineer Name",
      description: "Supervising engineer or QA/QC inspector name.",
      type: "text",
      templateToken: "[inspector / engineer name]",
    },
    {
      key: "observations",
      label: "Key Observations & Findings",
      description: "Detailed site findings, workmanship quality, or technical notes.",
      type: "textarea",
      templateToken: "[describe site findings / workmanship / observations]",
    },
    {
      key: "defects",
      label: "Identified Defects / Deficiencies",
      description: "Any observed defects, omissions, or non-compliant items.",
      type: "textarea",
      templateToken: "[describe defects / non-compliant items]",
    },
    {
      key: "rectification",
      label: "Required Rectification / Instructions",
      description: "Immediate corrective action or instructions issued to site team.",
      type: "textarea",
      templateToken: "[describe corrective action / instructions]",
    },
    {
      key: "recommendations",
      label: "Engineering Recommendations",
      description: "Preventative recommendations or follow-up site requirements.",
      type: "textarea",
      templateToken: "[describe preventative recommendations]",
    },
    {
      key: "inspectionStatus",
      label: "Overall Inspection Status",
      description: "Overall evaluation outcome for this inspection.",
      type: "select",
      options: [
        { value: "Satisfactory", label: "Satisfactory" },
        { value: "Satisfactory with Comments", label: "Satisfactory with Comments" },
        { value: "Unsatisfactory", label: "Unsatisfactory" },
        { value: "Re-inspection Required", label: "Re-inspection Required" },
      ],
      templateToken: "[Satisfactory / Satisfactory with Comments / Unsatisfactory]",
    },
    {
      key: "attachmentsNote",
      label: "Attachments / References",
      description: "Reference to attached photos, site sketches, or lab test reports.",
      type: "text",
      templateToken: "[photo / sketch / report references]",
    },
  ],
  buildText: (values: Record<string, string>) => {
    const location = values.location?.trim() || "[location / zone / element]"
    const inspectionDate = values.inspectionDate?.trim() || "[date]"
    const activity = values.activity?.trim() || "[trade / activity]"
    const inspectorName = values.inspectorName?.trim() || "[inspector / engineer name]"
    const observations = values.observations?.trim() || "[describe site findings / workmanship / observations]"
    const defects = values.defects?.trim() || "[describe defects / non-compliant items]"
    const rectification = values.rectification?.trim() || "[describe corrective action / instructions]"
    const recommendations = values.recommendations?.trim() || "[describe preventative recommendations]"
    const inspectionStatus = values.inspectionStatus?.trim() || "[Satisfactory / Satisfactory with Comments / Unsatisfactory]"
    const attachmentsNote = values.attachmentsNote?.trim() || "[photo / sketch / report references]"

    return `Inspection Report

Project / Location:
${location}

Inspection Date:
${inspectionDate}

Activity / Trade:
${activity}

Inspected By:
${inspectorName}

Key Observations:
${observations}

Identified Defects:
${defects}

Required Rectification:
${rectification}

Engineering Recommendations:
${recommendations}

Overall Status:
${inspectionStatus}

Attachments / References:
${attachmentsNote}`
  },
  parseValuesFromText: (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    if (!text) return result

    const locMatch = text.match(/Project \/ Location:\s*\n(.*?)\s*\n/i)
    if (locMatch && locMatch[1] && !locMatch[1].includes("[location")) {
      result.location = locMatch[1].trim()
    }

    const dateMatch = text.match(/Inspection Date:\s*\n(.*?)\s*\n/i)
    if (dateMatch && dateMatch[1] && !dateMatch[1].includes("[date]")) {
      result.inspectionDate = dateMatch[1].trim()
    }

    const actMatch = text.match(/Activity \/ Trade:\s*\n(.*?)\s*\n/i)
    if (actMatch && actMatch[1] && !actMatch[1].includes("[trade")) {
      result.activity = actMatch[1].trim()
    }

    const inspMatch = text.match(/Inspected By:\s*\n(.*?)\s*\n/i)
    if (inspMatch && inspMatch[1] && !inspMatch[1].includes("[inspector")) {
      result.inspectorName = inspMatch[1].trim()
    }

    const obsMatch = text.match(/Key Observations:\s*\n(.*?)\s*\n/is)
    if (obsMatch && obsMatch[1] && !obsMatch[1].includes("[describe")) {
      result.observations = obsMatch[1].trim()
    }

    const defMatch = text.match(/Identified Defects:\s*\n(.*?)\s*\n/is)
    if (defMatch && defMatch[1] && !defMatch[1].includes("[describe")) {
      result.defects = defMatch[1].trim()
    }

    const rectMatch = text.match(/Required Rectification:\s*\n(.*?)\s*\n/is)
    if (rectMatch && rectMatch[1] && !rectMatch[1].includes("[describe")) {
      result.rectification = rectMatch[1].trim()
    }

    const recMatch = text.match(/Engineering Recommendations:\s*\n(.*?)\s*\n/is)
    if (recMatch && recMatch[1] && !recMatch[1].includes("[describe")) {
      result.recommendations = recMatch[1].trim()
    }

    const statMatch = text.match(/Overall Status:\s*\n(.*?)\s*\n/i)
    if (statMatch && statMatch[1] && !statMatch[1].includes("[Satisfactory")) {
      result.inspectionStatus = statMatch[1].trim()
    }

    const attMatch = text.match(/Attachments \/ References:\s*\n(.*?)$/is)
    if (attMatch && attMatch[1] && !attMatch[1].includes("[photo")) {
      result.attachmentsNote = attMatch[1].trim()
    }

    return result
  },
}

// 6. IPC Schema (Interim Payment Certificate)
export const IPC_LETTER_DETAILS_SCHEMA: LetterDetailsSchema = {
  documentType: "ipc",
  title: "Letter Details — Interim Payment Certificate (IPC)",
  description: "Fill in the payment certificate details below to automatically update the IPC letter text.",
  fields: [
    {
      key: "ipcPeriod",
      label: "Certificate Period / Reference",
      description: "Billing period, milestone, or certificate reference.",
      type: "text",
      templateToken: "[billing period / certificate reference]",
    },
    {
      key: "claimedAmount",
      label: "Gross Amount Claimed",
      description: "Gross valuation claimed by Contractor for works completed.",
      type: "text",
      templateToken: "[claimed amount]",
    },
    {
      key: "certifiedAmount",
      label: "Net Certified Amount Payable",
      description: "Net certified amount recommended for payment after deductions.",
      type: "text",
      templateToken: "[certified amount]",
    },
    {
      key: "summaryOfWorks",
      label: "Summary of Certified Works",
      description: "Brief breakdown of main construction activities certified in this IPC.",
      type: "textarea",
      templateToken: "[summary of certified works / milestones]",
    },
    {
      key: "certificateDate",
      label: "Certificate Issue Date",
      description: "Formal date of IPC certification.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "remarks",
      label: "Certification Conditions / Notes",
      description: "Retention deductions, advance recovery, or payment terms.",
      type: "textarea",
      templateToken: "[retention / deductions / payment conditions]",
    },
  ],
  buildText: (values: Record<string, string>) => {
    const ipcPeriod = values.ipcPeriod?.trim() || "[billing period / certificate reference]"
    const claimedAmount = values.claimedAmount?.trim() || "[claimed amount]"
    const certifiedAmount = values.certifiedAmount?.trim() || "[certified amount]"
    const summaryOfWorks = values.summaryOfWorks?.trim() || "[summary of certified works / milestones]"
    const certificateDate = values.certificateDate?.trim() || "[date]"
    const remarks = values.remarks?.trim() || "[retention / deductions / payment conditions]"

    return `Interim Payment Certificate
Period: ${ipcPeriod}

Gross Amount Claimed:
${claimedAmount}

Net Certified Amount:
${certifiedAmount}

Summary of Works:
${summaryOfWorks}

Date:
${certificateDate}

Certification Notes:
${remarks}`
  },
  parseValuesFromText: (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    if (!text) return result

    const periodMatch = text.match(/Period: (.*?)\n/i)
    if (periodMatch && periodMatch[1] && !periodMatch[1].includes("[billing")) {
      result.ipcPeriod = periodMatch[1].trim()
    }

    const claimMatch = text.match(/Gross Amount Claimed:\s*\n(.*?)\s*\n/is)
    if (claimMatch && claimMatch[1] && !claimMatch[1].includes("[claimed")) {
      result.claimedAmount = claimMatch[1].trim()
    }

    const certMatch = text.match(/Net Certified Amount:\s*\n(.*?)\s*\n/is)
    if (certMatch && certMatch[1] && !certMatch[1].includes("[certified")) {
      result.certifiedAmount = certMatch[1].trim()
    }

    const worksMatch = text.match(/Summary of Works:\s*\n(.*?)\s*\n/is)
    if (worksMatch && worksMatch[1] && !worksMatch[1].includes("[summary")) {
      result.summaryOfWorks = worksMatch[1].trim()
    }

    const dateMatch = text.match(/Date:\s*\n(.*?)\s*\n/is)
    if (dateMatch && dateMatch[1] && !dateMatch[1].includes("[date]")) {
      result.certificateDate = dateMatch[1].trim()
    }

    const remMatch = text.match(/Certification Notes:\s*\n(.*)$/is)
    if (remMatch && remMatch[1] && !remMatch[1].includes("[retention")) {
      result.remarks = remMatch[1].trim()
    }

    return result
  },
}

// 7. VO Schema (Variation Order)
export const VO_LETTER_DETAILS_SCHEMA: LetterDetailsSchema = {
  documentType: "variation_order",
  title: "Letter Details — Variation Order (VO)",
  description: "Fill in the variation order details below to automatically update the VO letter text.",
  fields: [
    {
      key: "voSubject",
      label: "Variation Subject / Title",
      description: "Main title or description of the variation scope change.",
      type: "text",
      templateToken: "[variation subject / scope description]",
    },
    {
      key: "justification",
      label: "Reason & Justification",
      description: "Why this variation is required (client request, site condition, design change).",
      type: "textarea",
      templateToken: "[reason / justification for change]",
    },
    {
      key: "costImpact",
      label: "Financial / Cost Impact",
      description: "Net cost addition or omission resulting from this Variation Order.",
      type: "text",
      templateToken: "[cost impact / amount]",
    },
    {
      key: "timeImpact",
      label: "Time Impact / Extension of Time",
      description: "Approved schedule impact or calendar days extension.",
      type: "text",
      templateToken: "[time impact / calendar days]",
    },
    {
      key: "orderDate",
      label: "Variation Order Issue Date",
      description: "Date when this Variation Order was issued.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "remarks",
      label: "Approval Terms & References",
      description: "Reference to Site Instructions, commercial approvals, or conditions.",
      type: "textarea",
      templateToken: "[approval terms / instruction references]",
    },
  ],
  buildText: (values: Record<string, string>) => {
    const voSubject = values.voSubject?.trim() || "[variation subject / scope description]"
    const justification = values.justification?.trim() || "[reason / justification for change]"
    const costImpact = values.costImpact?.trim() || "[cost impact / amount]"
    const timeImpact = values.timeImpact?.trim() || "[time impact / calendar days]"
    const orderDate = values.orderDate?.trim() || "[date]"
    const remarks = values.remarks?.trim() || "[approval terms / instruction references]"

    return `Variation Order: ${voSubject}

Justification:
${justification}

Cost Impact:
${costImpact}

Time Impact:
${timeImpact}

Date:
${orderDate}

Approval Terms & Refs:
${remarks}`
  },
  parseValuesFromText: (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    if (!text) return result

    const subMatch = text.match(/Variation Order: (.*?)\n/i)
    if (subMatch && subMatch[1] && !subMatch[1].includes("[variation")) {
      result.voSubject = subMatch[1].trim()
    }

    const justMatch = text.match(/Justification:\s*\n(.*?)\s*\n/is)
    if (justMatch && justMatch[1] && !justMatch[1].includes("[reason")) {
      result.justification = justMatch[1].trim()
    }

    const costMatch = text.match(/Cost Impact:\s*\n(.*?)\s*\n/is)
    if (costMatch && costMatch[1] && !costMatch[1].includes("[cost")) {
      result.costImpact = costMatch[1].trim()
    }

    const timeMatch = text.match(/Time Impact:\s*\n(.*?)\s*\n/is)
    if (timeMatch && timeMatch[1] && !timeMatch[1].includes("[time")) {
      result.timeImpact = timeMatch[1].trim()
    }

    const dateMatch = text.match(/Date:\s*\n(.*?)\s*\n/is)
    if (dateMatch && dateMatch[1] && !dateMatch[1].includes("[date]")) {
      result.orderDate = dateMatch[1].trim()
    }

    const remMatch = text.match(/Approval Terms & Refs:\s*\n(.*)$/is)
    if (remMatch && remMatch[1] && !remMatch[1].includes("[approval")) {
      result.remarks = remMatch[1].trim()
    }

    return result
  },
}

// 8. General Documents Schema (Other)
export const GENERAL_LETTER_DETAILS_SCHEMA: LetterDetailsSchema = {
  documentType: "other",
  title: "Letter Details — General Document",
  description: "Fill in the general document details below to automatically update the letter text.",
  fields: [
    {
      key: "documentSubject",
      label: "Document Subject / Reference",
      description: "Main subject or reference description for this document.",
      type: "text",
      templateToken: "[document subject / reference]",
    },
    {
      key: "documentDate",
      label: "Document Date",
      description: "Formal date of the document.",
      type: "date",
      templateToken: "[date]",
    },
    {
      key: "details",
      label: "Document Content / Particulars",
      description: "Key particulars, transmittal scope, or background details.",
      type: "textarea",
      templateToken: "[describe key document particulars / scope]",
    },
    {
      key: "remarks",
      label: "Distribution / Notes",
      description: "Distribution list, action required, or follow-up notes.",
      type: "textarea",
      templateToken: "[distribution list / notes]",
    },
  ],
  buildText: (values: Record<string, string>) => {
    const documentSubject = values.documentSubject?.trim() || "[document subject / reference]"
    const documentDate = values.documentDate?.trim() || "[date]"
    const details = values.details?.trim() || "[describe key document particulars / scope]"
    const remarks = values.remarks?.trim() || "[distribution list / notes]"

    return `Document Subject / Reference:
${documentSubject}

Date:
${documentDate}

Document Details:
${details}

Distribution / Notes:
${remarks}`
  },
  parseValuesFromText: (text: string): Record<string, string> => {
    const result: Record<string, string> = {}
    if (!text) return result

    const subMatch = text.match(/Document Subject \/ Reference:\s*\n(.*?)\s*\n/i)
    if (subMatch && subMatch[1] && !subMatch[1].includes("[document")) {
      result.documentSubject = subMatch[1].trim()
    }

    const dateMatch = text.match(/Date:\s*\n(.*?)\s*\n/is)
    if (dateMatch && dateMatch[1] && !dateMatch[1].includes("[date]")) {
      result.documentDate = dateMatch[1].trim()
    }

    const detMatch = text.match(/Document Details:\s*\n(.*?)\s*\n/is)
    if (detMatch && detMatch[1] && !detMatch[1].includes("[describe")) {
      result.details = detMatch[1].trim()
    }

    const remMatch = text.match(/Distribution \/ Notes:\s*\n(.*?)$/is)
    if (remMatch && remMatch[1] && !remMatch[1].includes("[distribution")) {
      result.remarks = remMatch[1].trim()
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

  ipc: IPC_LETTER_DETAILS_SCHEMA,
  interim_payment_certificate: IPC_LETTER_DETAILS_SCHEMA,

  variation_order: VO_LETTER_DETAILS_SCHEMA,
  vo: VO_LETTER_DETAILS_SCHEMA,

  other: GENERAL_LETTER_DETAILS_SCHEMA,
  general_document: GENERAL_LETTER_DETAILS_SCHEMA,
}

export function getLetterDetailsSchema(documentType: string | null | undefined): LetterDetailsSchema | null {
  if (!documentType) return null
  return LETTER_DETAILS_SCHEMAS[documentType] ?? null
}
