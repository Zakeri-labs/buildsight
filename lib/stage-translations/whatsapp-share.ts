"use client"

export function buildWhatsAppShareUrl(options: {
  projectName: string
  reportTitle?: string
  visitNumber?: number | string
  projectId: string
  stageId?: string
  responseId?: string
  translationId?: string
  phone?: string
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.bonyanec.com"

  const queryParams = new URLSearchParams({
    projectId: options.projectId,
    kind: "bilingual",
    share: "1",
    ...(options.translationId ? { translationId: options.translationId } : {}),
    ...(options.responseId ? { responseId: options.responseId } : {}),
    ...(options.stageId ? { stageId: options.stageId } : {}),
  })

  const directPdfUrl = `${origin}/api/stage-translations/pdf?${queryParams.toString()}`

  const messageLines = [
    "🏗️ *BuildSight - Inspection Report*",
    `*Project:* ${options.projectName}`,
    options.reportTitle ? `*Report:* ${options.reportTitle}` : null,
    options.visitNumber ? `*Visit No:* ${options.visitNumber}` : null,
    "---------------------------------",
    "📥 *Direct Bilingual PDF Download Link:*",
    directPdfUrl,
  ].filter(Boolean)

  const text = messageLines.join("\n")
  const targetPhone = options.phone ? options.phone.replace(/[^0-9]/g, "") : ""

  return targetPhone
    ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`
}
