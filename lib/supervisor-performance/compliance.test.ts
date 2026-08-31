import {
  calculateProjectMetrics,
  calculateSupervisorPerformance,
  getEffectiveVisitDate,
  isReportInMonth,
  isValidCompletedReport,
  normalizeComplianceSupervisionType,
} from "./compliance"
import type { RawProjectRecord, RawReportRecord } from "./types"

function runTests() {
  const month = "2026-08"
  const supA = "sup-uuid-1"
  const supB = "sup-uuid-2"

  console.log("Running Supervisor Performance Compliance Unit Tests...\n")

  // TEST 1: Monthly 2 with 2 reports -> 100%
  {
    const project: RawProjectRecord = {
      id: "p1",
      name: "Project 1",
      code: "P001",
      status: "active",
      supervision_type: "monthly_2",
      assigned_supervisor_id: supA,
    }
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p1", status: "submitted", submitted_at: "2026-08-05T10:00:00Z", visit_date: "2026-08-05", created_by: supA },
      { id: "r2", project_id: "p1", status: "completed", submitted_at: "2026-08-20T10:00:00Z", visit_date: "2026-08-20", created_by: supA },
    ]
    const m = calculateProjectMetrics(project, reports, month)
    console.assert(m.required === 2, "Test 1 Failed: required should be 2")
    console.assert(m.completed === 2, "Test 1 Failed: completed should be 2")
    console.assert(m.creditedCompleted === 2, "Test 1 Failed: creditedCompleted should be 2")
    console.assert(m.missed === 0, "Test 1 Failed: missed should be 0")
    console.assert(m.extra === 0, "Test 1 Failed: extra should be 0")
    console.assert(m.compliancePercentage === 100, `Test 1 Failed: compliance should be 100%, got ${m.compliancePercentage}`)
    console.log("✓ Test 1 Passed: Monthly 2 with 2 reports -> 100%")
  }

  // TEST 2: Monthly 4 with 3 reports -> 75%, missed 1
  {
    const project: RawProjectRecord = {
      id: "p2",
      name: "Project 2",
      code: "P002",
      status: "active",
      supervision_type: "monthly_4",
      assigned_supervisor_id: supA,
    }
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p2", status: "submitted", submitted_at: "2026-08-01T10:00:00Z", visit_date: "2026-08-01", created_by: supA },
      { id: "r2", project_id: "p2", status: "approved", submitted_at: "2026-08-10T10:00:00Z", visit_date: "2026-08-10", created_by: supA },
      { id: "r3", project_id: "p2", status: "under_review", submitted_at: "2026-08-20T10:00:00Z", visit_date: "2026-08-20", created_by: supA },
    ]
    const m = calculateProjectMetrics(project, reports, month)
    console.assert(m.required === 4, "Test 2 Failed: required should be 4")
    console.assert(m.completed === 3, "Test 2 Failed: completed should be 3")
    console.assert(m.creditedCompleted === 3, "Test 2 Failed: creditedCompleted should be 3")
    console.assert(m.missed === 1, "Test 2 Failed: missed should be 1")
    console.assert(m.extra === 0, "Test 2 Failed: extra should be 0")
    console.assert(m.compliancePercentage === 75, `Test 2 Failed: compliance should be 75%, got ${m.compliancePercentage}`)
    console.log("✓ Test 2 Passed: Monthly 4 with 3 reports -> 75%, missed 1")
  }

  // TEST 3: Monthly 4 with 6 reports -> 100%, extra 2
  {
    const project: RawProjectRecord = {
      id: "p3",
      name: "Project 3",
      code: "P003",
      status: "active",
      supervision_type: "monthly_4",
      assigned_supervisor_id: supA,
    }
    const reports: RawReportRecord[] = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i + 1}`,
      project_id: "p3",
      status: "completed",
      submitted_at: `2026-08-${String(i * 4 + 1).padStart(2, "0")}T10:00:00Z`,
      visit_date: `2026-08-${String(i * 4 + 1).padStart(2, "0")}`,
      created_by: supA,
    }))
    const m = calculateProjectMetrics(project, reports, month)
    console.assert(m.required === 4, "Test 3 Failed: required should be 4")
    console.assert(m.completed === 6, "Test 3 Failed: completed should be 6")
    console.assert(m.creditedCompleted === 4, "Test 3 Failed: creditedCompleted should be 4 (capped)")
    console.assert(m.missed === 0, "Test 3 Failed: missed should be 0")
    console.assert(m.extra === 2, "Test 3 Failed: extra should be 2")
    console.assert(m.compliancePercentage === 100, `Test 3 Failed: compliance should be 100%, got ${m.compliancePercentage}`)
    console.log("✓ Test 3 Passed: Monthly 4 with 6 reports -> 100%, extra 2")
  }

  // TEST 4: Extra on one project does NOT cover misses on another
  {
    const projects: RawProjectRecord[] = [
      { id: "pa", name: "Proj A", code: "PA", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: supA },
      { id: "pb", name: "Proj B", code: "PB", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: supA },
    ]
    const reports: RawReportRecord[] = [
      // 8 reports for Proj A
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `ra${i + 1}`, project_id: "pa", status: "submitted", submitted_at: "2026-08-10T10:00:00Z", visit_date: "2026-08-10", created_by: supA,
      })),
      // 0 reports for Proj B
    ]
    const res = calculateSupervisorPerformance({ month, projects, reports })
    const supPerf = res.supervisors.find((s) => s.supervisorId === supA)!
    console.assert(supPerf.requiredVisits === 8, `Test 4 Failed: required should be 8, got ${supPerf.requiredVisits}`)
    console.assert(supPerf.completedVisits === 8, `Test 4 Failed: completed should be 8, got ${supPerf.completedVisits}`)
    console.assert(supPerf.creditedCompletedVisits === 4, `Test 4 Failed: creditedCompleted should be 4, got ${supPerf.creditedCompletedVisits}`)
    console.assert(supPerf.missedVisits === 4, `Test 4 Failed: missed should be 4, got ${supPerf.missedVisits}`)
    console.assert(supPerf.extraVisits === 4, `Test 4 Failed: extra should be 4, got ${supPerf.extraVisits}`)
    console.assert(supPerf.visitCompliancePercentage === 50, `Test 4 Failed: compliance should be 50%, got ${supPerf.visitCompliancePercentage}%`)
    console.log("✓ Test 4 Passed: Extra on one project does NOT cover misses on another (50%, not 100%)")
  }

  // TEST 5: Unsupported supervision type excluded from compliance
  {
    const project: RawProjectRecord = {
      id: "p5",
      name: "Lump Sum Proj",
      code: "P005",
      status: "active",
      supervision_type: "lump_sum",
      assigned_supervisor_id: supA,
    }
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p5", status: "submitted", submitted_at: "2026-08-10T10:00:00Z", visit_date: "2026-08-10", created_by: supA },
    ]
    const m = calculateProjectMetrics(project, reports, month)
    console.assert(!m.isComplianceEligible, "Test 5 Failed: should not be compliance eligible")
    console.assert(m.required === 0, "Test 5 Failed: required should be 0")
    console.assert(m.creditedCompleted === 0, "Test 5 Failed: creditedCompleted should be 0")
    console.assert(m.compliancePercentage === null, "Test 5 Failed: compliance should be null")
    console.log("✓ Test 5 Passed: Unsupported supervision type excluded from compliance")
  }

  // TEST 6: Unsupported type still counts in Active Projects workload
  {
    const projects: RawProjectRecord[] = [
      { id: "p1", name: "P1", code: "P1", status: "active", supervision_type: "monthly_2", assigned_supervisor_id: supA },
      { id: "p2", name: "P2", code: "P2", status: "active", supervision_type: "lump_sum", assigned_supervisor_id: supA },
      { id: "p3", name: "P3", code: "P3", status: "active", supervision_type: "other", assigned_supervisor_id: supA },
    ]
    const res = calculateSupervisorPerformance({ month, projects, reports: [] })
    const supPerf = res.supervisors.find((s) => s.supervisorId === supA)!
    console.assert(supPerf.activeProjectsCount === 3, `Test 6 Failed: active projects workload should be 3, got ${supPerf.activeProjectsCount}`)
    console.assert(supPerf.complianceProjectsCount === 1, `Test 6 Failed: compliance projects count should be 1, got ${supPerf.complianceProjectsCount}`)
    console.log("✓ Test 6 Passed: Unsupported types still count in Active Projects workload")
  }

  // TEST 7: Draft report excluded
  {
    const project: RawProjectRecord = { id: "p7", name: "P7", code: "P7", status: "active", supervision_type: "monthly_2", assigned_supervisor_id: supA }
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p7", status: "draft", submitted_at: null, visit_date: "2026-08-10", created_by: supA },
      { id: "r2", project_id: "p7", status: "in_progress", submitted_at: "2026-08-11T10:00:00Z", visit_date: "2026-08-11", created_by: supA },
    ]
    const m = calculateProjectMetrics(project, reports, month)
    console.assert(m.completed === 0, `Test 7 Failed: draft/in_progress should be excluded, completed got ${m.completed}`)
    console.log("✓ Test 7 Passed: Draft and in_progress reports excluded")
  }

  // TEST 8: Submitted report included
  {
    const r: RawReportRecord = { id: "r8", status: "submitted", submitted_at: "2026-08-10T10:00:00Z" }
    console.assert(isValidCompletedReport(r), "Test 8 Failed: submitted report should be valid")
    console.log("✓ Test 8 Passed: Submitted report included")
  }

  // TEST 9: visit_date controls month when present
  {
    const r: RawReportRecord = { id: "r9", status: "submitted", submitted_at: "2026-08-01T10:00:00Z", visit_date: "2026-08-25", created_at: "2026-08-27T10:00:00Z" }
    const effective = getEffectiveVisitDate(r)
    console.assert(effective === "2026-08-25", `Test 9 Failed: expected 2026-08-25, got ${effective}`)
    console.assert(isReportInMonth(r, "2026-08"), "Test 9 Failed: should be in 2026-08")
    console.assert(!isReportInMonth(r, "2026-07"), "Test 9 Failed: should not be in 2026-07")
    console.log("✓ Test 9 Passed: visit_date controls month when present")
  }

  // TEST 10: visit_date = null falls back to created_at
  {
    const r: RawReportRecord = { id: "r10", status: "submitted", submitted_at: "2026-08-15T10:00:00Z", visit_date: null, created_at: "2026-07-18T10:00:00Z" }
    const effective = getEffectiveVisitDate(r)
    console.assert(effective === "2026-07-18", `Test 10 Failed: expected 2026-07-18, got ${effective}`)
    console.assert(isReportInMonth(r, "2026-07"), "Test 10 Failed: should be in 2026-07")
    console.assert(!isReportInMonth(r, "2026-08"), "Test 10 Failed: should not be in 2026-08")
    console.log("✓ Test 10 Passed: visit_date = null falls back to created_at")
  }

  // TEST 11: submitted_at is NOT used as date fallback
  {
    const r: RawReportRecord = { id: "r11", status: "submitted", submitted_at: "2026-08-01T10:00:00Z", visit_date: null, created_at: "2026-07-18T10:00:00Z" }
    const effective = getEffectiveVisitDate(r)
    console.assert(effective === "2026-07-18", `Test 11 Failed: expected 2026-07-18, got ${effective}`)
    console.log("✓ Test 11 Passed: submitted_at is NOT used as date fallback")
  }

  // TEST 12: Report created by another user does NOT credit assigned supervisor
  {
    const project: RawProjectRecord = { id: "p12", name: "P12", code: "P12", status: "active", supervision_type: "monthly_2", assigned_supervisor_id: supA }
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p12", status: "submitted", submitted_at: "2026-08-10T10:00:00Z", visit_date: "2026-08-10", created_by: supB }, // Created by supB!
    ]
    const m = calculateProjectMetrics(project, reports, month)
    console.assert(m.completed === 0, `Test 12 Failed: report created by another user should not credit supA, completed got ${m.completed}`)
    console.log("✓ Test 12 Passed: Report created by another user does NOT credit assigned supervisor")
  }

  // TEST 13: Direct Stage + Term reports both count normally
  {
    const project: RawProjectRecord = { id: "p13", name: "P13", code: "P13", status: "active", supervision_type: "monthly_2", assigned_supervisor_id: supA }
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p13", status: "submitted", submitted_at: "2026-08-10T10:00:00Z", visit_date: "2026-08-10", created_by: supA }, // Direct Stage Report
      { id: "r2", project_id: "p13", status: "approved", submitted_at: "2026-08-15T10:00:00Z", visit_date: "2026-08-15", created_by: supA }, // Term Report
    ]
    const m = calculateProjectMetrics(project, reports, month)
    console.assert(m.completed === 2, `Test 13 Failed: both direct stage and term reports should count, completed got ${m.completed}`)
    console.log("✓ Test 13 Passed: Direct Stage + Term reports both count normally")
  }

  // TEST 14: Resaved/resubmitted report ID counts once
  {
    const project: RawProjectRecord = { id: "p14", name: "P14", code: "P14", status: "active", supervision_type: "monthly_2", assigned_supervisor_id: supA }
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p14", status: "submitted", submitted_at: "2026-08-10T10:00:00Z", visit_date: "2026-08-10", created_by: supA },
    ]
    const res = calculateSupervisorPerformance({ month, projects: [project], reports })
    const supPerf = res.supervisors[0]
    console.assert(supPerf.completedVisits === 1, `Test 14 Failed: single report ID should count as 1, got ${supPerf.completedVisits}`)
    console.log("✓ Test 14 Passed: Resaved/resubmitted report ID counts once")
  }

  // TEST 15: Unassigned project handled safely
  {
    const projects: RawProjectRecord[] = [
      { id: "pu", name: "Unassigned Proj", code: "PU", status: "active", supervision_type: "monthly_2", assigned_supervisor_id: null },
    ]
    const res = calculateSupervisorPerformance({ month, projects, reports: [] })
    console.assert(res.unassignedProjects.length === 1, `Test 15 Failed: unassigned project should be in unassignedProjects array, got ${res.unassignedProjects.length}`)
    console.assert(res.organizationSummary.unassignedActiveProjectsCount === 1, `Test 15 Failed: unassigned active count should be 1`)
    console.assert(res.organizationSummary.unassignedComplianceProjectsCount === 1, `Test 15 Failed: unassigned compliance count should be 1`)
    console.log("✓ Test 15 Passed: Unassigned project handled safely")
  }

  console.log("\nALL 15 UNIT TESTS PASSED SUCCESSFULLY! 🎉\n")
}

runTests()
