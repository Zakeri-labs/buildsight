export type ReportCcContext = "report" | "translation"

export type ProjectCcCandidate = {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  phone?: string | null
  isExternalContact?: boolean
  role: string
  roleKey?: string | null
  defaultPriority?: number | null
  organizationName: string | null
}

export type ReportCcRecipient = {
  id: string
  context: ReportCcContext
  type: "internal" | "external"
  userId: string | null
  name: string
  email: string | null
  company: string | null
  role: string | null
  avatarUrl: string | null
  phone?: string | null
  group?: "reportTo" | "ccTo" | null
  createdAt: string
}

export type ExternalCcRecipientInput = {
  clientId: string
  name: string
  email: string
  company: string
  role: string
  group?: "reportTo" | "ccTo"
}

export type ReportCcSelection = {
  internalUserIds: string[]
  externalRecipients: ExternalCcRecipientInput[]
  reportToUserIds?: string[]
  ccToUserIds?: string[]
}

export type ReportCcNotificationItem = {
  id: string
  notificationKey: string
  context: ReportCcContext
  projectId: string
  projectName: string
  stageName: string
  termName: string
  reportId: string
  reportNumber: string
  reportTitle: string
  addedById: string | null
  addedByName: string
  createdAt: string
  href: string
}

export function partitionReportCcRecipients(recipients: ReportCcRecipient[]): {
  reportToRecipients: ReportCcRecipient[]
  ccRecipients: ReportCcRecipient[]
} {
  if (!recipients.length) {
    return { reportToRecipients: [], ccRecipients: [] }
  }

  const hasExplicitGroup = recipients.some((r) => r.group === "reportTo" || r.group === "ccTo")

  if (hasExplicitGroup) {
    const reportToRecipients: ReportCcRecipient[] = []
    const ccRecipients: ReportCcRecipient[] = []

    for (const r of recipients) {
      if (r.group === "reportTo") {
        reportToRecipients.push(r)
      } else if (r.group === "ccTo") {
        ccRecipients.push(r)
      } else {
        if (!reportToRecipients.length) {
          reportToRecipients.push(r)
        } else {
          ccRecipients.push(r)
        }
      }
    }
    return { reportToRecipients, ccRecipients }
  }

  // Legacy fallback for historical rows where recipient_group IS NULL for all rows
  return {
    reportToRecipients: recipients.slice(0, 1),
    ccRecipients: recipients.slice(1),
  }
}
