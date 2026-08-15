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
      subject: `Invitation to join ${input.organizationName} on BuildSight`,
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
