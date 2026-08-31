export type SupervisionComplianceType = "monthly_2" | "monthly_3" | "monthly_4"

export type ProjectComplianceMetrics = {
  projectId: string
  projectName: string
  projectCode: string
  assignedSupervisorId: string | null
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
  requiredVisits: number
  completedVisits: number
  creditedCompletedVisits: number
  missedVisits: number
  extraVisits: number
  visitCompliancePercentage: number | null
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
  supervision_start_date?: string | null
}

export type RawReportRecord = {
  id: string
  project_id?: string | null
  projectId?: string | null
  status: string | null
  submitted_at?: string | null
  submittedAt?: string | null
  visit_date?: string | null
  visitDate?: string | null
  created_at?: string | null
  createdAt?: string | null
  created_by?: string | null
  createdBy?: string | null
}
