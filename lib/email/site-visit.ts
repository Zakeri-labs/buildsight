import "server-only"

import { getSiteVisitEmailRecipients } from "@/lib/site-visits/server"
import { preferredTimeLabel } from "@/lib/site-visits/format"
import type { SiteVisitPreferredTime } from "@/lib/site-visits/types"

export type SiteVisitEmailInput = {
  projectId: string
  requestedById: string
  requestedByName: string
  preferredDate: string | null
  isAsap: boolean
  preferredTime: SiteVisitPreferredTime
  purpose: string
}

export async function sendSiteVisitRequestEmails(input: SiteVisitEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.SITE_VISIT_FROM_EMAIL?.trim()
  if (!apiKey || !from) {
    const missing = [!apiKey ? "RESEND_API_KEY" : null, !from ? "SITE_VISIT_FROM_EMAIL" : null].filter(Boolean).join(" and ")
    const error = `Site visit email delivery is not configured. Missing ${missing}.`
    console.error("[email:site-visit] Delivery skipped", { projectId: input.projectId, error })
    return { status: "skipped_unconfigured" as const, sent: 0, error }
  }

  const { projectName, recipients } = await getSiteVisitEmailRecipients(input.projectId, input.requestedById)
  if (!recipients.length) return { status: "skipped_no_recipients" as const, sent: 0, error: null }

  const preferredVisit = input.isAsap ? "ASAP" : input.preferredDate || "Not specified"
  const text = [
    "Dear Team,",
    "",
    "A new site visit request has been submitted.",
    "",
    `Project: ${projectName}`,
    `Requested By: ${input.requestedByName}`,
    `Preferred Visit: ${preferredVisit}`,
    `Preferred Time: ${preferredTimeLabel(input.preferredTime)}`,
    `Purpose: ${input.purpose}`,
    "",
    "Please review this request from your dashboard.",
    "",
    "Regards,",
    "Bonyan Platform",
  ].join("\n")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients.map((recipient) => recipient.email),
      subject: `New Site Visit Request - ${projectName}`,
      text,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Site visit email failed (${response.status})${body ? `: ${body.slice(0, 250)}` : ""}`)
  }

  return { status: "sent" as const, sent: recipients.length, error: null }
}
