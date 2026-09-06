"use client"

export function buildShareMessage(options: {
  projectName: string
  projectCode?: string | null
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

  const messageLines = [
    "🏗️ *Bonyan Construction Report*",
    `*Project:* ${options.projectName}`,
    ...(projectCodeText ? [`*Project Code:* ${projectCodeText}`] : []),
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
