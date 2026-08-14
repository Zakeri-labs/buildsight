import type { LetterDetailsSchema } from "./letter-details-schema"

export type FieldPreviewContext = {
  prevParagraph: string | null
  targetParagraph: string
  nextParagraph: string | null
  isManuallyEdited: boolean
}

export function getLetterFieldPreviewContext(
  schema: LetterDetailsSchema | null,
  fieldValues: Record<string, string>,
  englishText: string,
  fieldKey: string,
  isManuallyEdited: boolean
): FieldPreviewContext | null {
  if (!schema) return null

  const fieldConfig = schema.fields.find((f) => f.key === fieldKey)
  if (!fieldConfig) return null

  // 1. Generate standard full text from schema buildText
  const fullText = schema.buildText(fieldValues)
  if (!fullText.trim()) return null

  // 2. Split text into clean paragraph blocks
  const paragraphs = fullText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return null

  const rawFieldValue = (fieldValues[fieldKey] ?? "").trim()
  const templateToken = fieldConfig.templateToken

  // 3. Locate target paragraph index
  let targetIndex = -1

  // Strategy A: If field value is present (len > 1), search for it in paragraphs
  if (rawFieldValue && rawFieldValue.length > 1) {
    targetIndex = paragraphs.findIndex((p) => p.toLowerCase().includes(rawFieldValue.toLowerCase()))
  }

  // Strategy B: Search for templateToken placeholder in paragraphs
  if (targetIndex === -1 && templateToken) {
    targetIndex = paragraphs.findIndex((p) => p.includes(templateToken))
  }

  // Strategy C: Search by field label or field key substring in paragraphs
  if (targetIndex === -1) {
    const keyTerm = fieldConfig.label.toLowerCase().replace(/[^a-z0-9]/g, "")
    targetIndex = paragraphs.findIndex((p) => {
      const pClean = p.toLowerCase().replace(/[^a-z0-9]/g, "")
      return pClean.includes(keyTerm)
    })
  }

  // Fallback: Default to index 0 if not found
  if (targetIndex === -1) {
    targetIndex = 0
  }

  const prevParagraph = targetIndex > 0 ? paragraphs[targetIndex - 1] : null
  const targetParagraph = paragraphs[targetIndex]
  const nextParagraph = targetIndex < paragraphs.length - 1 ? paragraphs[targetIndex + 1] : null

  return {
    prevParagraph,
    targetParagraph,
    nextParagraph,
    isManuallyEdited,
  }
}
