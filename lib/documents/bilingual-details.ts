export type ParsedBilingualDetails = {
  englishText: string
  arabicText: string | null
  hasArabic: boolean
}

export function parseBilingualDocumentDetails(rawDetails: string | null | undefined): ParsedBilingualDetails {
  if (!rawDetails) {
    return { englishText: "", arabicText: null, hasArabic: false }
  }

  const separatorRegex = /\n\s*(?:---|───|\+\+\+)\s*(?:ARABIC TRANSLATION|ARABIC_TRANSLATION|الترجمة العربية)\s*(?:---|───|\+\+\+)?\s*\n/i
  const match = rawDetails.match(separatorRegex)

  if (match && match.index !== undefined) {
    const englishText = rawDetails.slice(0, match.index).trimEnd()
    const arabicText = rawDetails.slice(match.index + match[0].length).trim()
    return {
      englishText,
      arabicText: arabicText || null,
      hasArabic: Boolean(arabicText),
    }
  }

  return {
    englishText: rawDetails,
    arabicText: null,
    hasArabic: false,
  }
}

export function formatBilingualDocumentDetails(englishText: string, arabicText?: string | null): string {
  const cleanEnglish = (englishText || "").trimEnd()
  const cleanArabic = (arabicText || "").trim()

  if (!cleanArabic) {
    return cleanEnglish
  }

  return `${cleanEnglish}\n\n--- ARABIC TRANSLATION ---\n\n${cleanArabic}`
}
