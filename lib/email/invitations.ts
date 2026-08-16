import "server-only"
import nodemailer from "nodemailer"

import type { OrganizationRole } from "@/lib/db/types"
import { roleLabel } from "@/lib/db/types"
import {
  resolveInvitationEmailConfiguration,
  type InvitationEmailConfiguration,
} from "@/lib/email/config"

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

function sanitizeProviderText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null

  return trimmed
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bre_[A-Za-z0-9_-]+\b/g, "[redacted-api-key]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .slice(0, 300)
}

function logInvitationEmailFailure(input: {
  message: string
  configuration: InvitationEmailConfiguration
  category: InvitationEmailFailureCategory
  providerStatus?: number
  providerDetails?: Record<string, string | number> | null
}) {
  console.error(input.message, {
    operation: "organization_invitation_email",
    failureCategory: input.category,
    providerHttpStatus: input.providerStatus ?? null,
    runtimeEnvironment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    environmentVariablesPresent: input.configuration.environmentPresence,
    selectedSenderVariable: input.configuration.senderVariable,
    providerDetails: input.providerDetails ?? null,
  })
}

/**
 * Submit an organization invitation email through Zoho SMTP using Nodemailer.
 * "sent" means SMTP transport accepted the message and returned a messageId.
 */
export async function sendInvitationEmail(input: InvitationEmailInput): Promise<InvitationEmailResult> {
  const configuration = resolveInvitationEmailConfiguration()

  if (configuration.status === "not_configured") {
    logInvitationEmailFailure({
      message: "Invitation email configuration is unavailable",
      configuration,
      category: configuration.category,
    })
    return { status: "not_configured", category: configuration.category }
  }

  if (configuration.status === "invalid_sender") {
    logInvitationEmailFailure({
      message: "Invitation email sender format is invalid",
      configuration,
      category: "invalid_sender",
    })
    return { status: "provider_error", category: "invalid_sender" }
  }

  const { host, port, secure, user, pass, from } = configuration

  if (!isSafeInvitationUrl(input.invitationUrl)) {
    logInvitationEmailFailure({
      message: "Invitation email contains an invalid public invitation URL",
      configuration,
      category: "invalid_invitation_url",
    })
    return { status: "provider_error", category: "invalid_invitation_url" }
  }

  const siteOrigin = new URL(input.invitationUrl).origin
  const role = roleLabel(input.organizationRole)
  const expiry = new Date(input.expiresAt).toUTCString()
  const projectLine = input.projectName ? `Project: ${input.projectName}` : null
  const text = [
    "Hello,",
    "",
    "You have been invited to join BONYAN Construction Supervision / BuildSight.",
    `Organization: ${input.organizationName}`,
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
    "BONYAN Construction Engineering Consultancy",
  ]
    .filter((line): line is string => line !== null)
    .join("\n")

  const organizationName = escapeHtml(input.organizationName)
  const roleName = escapeHtml(role)
  const projectHtml = input.projectName
    ? `<tr><td style="padding:3px 0;"><strong>Project:</strong> ${escapeHtml(input.projectName)}</td></tr>`
    : ""
  const invitationUrl = escapeHtml(input.invitationUrl)
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>You're invited to join BONYAN</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f4f6fb;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:36px 32px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <!-- Logo Header -->
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <img src="${siteOrigin}/LogoB.png" alt="BONYAN" width="180" style="max-width:180px;height:auto;display:block;border:0;outline:none;" />
              </td>
            </tr>
            <!-- Blue Accent Line -->
            <tr>
              <td style="padding-bottom:24px;">
                <div style="height:3px;background:linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%);border-radius:2px;"></div>
              </td>
            </tr>
            <!-- Title -->
            <tr>
              <td style="padding-bottom:16px;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;text-align:left;">You&apos;re invited to join BONYAN</h1>
              </td>
            </tr>
            <!-- Greeting & Explanation -->
            <tr>
              <td style="padding-bottom:20px;font-size:15px;line-height:1.6;color:#334155;">
                <p style="margin:0 0 12px;">Hello,</p>
                <p style="margin:0;">You have been invited to join <strong>BONYAN Construction Supervision / BuildSight</strong>.</p>
              </td>
            </tr>
            <!-- Details Card -->
            <tr>
              <td style="padding-bottom:24px;">
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;font-size:14px;line-height:1.6;color:#334155;">
                  <tr>
                    <td style="padding:3px 0;"><strong>Organization:</strong> ${organizationName}</td>
                  </tr>
                  <tr>
                    <td style="padding:3px 0;"><strong>Role:</strong> ${roleName}</td>
                  </tr>
                  ${projectHtml}
                  <tr>
                    <td style="padding:3px 0;"><strong>Expires:</strong> ${escapeHtml(expiry)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Primary Blue CTA Button -->
            <tr>
              <td align="center" style="padding-bottom:28px;">
                <a href="${invitationUrl}" style="display:inline-block;background-color:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:8px;text-align:center;box-shadow:0 2px 4px rgba(29,78,216,0.2);">Accept Invitation</a>
              </td>
            </tr>
            <!-- Plain Text Fallback Link -->
            <tr>
              <td style="padding-bottom:28px;border-top:1px solid #f1f5f9;padding-top:20px;font-size:13px;color:#64748b;line-height:1.5;">
                <p style="margin:0 0 8px;">If the button does not work, copy and paste the link below into your browser:</p>
                <p style="margin:0;word-break:break-all;font-size:13px;"><a href="${invitationUrl}" style="color:#1d4ed8;text-decoration:underline;">${invitationUrl}</a></p>
              </td>
            </tr>
            <!-- Professional Footer -->
            <tr>
              <td align="center" style="border-top:1px solid #f1f5f9;padding-top:20px;font-size:12px;color:#94a3b8;line-height:1.5;">
                <strong style="color:#64748b;">BONYAN Construction Engineering Consultancy</strong><br>
                BuildSight Platform
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    })

    const info = await transporter.sendMail({
      from,
      to: input.to.trim().toLowerCase(),
      subject: `Invitation to join BONYAN (${input.organizationName})`,
      text,
      html,
    })

    if (!info.messageId) {
      logInvitationEmailFailure({
        message: "Invitation email SMTP response did not contain a messageId",
        configuration,
        category: "provider_missing_id",
      })
      return { status: "provider_error", category: "provider_missing_id" }
    }

    return { status: "sent", providerMessageId: String(info.messageId).trim() }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logInvitationEmailFailure({
      message: "Invitation email SMTP send failed",
      configuration,
      category: "provider_rejected",
      providerDetails: {
        message: sanitizeProviderText(errorMessage) ?? "SMTP send failure",
      },
    })
    return { status: "provider_error", category: "provider_rejected" }
  }
}
