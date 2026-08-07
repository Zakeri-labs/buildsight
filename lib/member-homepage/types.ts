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

export type MemberHomepageData = {
  summary: MemberHomepageSummary
  requests: MemberHomepageRequest[]
  visits: MemberHomepageVisit[]
  visitRequestsHasError: boolean
  tomorrowsVisitsHasError: boolean
  todaysReportsHasError: boolean
}
