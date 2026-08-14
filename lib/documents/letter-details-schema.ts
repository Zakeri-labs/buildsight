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

    // 1. Issue
    const issueMatch = text.match(/This NCR has been issued regarding (.*?)\.\s*\n/i)
    if (issueMatch && issueMatch[1] && !issueMatch[1].includes("[describe")) {
      result.issue = issueMatch[1].trim()
    }

    // 2. Location & Inspection Date
    const locDateMatch = text.match(/The issue was identified at (.*?) on (.*?)\.\s*\n/i)
    if (locDateMatch) {
      if (locDateMatch[1] && !locDateMatch[1].includes("[location")) {
        result.location = locDateMatch[1].trim()
      }
      if (locDateMatch[2] && !locDateMatch[2].includes("[date]")) {
        result.inspectionDate = locDateMatch[2].trim()
      }
    }

    // 3. Affected Activity
    const actMatch = text.match(/The affected work activity is (.*?)\.\s*\n/i)
    if (actMatch && actMatch[1] && !actMatch[1].includes("[describe")) {
      result.activity = actMatch[1].trim()
    }

    // 4. Observed Issue
    const obsMatch = text.match(/The details of the non-conformance are:\s*\n(.*?)\.\s*\n/is)
    if (obsMatch && obsMatch[1] && !obsMatch[1].includes("[describe")) {
      result.observedIssue = obsMatch[1].trim()
    }

    // 5. Corrective Action
    const corrMatch = text.match(/The required corrective action is:\s*\n(.*?)\.\s*\n/is)
    if (corrMatch && corrMatch[1] && !corrMatch[1].includes("[describe")) {
      result.correctiveAction = corrMatch[1].trim()
    }

    // 6. Responsible Party
    const respMatch = text.match(/The responsible party for corrective action is:\s*\n(.*?)\.\s*\n/is)
    if (respMatch && respMatch[1] && !respMatch[1].includes("[company")) {
      result.responsibleParty = respMatch[1].trim()
    }

    // 7. Target Completion Date
    const targetMatch = text.match(/The target completion date is:\s*\n(.*?)\.\s*\n/is)
    if (targetMatch && targetMatch[1] && !targetMatch[1].includes("[date]")) {
      result.targetCompletionDate = targetMatch[1].trim()
    }

    // 8. Status
    const statusMatch = text.match(/Current status of this NCR is:\s*\n(.*?)\./i)
    if (statusMatch && statusMatch[1] && !statusMatch[1].includes("[Open")) {
      result.status = statusMatch[1].trim()
    }

    return result
  },
}

export const LETTER_DETAILS_SCHEMAS: Record<string, LetterDetailsSchema> = {
  ncr: NCR_LETTER_DETAILS_SCHEMA,
  non_conformance_report: NCR_LETTER_DETAILS_SCHEMA,
}

export function getLetterDetailsSchema(documentType: string | null | undefined): LetterDetailsSchema | null {
  if (!documentType) return null
  return LETTER_DETAILS_SCHEMAS[documentType] ?? null
}
