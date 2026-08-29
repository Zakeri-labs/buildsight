export type CalendarEventKind =
  | "client_request"
  | "scheduled_visit"
  | "completed_visit"
  | "approved_request"
  | "cancelled"

export type CalendarEventViewModel = {
  id: string
  projectId: string
  projectName: string
  date: string
  kind: CalendarEventKind
  timeLabel: string | null
  sortMinutes: number
  secondaryLabel: string
  scheduledBy?: string | null
  requestedBy?: string | null
  notes?: string | null
  assignedUserIds?: string[]
  canEdit?: boolean
  supervisor?: { id: string; name: string } | null
}

export type CalendarClientRequestViewModel = {
  id: string
  projectId: string
  projectName: string
  requestedDate: string | null
  isAsap: boolean
  preferredTime: "morning" | "afternoon" | "any_time"
  preferredTimeLabel: string
  requestedBy: string | null
  purpose: string | null
  notes: string | null
  notesPreview: string | null
  createdAt: string
  status: "pending"
  canManage: boolean
  canApprove: boolean
}

export type CalendarSummaryViewModel = {
  pendingClientRequests: number
  upcomingVisits: number
  todaysVisits: number
}

export type CalendarSchedulingPersonViewModel = {
  id: string
  name: string
  role: string | null
}

export type CalendarSchedulingProjectViewModel = {
  id: string
  name: string
  code?: string | null
  supervisor: CalendarSchedulingPersonViewModel
  participants: CalendarSchedulingPersonViewModel[]
}

export type CalendarSchedulingViewModel = {
  canSchedule: boolean
  projects: CalendarSchedulingProjectViewModel[]
}

export type CalendarRequestProjectViewModel = {
  id: string
  name: string
  canRequest: true
  canManage: false
}

export type CalendarRequestingViewModel = {
  canRequest: boolean
  projects: CalendarRequestProjectViewModel[]
}

export type CalendarDataViewModel = {
  monthKey: string
  rangeStart: string
  rangeEnd: string
  events: CalendarEventViewModel[]
  pendingRequests: CalendarClientRequestViewModel[]
  summary: CalendarSummaryViewModel
  scheduling: CalendarSchedulingViewModel
  requesting: CalendarRequestingViewModel
}
