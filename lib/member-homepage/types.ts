import type { VisitComplianceSupervisionType } from "@/lib/site-visits/compliance"

export type MemberHomepageSummary = {
  completedReportsToday: number
  requiredReportsToday: number
  tomorrowsVisits: number
  pendingVisitRequests: number
}

export type MemberHomepageRequest = {
  id: string
  requestedDate: string | null
  preferredTimeLabel: string | null
  projectName: string
  projectCode: string | null
  stageName: string | null
  visitNumber: number | null
}

export type MemberHomepageVisit = {
  id: string
  status: "scheduled" | "completed"
  scheduledDate: string
  scheduledTime: string | null
  projectName: string
  projectCode: string | null
  stageName: string | null
  visitNumber: number | null
  stageResponseHref: string | null
  googleMapsUrl: string | null
}

export type MemberHomepageVisitComplianceProject = {
  projectId: string
  projectName: string
  projectCode: string | null
  supervisionType: VisitComplianceSupervisionType
  state: "overdue" | "due_today" | "due_soon"
  lastCompletedVisitDate: string | null
  nextRequiredVisitDate: string
  daysRemaining: number | null
  daysOverdue: number | null
}

export type MemberHomepageVisitCompliance = {
  eligibleProjectCount: number
  projects: MemberHomepageVisitComplianceProject[]
}

export type MemberHomepageData = {
  summary: MemberHomepageSummary
  visitCompliance: MemberHomepageVisitCompliance
  requests: MemberHomepageRequest[]
  visits: MemberHomepageVisit[]
  visitComplianceHasError: boolean
  visitRequestsHasError: boolean
  tomorrowsVisitsHasError: boolean
  todaysReportsHasError: boolean
}
