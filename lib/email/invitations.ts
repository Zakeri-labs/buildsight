import "server-only"

import type { OrganizationRole } from "@/lib/db/types"
import { roleLabel } from "@/lib/db/types"
import { resolveInvitationEmailConfiguration } from "@/lib/email/config"

export type InvitationEmailFailureCategory =
  | "missing_api_key"
  | "missing_sender"
  | "invalid_invitation_url"
  | "invalid_sender"
  | "provider_rejected"
  | "provider_missing_id"
  | "network_error"

export type InvitationEmailResult =
  | { status: "sent"; providerMessageId: string }
  | { status: "not_configured"; category: "missing_api_key" | "missing_sender" }
  | {
      status: "provider_error"
      category: Exclude<InvitationEmailFailureCategory, "missing_api_key" | "missing_sender">
      providerStatus?: number
    }

export type InvitationEmailInput = {
  to: string
  organizationName: string
  organizationRole: OrganizationRole
  projectName?: string | null
  expiresAt: string
  invitationUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function isValidProviderMessageId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,}$/.test(value.trim())
}

function isSafeInvitationUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return false
    if (!/^\/invite\/[A-Za-z0-9_-]+$/.test(url.pathname)) return false
    if (url.username || url.password || url.search || url.hash) return false

    const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"
    const productionDeployment =
      process.env.VERCEL_ENV === "production" ||
      (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV)

    if (productionDeployment && (url.protocol !== "https:" || localHost)) return false
    if (process.env.NODE_ENV === "production" && localHost) return false

    return true
  } catch {
    return false
  }
}

/**
 * Submit an organization invitation email through the project's existing
 * server-side Resend delivery architecture. "sent" means Resend accepted
 * the API request and returned a provider message id; it does not prove inbox
 * delivery.
 */
export async function sendInvitationEmail(input: InvitationEmailInput): Promise<InvitationEmailResult> {
  const configuration = resolveInvitationEmailConfiguration()
  const runtimeEnvironment = process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown"

  if (configuration.status === "not_configured") {
    console.error("Invitation email configuration is unavailable", {
      operation: "organization_invitation_email",
      runtimeEnvironment,
      hasResendApiKey: configuration.hasApiKey,
      senderVariable: configuration.senderVariable,
      senderResolved: false,
      category: configuration.category,
    })
    return { status: "not_configured", category: configuration.category }
  }

  if (configuration.status === "invalid_sender") {
    console.error("Invitation email sender format is invalid", {
      operation: "organization_invitation_email",
      runtimeEnvironment,
      hasResendApiKey: configuration.hasApiKey,
      senderVariable: configuration.senderVariable,
      senderResolved: true,
      senderFormatValid: false,
      category: configuration.category,
    })
    return { status: "provider_error", category: "invalid_sender" }
  }

  const { apiKey, from, senderVariable } = configuration

  if (!isSafeInvitationUrl(input.invitationUrl)) {
    return { status: "provider_error", category: "invalid_invitation_url" }
  }

  const role = roleLabel(input.organizationRole)
  const expiry = new Date(input.expiresAt).toUTCString()
  const projectLine = input.projectName ? `Project: ${input.projectName}` : null
  const text = [
    "Hello,",
    "",
    `You have been invited to join ${input.organizationName} on BuildSight.`,
    `Organization role: ${role}`,
    projectLine,
    `This invitation expires on ${expiry}.`,
    "",
    "Accept invitation:",
    input.invitationUrl,
    "",
    "If you were not expecting this invitation, you can ignore this email.",
    "",
    "Regards,",
    "BuildSight",
  ]
    .filter((line): line is string => line !== null)
    .join("\n")

  const organizationName = escapeHtml(input.organizationName)
  const roleName = escapeHtml(role)
  const projectHtml = input.projectName
    ? `<p style="margin:4px 0"><strong>Project:</strong> ${escapeHtml(input.projectName)}</p>`
    : ""
  const invitationUrl = escapeHtml(input.invitationUrl)
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#172033">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">You&apos;re invited to BuildSight</h1>
        <p style="margin:0 0 18px;line-height:1.6">You have been invited to join <strong>${organizationName}</strong>.</p>
        <div style="margin:0 0 22px;padding:14px 16px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.5">
          <p style="margin:4px 0"><strong>Organization role:</strong> ${roleName}</p>
          ${projectHtml}
          <p style="margin:4px 0"><strong>Expires:</strong> ${escapeHtml(expiry)}</p>
        </div>
        <p style="margin:0 0 22px">
          <a href="${invitationUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:8px">Accept invitation</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.5">If the button does not work, copy and paste this secure link into your browser:</p>
        <p style="margin:0;word-break:break-all;font-size:13px;line-height:1.5"><a href="${invitationUrl}">${invitationUrl}</a></p>
      </div>
    </div>
  </body>
</html>`

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to.trim().toLowerCase()],
        subject: `Invitation to join ${input.organizationName} on BuildSight`,
        text,
        html,
      }),
    })

    if (!response.ok) {
      console.error("Invitation email provider rejected request", {
        operation: "organization_invitation_email",
        provider: "resend",
        status: response.status,
        senderVariable,
      })
      return { status: "provider_error", category: "provider_rejected", providerStatus: response.status }
    }

    const payload = (await response.json().catch(() => null)) as { id?: unknown; error?: unknown } | null
    if (payload?.error || !isValidProviderMessageId(payload?.id)) {
      console.error("Invitation email provider response did not contain a valid message id", {
        operation: "organization_invitation_email",
        provider: "resend",
        status: response.status,
        senderVariable,
        validMessageId: false,
      })
      return { status: "provider_error", category: "provider_missing_id", providerStatus: response.status }
    }

    return { status: "sent", providerMessageId: payload.id.trim() }
  } catch (error) {
    console.error("Invitation email request failed", {
      operation: "organization_invitation_email",
      provider: "resend",
      senderVariable,
      category: "network_error",
      message: error instanceof Error ? error.message : "Unknown error",
    })
    return { status: "provider_error", category: "network_error" }
  }
}
