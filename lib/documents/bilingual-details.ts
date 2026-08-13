export type ParsedBilingualDetails = {
  englishText: string
  arabicText: string | null
  attachArabic: boolean
  hasArabic: boolean
}

export function stripHtmlToPlainText(rawText: string | null | undefined): string {
  if (!rawText) return ""

  let text = rawText.trim()

  // 1. Remove markdown code fences e.g. ```html ... ```
  if (text.includes("```")) {
    text = text.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim()
  }

  // 2. Strip HTML elements if present
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

  // 3. Normalize excessive consecutive empty lines (max 2 newlines)
  return text.replace(/\n{3,}/g, "\n\n").trim()
}

export function parseBilingualDocumentDetails(rawDetails: string | null | undefined): ParsedBilingualDetails {
  if (!rawDetails) {
    return { englishText: "", arabicText: null, attachArabic: false, hasArabic: false }
  }

  const attachMarkerRegex = /\n\s*(?:---|───|\+\+\+)\s*(?:ATTACH ARABIC TRANSLATION|ATTACH_ARABIC)\s*(?:---|───|\+\+\+)?\s*$/i
  const separatorRegex = /\n\s*(?:---|───|\+\+\+)\s*(?:ARABIC TRANSLATION|ARABIC_TRANSLATION|الترجمة العربية)\s*(?:---|───|\+\+\+)?\s*\n/i

  const attachMatch = rawDetails.match(attachMarkerRegex)
  if (attachMatch && attachMatch.index !== undefined) {
    const englishText = rawDetails.slice(0, attachMatch.index).trimEnd()
    return {
      englishText,
      arabicText: null,
      attachArabic: true,
      hasArabic: false,
    }
  }

  const match = rawDetails.match(separatorRegex)
  if (match && match.index !== undefined) {
    const englishText = rawDetails.slice(0, match.index).trimEnd()
    const rawArabic = rawDetails.slice(match.index + match[0].length).trim()
    const cleanArabic = stripHtmlToPlainText(rawArabic)
    return {
      englishText,
      arabicText: cleanArabic || null,
      attachArabic: true,
      hasArabic: Boolean(cleanArabic),
    }
  }

  return {
    englishText: rawDetails,
    arabicText: null,
    attachArabic: false,
    hasArabic: false,
  }
}

export function formatBilingualDocumentDetails(
  englishText: string,
  arabicText?: string | null,
  attachArabic?: boolean,
): string {
  const cleanEnglish = (englishText || "").trimEnd()
  const cleanArabic = stripHtmlToPlainText(arabicText)

  if (cleanArabic) {
    return `${cleanEnglish}\n\n--- ARABIC TRANSLATION ---\n\n${cleanArabic}`
  }

  if (attachArabic) {
    return `${cleanEnglish}\n\n--- ATTACH ARABIC TRANSLATION ---`
  }

  return cleanEnglish
}
