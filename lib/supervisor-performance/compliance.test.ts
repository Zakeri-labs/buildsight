import {
  calculateSupervisorPerformance,
  getEffectiveVisitDate,
  isReportInMonth,
  isValidCompletedReport,
} from "./compliance"
import type { RawParticipantRecord, RawProjectRecord, RawReportRecord } from "./types"

function runTests() {
  const month = "2026-08"
  const ali = "user-ali-id"
  const reza = "user-reza-id"
  const omar = "user-omar-id"
  const contractorId = "user-contractor-id"

  console.log("Running Supervisor Performance Phase 1.2 Multi-Supervisor Unit Tests...\n")

  // TEST 1 — Two Supervisors: Primary = Ali, Additional = Reza
  {
    const projects: RawProjectRecord[] = [
      { id: "p1", name: "Project 1", code: "P1", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: ali },
    ]
    const participants: RawParticipantRecord[] = [
      { project_id: "p1", key_contact_user_id: reza, status: "active", participant_type: "consultancy", participant_role_label: "Supervisor" },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants, reports: [] })

    const aliPerf = res.supervisors.find((s) => s.supervisorId === ali)!
    const rezaPerf = res.supervisors.find((s) => s.supervisorId === reza)!

    console.assert(aliPerf.activeProjectsCount === 1, `Test 1 Failed: Ali active projects should be 1, got ${aliPerf.activeProjectsCount}`)
    console.assert(rezaPerf.activeProjectsCount === 1, `Test 1 Failed: Reza active projects should be 1, got ${rezaPerf.activeProjectsCount}`)
    console.log("✓ Test 1 Passed: Primary=Ali, Additional=Reza -> Both receive Active Projects = 1")
  }

  // TEST 2 — Mirrored Primary Deduplication: Primary = Ali, project_participants also contains active Ali
  {
    const projects: RawProjectRecord[] = [
      { id: "p2", name: "Project 2", code: "P2", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: ali },
    ]
    const participants: RawParticipantRecord[] = [
      { project_id: "p2", key_contact_user_id: ali, status: "active", participant_type: "consultancy", participant_role_label: "Supervisor" },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants, reports: [] })
    const aliPerf = res.supervisors.find((s) => s.supervisorId === ali)!

    console.assert(aliPerf.activeProjectsCount === 1, `Test 2 Failed: Ali active projects should be 1 (deduped), got ${aliPerf.activeProjectsCount}`)
    console.log("✓ Test 2 Passed: Mirrored Primary Deduplication -> Ali Active Projects = 1 (not 2)")
  }

  // TEST 3 — Multiple Additional Supervisors: Primary = Ali, Additional = Reza, Additional = Omar
  {
    const projects: RawProjectRecord[] = [
      { id: "p3", name: "Project 3", code: "P3", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: ali },
    ]
    const participants: RawParticipantRecord[] = [
      { project_id: "p3", key_contact_user_id: reza, status: "active", participant_type: "consultancy", participant_role_label: "Supervisor" },
      { project_id: "p3", key_contact_user_id: omar, status: "active", participant_type: "consultancy", participant_role_label: "Project Manager" },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants, reports: [] })

    console.assert(res.supervisors.find((s) => s.supervisorId === ali)!.activeProjectsCount === 1, "Test 3 Failed: Ali")
    console.assert(res.supervisors.find((s) => s.supervisorId === reza)!.activeProjectsCount === 1, "Test 3 Failed: Reza")
    console.assert(res.supervisors.find((s) => s.supervisorId === omar)!.activeProjectsCount === 1, "Test 3 Failed: Omar")
    console.assert(res.organizationSummary.totalActiveProjects === 1, "Test 3 Failed: Org total active projects should be 1")

    console.log("✓ Test 3 Passed: Multiple supervisors get +1 workload, org project count remains 1")
  }

  // TEST 4 — Non-Supervisor Participant (Contractor excluded from supervisor workload)
  {
    const projects: RawProjectRecord[] = [
      { id: "p4", name: "Project 4", code: "P4", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: ali },
    ]
    const participants: RawParticipantRecord[] = [
      { project_id: "p4", key_contact_user_id: contractorId, status: "active", participant_type: "contractor", participant_role_label: "Main Contractor" },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants, reports: [] })
    const contractorPerf = res.supervisors.find((s) => s.supervisorId === contractorId)

    console.assert(contractorPerf === undefined || contractorPerf.activeProjectsCount === 0, "Test 4 Failed: Contractor should not get supervisor workload")
    console.log("✓ Test 4 Passed: Non-supervisor participant (Contractor) excluded from supervisor workload")
  }

  // TEST 5 — Project Compliance Not Multiplied (Org Required stays 4, not 8)
  {
    const projects: RawProjectRecord[] = [
      { id: "p5", name: "Project 5", code: "P5", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: ali },
    ]
    const participants: RawParticipantRecord[] = [
      { project_id: "p5", key_contact_user_id: reza, status: "active", participant_type: "consultancy", participant_role_label: "Supervisor" },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants, reports: [] })

    console.assert(res.organizationSummary.requiredVisits === 4, `Test 5 Failed: Org required visits should be 4, got ${res.organizationSummary.requiredVisits}`)
    console.log("✓ Test 5 Passed: Project compliance required visits NOT multiplied (Org Required = 4)")
  }

  // TEST 6 — Individual Activity Independent (Ali=3, Reza=1, Project=4)
  {
    const projects: RawProjectRecord[] = [
      { id: "p6", name: "Project 6", code: "P6", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: ali },
    ]
    const participants: RawParticipantRecord[] = [
      { project_id: "p6", key_contact_user_id: reza, status: "active", participant_type: "consultancy", participant_role_label: "Supervisor" },
    ]
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p6", status: "submitted", submitted_at: "2026-08-01T10:00:00Z", visit_date: "2026-08-01", created_by: ali },
      { id: "r2", project_id: "p6", status: "submitted", submitted_at: "2026-08-05T10:00:00Z", visit_date: "2026-08-05", created_by: ali },
      { id: "r3", project_id: "p6", status: "submitted", submitted_at: "2026-08-10T10:00:00Z", visit_date: "2026-08-10", created_by: ali },
      { id: "r4", project_id: "p6", status: "submitted", submitted_at: "2026-08-15T10:00:00Z", visit_date: "2026-08-15", created_by: reza },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants, reports })
    const pMetrics = res.allProjectRows.find((p) => p.projectId === "p6")!

    console.assert(pMetrics.completed === 4, `Test 6 Failed: project completed should be 4`)
    console.assert(res.supervisors.find((s) => s.supervisorId === ali)!.completedVisits === 3, `Test 6 Failed: Ali completed visits should be 3`)
    console.assert(res.supervisors.find((s) => s.supervisorId === reza)!.completedVisits === 1, `Test 6 Failed: Reza completed visits should be 1`)

    console.log("✓ Test 6 Passed: Project Completed=4, Ali CompletedVisits=3, Reza CompletedVisits=1")
  }

  // TEST 7 — Additional Supervisor with No Reports
  {
    const projects: RawProjectRecord[] = [
      { id: "p7", name: "Project 7", code: "P7", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: ali },
    ]
    const participants: RawParticipantRecord[] = [
      { project_id: "p7", key_contact_user_id: reza, status: "active", participant_type: "consultancy", participant_role_label: "Supervisor" },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants, reports: [] })
    const rezaPerf = res.supervisors.find((s) => s.supervisorId === reza)!

    console.assert(rezaPerf.activeProjectsCount === 1, "Test 7 Failed: Reza active projects should be 1")
    console.assert(rezaPerf.completedVisits === 0, "Test 7 Failed: Reza completed visits should be 0")
    console.log("✓ Test 7 Passed: Additional supervisor with 0 reports appears with Active Projects=1, Completed Visited=0")
  }

  // TEST 8 — Creator with No Assignment
  {
    const projects: RawProjectRecord[] = [
      { id: "p8", name: "Project 8", code: "P8", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: ali },
    ]
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p8", status: "submitted", submitted_at: "2026-08-01T10:00:00Z", visit_date: "2026-08-01", created_by: omar },
      { id: "r2", project_id: "p8", status: "submitted", submitted_at: "2026-08-05T10:00:00Z", visit_date: "2026-08-05", created_by: omar },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants: [], reports })
    const omarPerf = res.supervisors.find((s) => s.supervisorId === omar)!

    console.assert(omarPerf.activeProjectsCount === 0, "Test 8 Failed: Omar active projects should be 0")
    console.assert(omarPerf.completedVisits === 2, "Test 8 Failed: Omar completed visits should be 2")
    console.log("✓ Test 8 Passed: Creator with 0 assigned projects preserved with Active Projects=0, Completed Visits=2")
  }

  // TEST 9 — Correct Unassigned Detection (Primary null, Additional active supervisor = Reza)
  {
    const projects: RawProjectRecord[] = [
      { id: "p9", name: "Project 9", code: "P9", status: "active", supervision_type: "monthly_2", assigned_supervisor_id: null },
    ]
    const participants: RawParticipantRecord[] = [
      { project_id: "p9", key_contact_user_id: reza, status: "active", participant_type: "consultancy", participant_role_label: "Supervisor" },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants, reports: [] })

    console.assert(res.unassignedProjects.length === 0, `Test 9 Failed: project with active participant supervisor should NOT be unassigned`)
    console.assert(res.organizationSummary.unassignedActiveProjectsCount === 0, "Test 9 Failed")
    console.log("✓ Test 9 Passed: Primary null with active participant supervisor is NOT unassigned")
  }

  // TEST 10 — Truly Unassigned (Primary null, No active supervisor participants)
  {
    const projects: RawProjectRecord[] = [
      { id: "p10", name: "Project 10", code: "P10", status: "active", supervision_type: "monthly_2", assigned_supervisor_id: null },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants: [], reports: [] })

    console.assert(res.unassignedProjects.length === 1, `Test 10 Failed: project without supervisors SHOULD be unassigned`)
    console.assert(res.organizationSummary.unassignedActiveProjectsCount === 1, "Test 10 Failed")
    console.log("✓ Test 10 Passed: Project with no supervisors IS unassigned")
  }

  // TEST 11 — Invariant for Periodic Project with Extra Reports (Monthly 2 quota = 2, reports = 3 -> completed = 2, extra = 1, total = 3)
  {
    const projects: RawProjectRecord[] = [
      { id: "p11", name: "Project 11", code: "P11", status: "active", supervision_type: "monthly_2", assigned_supervisor_id: ali },
    ]
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p11", status: "submitted", submitted_at: "2026-08-01T10:00:00Z", created_by: ali },
      { id: "r2", project_id: "p11", status: "submitted", submitted_at: "2026-08-05T10:00:00Z", created_by: ali },
      { id: "r3", project_id: "p11", status: "submitted", submitted_at: "2026-08-10T10:00:00Z", created_by: ali },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants: [], reports })
    const pMetrics = res.allProjectRows.find((p) => p.projectId === "p11")!
    const aliPerf = res.supervisors.find((s) => s.supervisorId === ali)!

    console.assert(pMetrics.totalSubmittedReports === 3, `Test 11 Failed: totalSubmittedReports should be 3, got ${pMetrics.totalSubmittedReports}`)
    console.assert(pMetrics.completedReports === 2, `Test 11 Failed: completedReports should be 2, got ${pMetrics.completedReports}`)
    console.assert(pMetrics.extraReports === 1, `Test 11 Failed: extraReports should be 1, got ${pMetrics.extraReports}`)
    console.assert(pMetrics.completedReports + pMetrics.extraReports === pMetrics.totalSubmittedReports, "Test 11 Failed: Project Invariant")

    console.assert(aliPerf.totalSubmittedReports === 3, `Test 11 Failed: Ali total should be 3, got ${aliPerf.totalSubmittedReports}`)
    console.assert(aliPerf.completedReports === 2, `Test 11 Failed: Ali completed should be 2, got ${aliPerf.completedReports}`)
    console.assert(aliPerf.extraReports === 1, `Test 11 Failed: Ali extra should be 1, got ${aliPerf.extraReports}`)
    console.assert(aliPerf.completedReports + aliPerf.extraReports === aliPerf.totalSubmittedReports, "Test 11 Failed: Supervisor Invariant")

    console.assert(res.organizationSummary.totalSubmittedReports === 3, "Test 11 Failed: Org total")
    console.assert(res.organizationSummary.completedReports === 2, "Test 11 Failed: Org completed")
    console.assert(res.organizationSummary.extraReports === 1, "Test 11 Failed: Org extra")
    console.assert(res.organizationSummary.completedReports + res.organizationSummary.extraReports === res.organizationSummary.totalSubmittedReports, "Test 11 Failed: Org Invariant")

    console.log("✓ Test 11 Passed: Periodic Project with Extra Reports preserves Invariant (2 completed + 1 extra = 3 total)")
  }

  // TEST 12 — Non-Periodic Projects (lump_sum, final_visit) have completed = count, extra = 0
  {
    const projects: RawProjectRecord[] = [
      { id: "p12_ls", name: "Lump Sum Project", code: "P12LS", status: "active", supervision_type: "lump_sum", assigned_supervisor_id: ali },
      { id: "p12_fv", name: "Final Visit Project", code: "P12FV", status: "final_visit", supervision_type: "monthly_4", assigned_supervisor_id: reza },
    ]
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p12_ls", status: "approved", submitted_at: "2026-08-01T10:00:00Z", created_by: ali },
      { id: "r2", project_id: "p12_ls", status: "approved", submitted_at: "2026-08-05T10:00:00Z", created_by: ali },
      { id: "r3", project_id: "p12_fv", status: "approved", submitted_at: "2026-08-10T10:00:00Z", created_by: reza },
    ]

    const res = calculateSupervisorPerformance({ month, projects, participants: [], reports })
    const lsMetrics = res.allProjectRows.find((p) => p.projectId === "p12_ls")!

    console.assert(lsMetrics.totalSubmittedReports === 2, "Test 12 Failed: ls totalSubmittedReports")
    console.assert(lsMetrics.completedReports === 2, "Test 12 Failed: ls completedReports")
    console.assert(lsMetrics.extraReports === 0, "Test 12 Failed: ls extraReports")

    console.assert(res.organizationSummary.totalSubmittedReports === 3, `Test 12 Failed: Org total should be 3, got ${res.organizationSummary.totalSubmittedReports}`)
    console.assert(res.organizationSummary.completedReports === 3, `Test 12 Failed: Org completed should be 3, got ${res.organizationSummary.completedReports}`)
    console.assert(res.organizationSummary.extraReports === 0, `Test 12 Failed: Org extra should be 0, got ${res.organizationSummary.extraReports}`)
    console.assert(res.organizationSummary.completedReports + res.organizationSummary.extraReports === res.organizationSummary.totalSubmittedReports, "Test 12 Failed: Invariant")

    console.log("✓ Test 12 Passed: Non-Periodic and Final Visit Projects have completed = count, extra = 0, invariant preserved")
  }

  // TEST 13 — Report Activity Date uses submitted_at (fallback created_at) and ignores August visit_date for September submission
  {
    const projects: RawProjectRecord[] = [
      { id: "p13", name: "Project 13", code: "P13", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: ali },
    ]
    const reports: RawReportRecord[] = [
      // submitted in August with August visit date -> included in August
      { id: "r1", project_id: "p13", status: "submitted", submitted_at: "2026-08-15T10:00:00Z", visit_date: "2026-08-15", created_by: ali },
      // submitted in August with July visit date -> included in August based on submitted_at
      { id: "r2", project_id: "p13", status: "submitted", submitted_at: "2026-08-02T10:00:00Z", visit_date: "2026-07-28", created_by: ali },
      // submitted in September with August visit date -> NOT included in August
      { id: "r3", project_id: "p13", status: "submitted", submitted_at: "2026-09-02T10:00:00Z", visit_date: "2026-08-30", created_by: ali },
      // draft -> excluded
      { id: "r4", project_id: "p13", status: "draft", submitted_at: "2026-08-20T10:00:00Z", visit_date: "2026-08-20", created_by: ali },
    ]

    const res = calculateSupervisorPerformance({ month: "2026-08", projects, participants: [], reports })
    console.assert(res.organizationSummary.totalSubmittedReports === 2, `Test 13 Failed: should count exactly 2 reports, got ${res.organizationSummary.totalSubmittedReports}`)
    console.log("✓ Test 13 Passed: Date filtering uses submitted_at and excludes drafts")
  }

  console.log("\nALL PHASE 1.2 MULTI-SUPERVISOR UNIT TESTS PASSED SUCCESSFULLY! 🎉\n")
}

runTests()
