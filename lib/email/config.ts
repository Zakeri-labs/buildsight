import "server-only"

export type InvitationSenderVariableName =
  | "INVITATION_FROM_EMAIL"
  | "RESEND_FROM_EMAIL"
  | "EMAIL_FROM"
  | "NOTIFICATION_FROM_EMAIL"
  | "SITE_VISIT_FROM_EMAIL"
  | "REPORT_CC_FROM_EMAIL"
  | "FROM_EMAIL"

export type InvitationEmailConfiguration =
  | {
      status: "configured"
      apiKey: string
      from: string
      senderVariable: InvitationSenderVariableName
    }
  | {
      status: "not_configured"
      category: "missing_api_key" | "missing_sender"
      hasApiKey: boolean
      senderVariable: null
    }
  | {
      status: "invalid_sender"
      category: "invalid_sender"
      hasApiKey: true
      senderVariable: InvitationSenderVariableName
    }

const SENDER_VARIABLES: readonly InvitationSenderVariableName[] = [
  "INVITATION_FROM_EMAIL",
  "RESEND_FROM_EMAIL",
  "EMAIL_FROM",
  "NOTIFICATION_FROM_EMAIL",
  "SITE_VISIT_FROM_EMAIL",
  "REPORT_CC_FROM_EMAIL",
  "FROM_EMAIL",
]

function extractSenderAddress(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const angleMatch = trimmed.match(/^([^<>]+?)\s*<\s*([^<>]+)\s*>$/)
  const address = angleMatch ? angleMatch[2].trim() : trimmed

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return null
  if (angleMatch && !angleMatch[1].trim()) return null

  return address
}

/**
 * Resolve invitation email configuration at server-action execution time.
 * No value is captured at module initialization, so the active Vercel runtime
 * environment is always consulted for each send or retry operation.
 */
export function resolveInvitationEmailConfiguration(): InvitationEmailConfiguration {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    return {
      status: "not_configured",
      category: "missing_api_key",
      hasApiKey: false,
      senderVariable: null,
    }
  }

  let selected: { variable: InvitationSenderVariableName; value: string } | null = null
  for (const variable of SENDER_VARIABLES) {
    const value = process.env[variable]?.trim()
    if (value) {
      selected = { variable, value }
      break
    }
  }

  if (!selected) {
    return {
      status: "not_configured",
      category: "missing_sender",
      hasApiKey: true,
      senderVariable: null,
    }
  }

  if (!extractSenderAddress(selected.value)) {
    return {
      status: "invalid_sender",
      category: "invalid_sender",
      hasApiKey: true,
      senderVariable: selected.variable,
    }
  }

  return {
    status: "configured",
    apiKey,
    from: selected.value,
    senderVariable: selected.variable,
  }
}
