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

export async function sendReportCcEmails(input: ReportCcEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.REPORT_CC_FROM_EMAIL?.trim() || process.env.SITE_VISIT_FROM_EMAIL?.trim()
  const results: Array<{ recipientRowId: string; status: "sent" | "skipped_unconfigured" | "skipped_no_email" | "failed" }> = []

  for (const recipient of input.recipients) {
    if (!recipient.email?.trim()) {
      results.push({ recipientRowId: recipient.recipientRowId, status: "skipped_no_email" })
      continue
    }
    if (!apiKey || !from) {
      results.push({ recipientRowId: recipient.recipientRowId, status: "skipped_unconfigured" })
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
        body: JSON.stringify({ from, to: [recipient.email.trim()], subject, text }),
      })
      results.push({ recipientRowId: recipient.recipientRowId, status: response.ok ? "sent" : "failed" })
    } catch {
      results.push({ recipientRowId: recipient.recipientRowId, status: "failed" })
    }
  }

  return results
}
