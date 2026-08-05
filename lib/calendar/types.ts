export type CalendarEventKind =
  | "client_request"
  | "scheduled_visit"
  | "approved_request"
  | "cancelled"

export type CalendarEventViewModel = {
  id: string
  projectId: string
  projectName: string
  date: string
  kind: CalendarEventKind
  timeLabel: string | null
  secondaryLabel: string
}

export type CalendarClientRequestViewModel = {
  id: string
  projectId: string
  projectName: string
  requestedDate: string | null
  isAsap: boolean
  preferredTimeLabel: string
  requestedBy: string | null
  notesPreview: string | null
  status: "pending"
}

export type CalendarSummaryViewModel = {
  pendingClientRequests: number
  upcomingVisits: number
  todaysVisits: number
}

export type CalendarDataViewModel = {
  monthKey: string
  rangeStart: string
  rangeEnd: string
  events: CalendarEventViewModel[]
  pendingRequests: CalendarClientRequestViewModel[]
  summary: CalendarSummaryViewModel
}
