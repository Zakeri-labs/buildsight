export type ParsedBilingualDetails = {
  englishText: string
  arabicText: string | null
  attachArabic: boolean
  hasArabic: boolean
  structuredFields?: Record<string, string> | null
}

export function stripHtmlToPlainText(rawText: string | null | undefined): string {
  if (!rawText) return ""

  let text = rawText.trim()

  // 1. Remove markdown code fences e.g. ```html ... ```
  if (text.includes("```")) {
    text = text.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim()
  }

  // 2. Remove HTML comments e.g. <!-- STRUCTURED_FIELDS: ... -->
  if (text.includes("<!--")) {
    text = text.replace(/<!--[\s\S]*?-->/g, "").trim()
  }

  // 3. Strip HTML elements if present
  if (/<[a-z][\s\S]*>/i.test(text)) {
    // Replace block closing tags and break tags with plain text line breaks
    text = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/td>/gi, " | ")
      .replace(/<\/th>/gi, " | ")

    // Strip all remaining HTML tags
    text = text.replace(/<[^>]+>/g, "")

    // Decode standard HTML entities
    text = text
      .replaceAll("&nbsp;", " ")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
  }

  // 4. Normalize excessive consecutive empty lines (max 2 newlines)
  return text.replace(/\n{3,}/g, "\n\n").trim()
}

export function parseBilingualDocumentDetails(rawDetails: string | null | undefined): ParsedBilingualDetails {
  if (!rawDetails) {
    return { englishText: "", arabicText: null, attachArabic: false, hasArabic: false, structuredFields: null }
  }

  let textToParse = rawDetails
  let extractedStructuredFields: Record<string, string> | null = null

  // Extract structured fields metadata comment if present
  const structuredFieldsMatch = textToParse.match(/<!--\s*STRUCTURED_FIELDS:\s*([\s\S]*?)\s*-->/)
  if (structuredFieldsMatch && structuredFieldsMatch[1]) {
    try {
      extractedStructuredFields = JSON.parse(structuredFieldsMatch[1].trim())
    } catch {
      extractedStructuredFields = null
    }
    // Remove the comment from textToParse
    textToParse = textToParse.replace(/<!--\s*STRUCTURED_FIELDS:\s*[\s\S]*?\s*-->/g, "").trim()
  }

  const attachMarkerRegex = /\n\s*(?:---|───|\+\+\+)\s*(?:ATTACH ARABIC TRANSLATION|ATTACH_ARABIC)\s*(?:---|───|\+\+\+)?\s*$/i
  const separatorRegex = /\n\s*(?:---|───|\+\+\+)\s*(?:ARABIC TRANSLATION|ARABIC_TRANSLATION|الترجمة العربية)\s*(?:---|───|\+\+\+)?\s*\n/i

  const attachMatch = textToParse.match(attachMarkerRegex)
  if (attachMatch && attachMatch.index !== undefined) {
    const englishText = textToParse.slice(0, attachMatch.index).trimEnd()
    return {
      englishText,
      arabicText: null,
      attachArabic: true,
      hasArabic: false,
      structuredFields: extractedStructuredFields,
    }
  }

  const match = textToParse.match(separatorRegex)
  if (match && match.index !== undefined) {
    const englishText = textToParse.slice(0, match.index).trimEnd()
    const rawArabic = textToParse.slice(match.index + match[0].length).trim()
    const cleanArabic = stripHtmlToPlainText(rawArabic)
    return {
      englishText,
      arabicText: cleanArabic || null,
      attachArabic: true,
      hasArabic: Boolean(cleanArabic),
      structuredFields: extractedStructuredFields,
    }
  }

  return {
    englishText: textToParse,
    arabicText: null,
    attachArabic: false,
    hasArabic: false,
    structuredFields: extractedStructuredFields,
  }
}

export function formatBilingualDocumentDetails(
  englishText: string,
  arabicText?: string | null,
  attachArabic?: boolean,
  structuredFields?: Record<string, string> | null,
): string {
  let cleanEnglish = (englishText || "").trimEnd()
  const cleanArabic = stripHtmlToPlainText(arabicText)

  // Append structuredFields as a clean HTML comment if present
  if (structuredFields && Object.keys(structuredFields).length > 0) {
    cleanEnglish = `${cleanEnglish}\n\n<!-- STRUCTURED_FIELDS: ${JSON.stringify(structuredFields)} -->`
  }

  if (cleanArabic) {
    return `${cleanEnglish}\n\n--- ARABIC TRANSLATION ---\n\n${cleanArabic}`
  }

  if (attachArabic) {
    return `${cleanEnglish}\n\n--- ATTACH ARABIC TRANSLATION ---`
  }

  return cleanEnglish
}
