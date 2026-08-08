export const SITE_VISIT_STATUSES = ["pending", "scheduled", "completed", "cancelled"] as const
export type SiteVisitStatus = (typeof SITE_VISIT_STATUSES)[number]

export const SITE_VISIT_PREFERRED_TIMES = ["morning", "afternoon", "any_time"] as const
export type SiteVisitPreferredTime = (typeof SITE_VISIT_PREFERRED_TIMES)[number]

export type SiteVisitProjectAccess = {
  id: string
  name: string
  code?: string | null
  canRequest: boolean
  canManage: boolean
}

export type SiteVisitPerson = {
  id: string
  name: string
  email?: string | null
  role?: string | null
  phone?: string | null
}

export type SiteVisitListItem = {
  id: string
  projectId: string
  projectName: string
  requestedById: string
  requestedBy: string
  status: SiteVisitStatus
  preferredDate: string | null
  isAsap: boolean
  preferredTime: SiteVisitPreferredTime
  purpose: string
  notes: string | null
  scheduledDate: string | null
  scheduledTime: string | null
  scheduledNotes: string | null
  scheduledBy: string | null
  assignedParticipants: SiteVisitPerson[]
  whatsappRecipients: SiteVisitPerson[]
  teamMembers: SiteVisitPerson[]
  createdAt: string
  updatedAt: string
  canManage: boolean
  canRequest: boolean
}

export type SiteVisitPageData = {
  projects: SiteVisitProjectAccess[]
  requests: SiteVisitListItem[]
  selectedProjectId: string | null
  selectedProjectName: string | null
  canRequestAny: boolean
  canManageAny: boolean
  unauthorizedProject: boolean
}

export type ProjectSiteVisitSummary = {
  projectId: string
  canRequest: boolean
  canManage: boolean
  counts: Record<SiteVisitStatus, number>
  recent: SiteVisitListItem[]
}

export type SiteVisitTaskItem = {
  id: string
  projectId: string
  projectName: string
  requestedById: string
  requestedBy: string
  preferredVisit: string
  createdAt: string
  status: "pending"
  purpose: string
  href: string
  notificationKey: string
}
