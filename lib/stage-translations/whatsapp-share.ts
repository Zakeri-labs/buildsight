function formatVisitDate(dateStr?: string | null): string | null {
  if (!dateStr || !dateStr.trim()) return null
  const trimmed = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const [y, m, d] = trimmed.slice(0, 10).split("-").map(Number)
    if (y && m && d) {
      const date = new Date(y, m - 1, d)
      if (!isNaN(date.getTime())) {
        return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date)
      }
    }
  }
  return trimmed
}

export function buildShareMessage(options: {
  projectName: string
  projectCode?: string | null
  visitDate?: string | null
  reportTitle?: string
  reportSubject?: string
  visitNumber?: number | string
  supervisorName?: string
  projectId: string
  stageId?: string
  responseId?: string
  translationId?: string
  phone?: string
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.bonyanec.com"
  const reportId = options.responseId || options.translationId
  const microCode = reportId ? reportId.split("-")[0] : null
  const queryIdParam = options.translationId
    ? `translationId=${options.translationId}`
    : options.responseId
    ? `responseId=${options.responseId}`
    : ""

  const shortUrl = microCode
    ? `${origin}/r/${microCode}`
    : `${origin}/api/stage-translations/pdf?projectId=${options.projectId}&kind=bilingual&share=1${queryIdParam ? `&${queryIdParam}` : ""}`

  const subjectText = (options.reportSubject || options.reportTitle || "Inspection Report").trim()
  const projectCodeText = options.projectCode?.trim()
  const visitDateText = formatVisitDate(options.visitDate)

  const messageLines = [
    "🏗️ *Bonyan Construction Report*",
    `*Project:* ${options.projectName}`,
    ...(projectCodeText ? [`*Project Code:* ${projectCodeText}`] : []),
    ...(visitDateText ? [`*Visit Date:* ${visitDateText}`] : []),
    `*Report Subject:* ${subjectText}`,
    ...(options.supervisorName ? [`*Supervisor:* ${options.supervisorName}`] : []),
    "",
    "📄 *Download Bilingual PDF:*",
    shortUrl,
  ]

  const text = messageLines.join("\n")
  const targetPhone = options.phone ? options.phone.replace(/[^0-9]/g, "") : ""

  const whatsappUrl = targetPhone
    ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`

  return {
    text,
    shortUrl,
    whatsappUrl,
  }
}

export function buildWhatsAppShareUrl(options: {
  projectName: string
  projectCode?: string | null
  visitDate?: string | null
  reportTitle?: string
  reportSubject?: string
  visitNumber?: number | string
  supervisorName?: string
  projectId: string
  stageId?: string
  responseId?: string
  translationId?: string
  phone?: string
}) {
  return buildShareMessage(options).whatsappUrl
}
