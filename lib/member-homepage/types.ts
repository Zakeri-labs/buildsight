export type MemberHomepageSummary = {
  todaysReports: number
  todaysVisits: number
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
  scheduledDate: string
  scheduledTime: string | null
  projectName: string
  projectCode: string | null
  stageName: string | null
  visitNumber: number | null
}

export type MemberHomepageData = {
  summary: MemberHomepageSummary
  requests: MemberHomepageRequest[]
  visits: MemberHomepageVisit[]
  hasError: boolean
}
