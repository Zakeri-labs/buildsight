import "server-only"

export type ReportCcEmailRecipient = {
  recipientRowId: string
  name: string
  email: string | null
  internal: boolean
}

export type ReportCcEmailInput = {
  context: "report" | "translation"
  projectName: string
  stageName: string
  termName: string
  reportTitle: string
  reportNumber: string
  href: string
  recipients: ReportCcEmailRecipient[]
}

export type ReportCcEmailStatus = "sent" | "skipped_unconfigured" | "skipped_no_email" | "failed"

export type ReportCcEmailResult = {
  recipientRowId: string
  status: ReportCcEmailStatus
  error: string | null
  providerMessageId: string | null
}

function providerErrorMessage(status: number, body: string) {
  const trimmed = body.trim()
  if (!trimmed) return `Resend email failed (${status}).`

  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown; name?: unknown }
    const message = typeof parsed.message === "string" ? parsed.message.trim() : ""
    const name = typeof parsed.name === "string" ? parsed.name.trim() : ""
    if (message) return `Resend email failed (${status})${name ? ` ${name}` : ""}: ${message}`
  } catch {
    // Fall back to the provider's raw response below.
  }

  return `Resend email failed (${status}): ${trimmed.slice(0, 500)}`
}

function logDeliveryFailure(input: {
  recipientRowId: string
  recipientEmail: string | null
  context: ReportCcEmailInput["context"]
  error: string
}) {
  console.error("[email:report-cc] Delivery failed", input)
}

export async function sendReportCcEmails(input: ReportCcEmailInput): Promise<ReportCcEmailResult[]> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.REPORT_CC_FROM_EMAIL?.trim() || process.env.SITE_VISIT_FROM_EMAIL?.trim()
  const results: ReportCcEmailResult[] = []

  for (const recipient of input.recipients) {
    const recipientEmail = recipient.email?.trim() || null
    if (!recipientEmail) {
      const error = `No email address is available for ${recipient.name || "the selected recipient"}.`
      logDeliveryFailure({ recipientRowId: recipient.recipientRowId, recipientEmail, context: input.context, error })
      results.push({ recipientRowId: recipient.recipientRowId, status: "skipped_no_email", error, providerMessageId: null })
      continue
    }

    if (!apiKey || !from) {
      const missing = [!apiKey ? "RESEND_API_KEY" : null, !from ? "REPORT_CC_FROM_EMAIL or SITE_VISIT_FROM_EMAIL" : null]
        .filter(Boolean)
        .join(" and ")
      const error = `Email delivery is not configured. Missing ${missing}.`
      logDeliveryFailure({ recipientRowId: recipient.recipientRowId, recipientEmail, context: input.context, error })
      results.push({ recipientRowId: recipient.recipientRowId, status: "skipped_unconfigured", error, providerMessageId: null })
      continue
    }

    const subject = input.context === "translation"
      ? `CC: Translation - ${input.reportTitle}`
      : `CC: Report - ${input.reportTitle}`
    const accessNote = recipient.internal
      ? `Open: ${input.href}`
      : "This email does not create platform access. Contact the project team if you need access."
    const text = [
      `Hello ${recipient.name || "Recipient"},`,
      "",
      input.context === "translation"
        ? "You have been CC'd on a report translation."
        : "You have been CC'd on a report.",
      "",
      `Project: ${input.projectName}`,
      `Stage: ${input.stageName}`,
      `Term: ${input.termName}`,
      `Report: ${input.reportTitle}`,
      `Report Number: ${input.reportNumber}`,
      "",
      accessNote,
      "",
      "Regards,",
      "Bonyan Platform",
    ].join("\n")

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [recipientEmail], subject, text }),
        cache: "no-store",
      })
      const body = await response.text().catch(() => "")

      if (!response.ok) {
        const error = providerErrorMessage(response.status, body)
        logDeliveryFailure({ recipientRowId: recipient.recipientRowId, recipientEmail, context: input.context, error })
        results.push({ recipientRowId: recipient.recipientRowId, status: "failed", error, providerMessageId: null })
        continue
      }

      let providerMessageId: string | null = null
      if (body) {
        try {
          const parsed = JSON.parse(body) as { id?: unknown }
          providerMessageId = typeof parsed.id === "string" ? parsed.id : null
        } catch {
          providerMessageId = null
        }
      }
      results.push({ recipientRowId: recipient.recipientRowId, status: "sent", error: null, providerMessageId })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown network error."
      const deliveryError = `Resend email request failed: ${message}`
      logDeliveryFailure({ recipientRowId: recipient.recipientRowId, recipientEmail, context: input.context, error: deliveryError })
      results.push({ recipientRowId: recipient.recipientRowId, status: "failed", error: deliveryError, providerMessageId: null })
    }
  }

  return results
}
