export type SupervisionComplianceType = "monthly_2" | "monthly_3" | "monthly_4"

export type ProjectComplianceMetrics = {
  projectId: string
  projectName: string
  projectCode: string
  assignedSupervisorId: string | null
  supervisorIds: string[]
  supervisionType: string | null
  normalizedSupervisionType: SupervisionComplianceType | null
  isComplianceEligible: boolean
  required: number
  completed: number
  creditedCompleted: number
  missed: number
  extra: number
  compliancePercentage: number | null
}

export type SupervisorPerformanceMetrics = {
  supervisorId: string
  supervisorName: string
  supervisorEmail: string | null
  supervisorAvatarUrl: string | null
  activeProjectsCount: number
  complianceProjectsCount: number
  completedVisits: number
  projects: ProjectComplianceMetrics[]
}

export type OrganizationPerformanceSummary = {
  totalActiveProjects: number
  activeSupervisorsCount: number
  complianceEligibleProjectsCount: number
  requiredVisits: number
  completedVisits: number
  creditedCompletedVisits: number
  missedVisits: number
  extraVisits: number
  visitCompliancePercentage: number | null
  unassignedActiveProjectsCount: number
  unassignedComplianceProjectsCount: number
}

export type SupervisorPerformanceData = {
  month: string // YYYY-MM format e.g. "2026-08"
  organizationSummary: OrganizationPerformanceSummary
  supervisors: SupervisorPerformanceMetrics[]
  unassignedProjects: ProjectComplianceMetrics[]
  allProjectRows: ProjectComplianceMetrics[]
}

export type RawProjectRecord = {
  id: string
  name: string
  code: string
  status: string | null
  supervision_type?: string | null
  supervisionType?: string | null
  assigned_supervisor_id?: string | null
  assignedSupervisorId?: string | null
  supervising_organization_id?: string | null
  supervisingOrganizationId?: string | null
  start_date?: string | null
  startDate?: string | null
  supervision_start_date?: string | null
  supervisionStartDate?: string | null
}

export type RawParticipantRecord = {
  id?: string
  project_id?: string | null
  projectId?: string | null
  key_contact_user_id?: string | null
  keyContactUserId?: string | null
  status?: string | null
  participant_type?: string | null
  participantType?: string | null
  project_role?: string | null
  projectRole?: string | null
  participant_role_label?: string | null
  participantRoleLabel?: string | null
}

export type RawReportRecord = {
  id: string
  project_id?: string | null
  projectId?: string | null
  project_stage_id?: string | null
  projectStageId?: string | null
  status: string | null
  submitted_at?: string | null
  submittedAt?: string | null
  visit_date?: string | null
  visitDate?: string | null
  created_at?: string | null
  createdAt?: string | null
  created_by?: string | null
  createdBy?: string | null
  report_number?: string | null
  reportNumber?: string | null
  report_title?: string | null
  reportTitle?: string | null
  visit_number?: number | string | null
  visitNumber?: number | string | null
}

export type CompliancePeriodStatus =
  | "done"
  | "missing"
  | "upcoming"
  | "extra"
  | "not_applicable"

export type ComplianceReportItem = {
  id: string
  projectId: string
  stageId?: string | null
  href?: string | null
  reportNumber: string | null
  visitNumber: number | null
  visitDate: string // YYYY-MM-DD
  status: string
  createdBy: string | null
  creatorName: string | null
  reportTitle: string | null
}

export type CompliancePeriod = {
  id: string
  projectId: string
  monthKey: string // YYYY-MM
  periodIndex: number // 1, 2, 3, or 4
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  requiredVisits: number
  actualVisits: number
  status: CompliancePeriodStatus
  reports: ComplianceReportItem[]
}

export type ComplianceCalendarWeek = {
  weekIndex: number
  weekKey: string // e.g. "2026-08-30_2026-09-05"
  startDate: string // YYYY-MM-DD (Sunday)
  endDate: string // YYYY-MM-DD (Saturday)
  label: string // e.g. "Aug 30 - Sep 5"
  isCurrentWeek: boolean
  isPastWeek: boolean
  isFutureWeek: boolean
}

export type ProjectWeeklyCell = {
  weekKey: string
  startDate: string
  endDate: string
  requiredVisits: number
  completedVisits: number
  status: CompliancePeriodStatus
  actualReports: ComplianceReportItem[]
  totalActualVisits: number
  primaryStatus: CompliancePeriodStatus | null
  overlappingPeriods: CompliancePeriod[]
}

export type ProjectComplianceTimelineRow = {
  projectId: string
  projectName: string
  projectCode: string
  status: string | null
  normalizedStatus: string
  supervisionType: string | null
  normalizedSupervisionType: SupervisionComplianceType | null
  isComplianceEligible: boolean
  startDate: string | null
  supervisionStartDate: string | null
  assignedSupervisorId: string | null
  supervisorIds: string[]
  supervisors: Array<{
    id: string
    name: string
    email: string | null
    avatarUrl: string | null
    isPrimary: boolean
  }>
  periods: CompliancePeriod[]
  weeklyCells: Record<string, ProjectWeeklyCell>
}

export type SupervisorVisitComplianceDashboardData = {
  rangeStart: string
  rangeEnd: string
  referenceDate: string
  weeks: ComplianceCalendarWeek[]
  projects: ProjectComplianceTimelineRow[]
  supervisors: Array<{
    id: string
    name: string
    email: string | null
    avatarUrl: string | null
    assignedProjectsCount: number
  }>
}
