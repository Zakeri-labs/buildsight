export type ReportCcContext = "report" | "translation"

export type ProjectCcCandidate = {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  role: string
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
  createdAt: string
}

export type ExternalCcRecipientInput = {
  clientId: string
  name: string
  email: string
  company: string
  role: string
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
