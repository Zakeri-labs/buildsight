import "server-only"

export type InvitationSenderVariableName =
  | "INVITATION_FROM_EMAIL"
  | "ZOHO_SMTP_USER"
  | "RESEND_FROM_EMAIL"
  | "EMAIL_FROM"
  | "NOTIFICATION_FROM_EMAIL"
  | "SITE_VISIT_FROM_EMAIL"
  | "REPORT_CC_FROM_EMAIL"
  | "FROM_EMAIL"

export type InvitationEmailEnvironmentPresence = {
  ZOHO_SMTP_HOST: boolean
  ZOHO_SMTP_PORT: boolean
  ZOHO_SMTP_SECURE: boolean
  ZOHO_SMTP_USER: boolean
  ZOHO_SMTP_PASSWORD: boolean
  INVITATION_FROM_EMAIL: boolean
  RESEND_FROM_EMAIL: boolean
  EMAIL_FROM: boolean
  NOTIFICATION_FROM_EMAIL: boolean
  SITE_VISIT_FROM_EMAIL: boolean
  REPORT_CC_FROM_EMAIL: boolean
  FROM_EMAIL: boolean
}

type ConfigurationDiagnostics = {
  environmentPresence: InvitationEmailEnvironmentPresence
}

export type InvitationEmailConfiguration =
  | (ConfigurationDiagnostics & {
      status: "configured"
      host: string
      port: number
      secure: boolean
      user: string
      pass: string
      from: string
      senderVariable: InvitationSenderVariableName
    })
  | (ConfigurationDiagnostics & {
      status: "not_configured"
      category: "missing_api_key" | "missing_sender"
      hasApiKey: boolean
      senderVariable: InvitationSenderVariableName | null
    })
  | (ConfigurationDiagnostics & {
      status: "invalid_sender"
      category: "invalid_sender"
      hasApiKey: true
      senderVariable: InvitationSenderVariableName
    })

type SenderCandidate = {
  variable: InvitationSenderVariableName
  value: string | undefined
}

function extractSenderAddress(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const angleMatch = trimmed.match(/^([^<>]+?)\s*<\s*([^<>]+)\s*>$/)
  const address = angleMatch ? angleMatch[2].trim() : trimmed

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return null
  if (angleMatch && !angleMatch[1].trim()) return null

  return address
}

function readEnvironment(): {
  host: string
  port: number
  secure: boolean
  user: string | undefined
  pass: string | undefined
  senderCandidates: SenderCandidate[]
  presence: InvitationEmailEnvironmentPresence
} {
  const host = process.env.ZOHO_SMTP_HOST?.trim() || "smtppro.zoho.com"
  const portRaw = process.env.ZOHO_SMTP_PORT?.trim() || "465"
  const port = Number(portRaw) || 465
  const secureRaw = process.env.ZOHO_SMTP_SECURE?.trim()
  const secure = secureRaw !== undefined ? secureRaw.toLowerCase() === "true" : port === 465

  const user = process.env.ZOHO_SMTP_USER?.trim()
  const pass = process.env.ZOHO_SMTP_PASSWORD?.trim()

  const senderCandidates: SenderCandidate[] = [
    { variable: "INVITATION_FROM_EMAIL", value: process.env.INVITATION_FROM_EMAIL?.trim() },
    { variable: "ZOHO_SMTP_USER", value: process.env.ZOHO_SMTP_USER?.trim() },
    { variable: "RESEND_FROM_EMAIL", value: process.env.RESEND_FROM_EMAIL?.trim() },
    { variable: "EMAIL_FROM", value: process.env.EMAIL_FROM?.trim() },
    { variable: "NOTIFICATION_FROM_EMAIL", value: process.env.NOTIFICATION_FROM_EMAIL?.trim() },
    { variable: "SITE_VISIT_FROM_EMAIL", value: process.env.SITE_VISIT_FROM_EMAIL?.trim() },
    { variable: "REPORT_CC_FROM_EMAIL", value: process.env.REPORT_CC_FROM_EMAIL?.trim() },
    { variable: "FROM_EMAIL", value: process.env.FROM_EMAIL?.trim() },
  ]

  return {
    host,
    port,
    secure,
    user,
    pass,
    senderCandidates,
    presence: {
      ZOHO_SMTP_HOST: Boolean(process.env.ZOHO_SMTP_HOST?.trim()),
      ZOHO_SMTP_PORT: Boolean(process.env.ZOHO_SMTP_PORT?.trim()),
      ZOHO_SMTP_SECURE: Boolean(process.env.ZOHO_SMTP_SECURE?.trim()),
      ZOHO_SMTP_USER: Boolean(user),
      ZOHO_SMTP_PASSWORD: Boolean(pass),
      INVITATION_FROM_EMAIL: Boolean(process.env.INVITATION_FROM_EMAIL?.trim()),
      RESEND_FROM_EMAIL: Boolean(process.env.RESEND_FROM_EMAIL?.trim()),
      EMAIL_FROM: Boolean(process.env.EMAIL_FROM?.trim()),
      NOTIFICATION_FROM_EMAIL: Boolean(process.env.NOTIFICATION_FROM_EMAIL?.trim()),
      SITE_VISIT_FROM_EMAIL: Boolean(process.env.SITE_VISIT_FROM_EMAIL?.trim()),
      REPORT_CC_FROM_EMAIL: Boolean(process.env.REPORT_CC_FROM_EMAIL?.trim()),
      FROM_EMAIL: Boolean(process.env.FROM_EMAIL?.trim()),
    },
  }
}

/**
 * Resolve invitation email configuration for Zoho SMTP at server-action execution time.
 */
export function resolveInvitationEmailConfiguration(): InvitationEmailConfiguration {
  const { host, port, secure, user, pass, senderCandidates, presence } = readEnvironment()
  const populatedCandidates = senderCandidates.filter(
    (candidate): candidate is SenderCandidate & { value: string } => Boolean(candidate.value),
  )
  const validCandidate = populatedCandidates.find((candidate) => extractSenderAddress(candidate.value))

  if (!user || !pass) {
    return {
      status: "not_configured",
      category: "missing_api_key",
      hasApiKey: false,
      senderVariable: validCandidate?.variable ?? populatedCandidates[0]?.variable ?? null,
      environmentPresence: presence,
    }
  }

  if (validCandidate) {
    return {
      status: "configured",
      host,
      port,
      secure,
      user,
      pass,
      from: validCandidate.value,
      senderVariable: validCandidate.variable,
      environmentPresence: presence,
    }
  }

  if (populatedCandidates.length) {
    return {
      status: "invalid_sender",
      category: "invalid_sender",
      hasApiKey: true,
      senderVariable: populatedCandidates[0].variable,
      environmentPresence: presence,
    }
  }

  return {
    status: "not_configured",
    category: "missing_sender",
    hasApiKey: true,
    senderVariable: null,
    environmentPresence: presence,
  }
}
