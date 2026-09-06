import { addCalendarDays } from "@/lib/calendar/date"
import {
  buildProjectTimelineRow,
  calculateSupervisorVisitCompliance,
  evaluateCompliancePeriod,
  formatWeekLabel,
  generateCalendarWeeks,
  generateRequirementPeriodTemplates,
  generateWeeklyWindow,
  getDaysInMonth,
  getSaturdayForDateKey,
  getSundayForDateKey,
} from "./compliance-engine"
import type {
  RawParticipantRecord,
  RawProjectRecord,
  RawReportRecord,
} from "./types"

function runUnitTests() {
  console.log("================================================================================")
  console.log("SUPERVISOR VISIT COMPLIANCE DOMAIN ENGINE UNIT TESTS")
  console.log("================================================================================\n")

  const today = "2026-09-18" // mid-September 2026 reference date

  // -----------------------------------------------------------------------------
  // TEST GROUP 1: Monthly 2 Periods (28, 29, 30, 31 day months)
  // -----------------------------------------------------------------------------
  console.log("--- 1. Monthly 2 Requirement Periods ---")
  {
    // 28-day month (Feb 2027)
    const feb28 = generateRequirementPeriodTemplates("2027-02", "monthly_2")
    console.assert(feb28.length === 2, "Feb 28 should have 2 periods")
    console.assert(feb28[0].startDate === "2027-02-01" && feb28[0].endDate === "2027-02-15", "Feb 28 P1: 1-15")
    console.assert(feb28[1].startDate === "2027-02-16" && feb28[1].endDate === "2027-02-28", "Feb 28 P2: 16-28")

    // 29-day month (Feb 2028 leap)
    const feb29 = generateRequirementPeriodTemplates("2028-02", "monthly_2")
    console.assert(feb29[1].startDate === "2028-02-16" && feb29[1].endDate === "2028-02-29", "Feb 29 P2: 16-29")

    // 30-day month (Sep 2026)
    const sep30 = generateRequirementPeriodTemplates("2026-09", "monthly_2")
    console.assert(sep30[0].startDate === "2026-09-01" && sep30[0].endDate === "2026-09-15", "Sep 30 P1: 1-15")
    console.assert(sep30[1].startDate === "2026-09-16" && sep30[1].endDate === "2026-09-30", "Sep 30 P2: 16-30")

    // 31-day month (Aug 2026)
    const aug31 = generateRequirementPeriodTemplates("2026-08", "monthly_2")
    console.assert(aug31[0].startDate === "2026-08-01" && aug31[0].endDate === "2026-08-15", "Aug 31 P1: 1-15")
    console.assert(aug31[1].startDate === "2026-08-16" && aug31[1].endDate === "2026-08-31", "Aug 31 P2: 16-31")

    console.log("✓ Monthly 2 period boundaries correctly generated across 28, 29, 30, and 31-day months.")
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 2: Monthly 2 Visits: Day 15, Day 16, Two Close Visits, Zero, Extra
  // -----------------------------------------------------------------------------
  console.log("\n--- 2. Monthly 2 Visits & Boundaries ---")
  {
    const sepTemplates = generateRequirementPeriodTemplates("2026-09", "monthly_2")

    // Visit on Day 15 (should satisfy P1)
    const repDay15: RawReportRecord[] = [
      { id: "r15", project_id: "p1", status: "submitted", submitted_at: "2026-09-15T10:00:00Z", visit_date: "2026-09-15" },
    ]
    const p1Result = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: sepTemplates[0],
      projectReports: repDay15,
      projectStartDate: "2026-01-01",
      projectStatus: "active",
      today,
    })
    console.assert(p1Result.actualVisits === 1 && p1Result.status === "done", "Visit on Day 15 satisfies P1")

    // Visit on Day 16 (should satisfy P2)
    const repDay16: RawReportRecord[] = [
      { id: "r16", project_id: "p1", status: "submitted", submitted_at: "2026-09-16T10:00:00Z", visit_date: "2026-09-16" },
    ]
    const p2Result = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: sepTemplates[1],
      projectReports: repDay16,
      projectStartDate: "2026-01-01",
      projectStatus: "active",
      today,
    })
    console.assert(p2Result.actualVisits === 1 && p2Result.status === "done", "Visit on Day 16 satisfies P2")

    // Two visits close together (Day 14 and Day 16): both are valid for their respective periods
    const repClose: RawReportRecord[] = [
      { id: "r14", project_id: "p1", status: "submitted", submitted_at: "2026-09-14T10:00:00Z", visit_date: "2026-09-14" },
      { id: "r16", project_id: "p1", status: "submitted", submitted_at: "2026-09-16T10:00:00Z", visit_date: "2026-09-16" },
    ]
    const p1Close = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: sepTemplates[0],
      projectReports: repClose,
      projectStartDate: "2026-01-01",
      projectStatus: "active",
      today,
    })
    const p2Close = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: sepTemplates[1],
      projectReports: repClose,
      projectStartDate: "2026-01-01",
      projectStatus: "active",
      today,
    })
    console.assert(p1Close.actualVisits === 1 && p1Close.status === "done", "Day 14 satisfies P1")
    console.assert(p2Close.actualVisits === 1 && p2Close.status === "done", "Day 16 satisfies P2 (2 days apart)")

    // Zero visits in past period (P1 ended on Sep 15, today is Sep 18 -> missing)
    const p1Zero = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: sepTemplates[0],
      projectReports: [],
      projectStartDate: "2026-01-01",
      projectStatus: "active",
      today,
    })
    console.assert(p1Zero.actualVisits === 0 && p1Zero.status === "missing", "Zero visits in elapsed period -> missing")

    // Zero visits in current/future period (P2 ends Sep 30, today is Sep 18 -> upcoming)
    const p2Zero = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: sepTemplates[1],
      projectReports: [],
      projectStartDate: "2026-01-01",
      projectStatus: "active",
      today,
    })
    console.assert(p2Zero.actualVisits === 0 && p2Zero.status === "upcoming", "Zero visits in pending period -> upcoming")

    // Extra visits (2 visits in P1 -> extra)
    const repExtra: RawReportRecord[] = [
      { id: "r1", project_id: "p1", status: "submitted", submitted_at: "2026-09-02T10:00:00Z", visit_date: "2026-09-02" },
      { id: "r2", project_id: "p1", status: "submitted", submitted_at: "2026-09-10T10:00:00Z", visit_date: "2026-09-10" },
    ]
    const p1Extra = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: sepTemplates[0],
      projectReports: repExtra,
      projectStartDate: "2026-01-01",
      projectStatus: "active",
      today,
    })
    console.assert(p1Extra.actualVisits === 2 && p1Extra.status === "extra" && p1Extra.requiredVisits === 1, "2 visits in 1-visit period -> extra")

    console.log("✓ Monthly 2 visit evaluation, boundary dates, zero-visits (missing vs upcoming), and extra visits verified.")
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 3: Monthly 3 Periods: Day 10, 11, 20, 21, and variable final period
  // -----------------------------------------------------------------------------
  console.log("\n--- 3. Monthly 3 Requirement Periods & Boundaries ---")
  {
    const m3Templates = generateRequirementPeriodTemplates("2026-09", "monthly_3")
    console.assert(m3Templates.length === 3, "Monthly 3 has 3 periods")
    console.assert(m3Templates[0].startDate === "2026-09-01" && m3Templates[0].endDate === "2026-09-10", "P1: 1-10")
    console.assert(m3Templates[1].startDate === "2026-09-11" && m3Templates[1].endDate === "2026-09-20", "P2: 11-20")
    console.assert(m3Templates[2].startDate === "2026-09-21" && m3Templates[2].endDate === "2026-09-30", "P3: 21-30")

    // Feb 28-day month: P3 is 21-28 (8 days)
    const febM3 = generateRequirementPeriodTemplates("2027-02", "monthly_3")
    console.assert(febM3[2].startDate === "2027-02-21" && febM3[2].endDate === "2027-02-28", "Feb P3: 21-28")

    // Day 10 vs Day 11
    const repDay10: RawReportRecord[] = [{ id: "r10", status: "submitted", submitted_at: "2026-09-10T00:00:00Z", visit_date: "2026-09-10" }]
    const repDay11: RawReportRecord[] = [{ id: "r11", status: "submitted", submitted_at: "2026-09-11T00:00:00Z", visit_date: "2026-09-11" }]

    const p1Eval = evaluateCompliancePeriod({ projectId: "p1", monthKey: "2026-09", template: m3Templates[0], projectReports: repDay10, projectStartDate: null, projectStatus: "active", today })
    const p2Eval11 = evaluateCompliancePeriod({ projectId: "p1", monthKey: "2026-09", template: m3Templates[1], projectReports: repDay11, projectStartDate: null, projectStatus: "active", today })

    console.assert(p1Eval.actualVisits === 1 && p1Eval.status === "done", "Day 10 satisfies P1")
    console.assert(p2Eval11.actualVisits === 1 && p2Eval11.status === "done", "Day 11 satisfies P2")

    // Day 20 vs Day 21
    const repDay20: RawReportRecord[] = [{ id: "r20", status: "submitted", submitted_at: "2026-09-20T00:00:00Z", visit_date: "2026-09-20" }]
    const repDay21: RawReportRecord[] = [{ id: "r21", status: "submitted", submitted_at: "2026-09-21T00:00:00Z", visit_date: "2026-09-21" }]

    const p2Eval20 = evaluateCompliancePeriod({ projectId: "p1", monthKey: "2026-09", template: m3Templates[1], projectReports: repDay20, projectStartDate: null, projectStatus: "active", today })
    const p3Eval21 = evaluateCompliancePeriod({ projectId: "p1", monthKey: "2026-09", template: m3Templates[2], projectReports: repDay21, projectStartDate: null, projectStatus: "active", today })

    console.assert(p2Eval20.actualVisits === 1 && p2Eval20.status === "done", "Day 20 satisfies P2")
    console.assert(p3Eval21.actualVisits === 1 && p3Eval21.status === "done", "Day 21 satisfies P3")

    console.log("✓ Monthly 3 periods, day 10/11/20/21 boundaries, and short final periods verified.")
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 4: Monthly 4 Periods: Day 7, 8, 14, 15, 21, 22, and variable final period
  // -----------------------------------------------------------------------------
  console.log("\n--- 4. Monthly 4 Requirement Periods & Boundaries ---")
  {
    const m4Templates = generateRequirementPeriodTemplates("2026-09", "monthly_4")
    console.assert(m4Templates.length === 4, "Monthly 4 has 4 periods")
    console.assert(m4Templates[0].startDate === "2026-09-01" && m4Templates[0].endDate === "2026-09-07", "P1: 1-7")
    console.assert(m4Templates[1].startDate === "2026-09-08" && m4Templates[1].endDate === "2026-09-14", "P2: 8-14")
    console.assert(m4Templates[2].startDate === "2026-09-15" && m4Templates[2].endDate === "2026-09-21", "P3: 15-21")
    console.assert(m4Templates[3].startDate === "2026-09-22" && m4Templates[3].endDate === "2026-09-30", "P4: 22-30")

    // August 31-day month: P4 is 22-31 (10 days)
    const augM4 = generateRequirementPeriodTemplates("2026-08", "monthly_4")
    console.assert(augM4[3].startDate === "2026-08-22" && augM4[3].endDate === "2026-08-31", "Aug P4: 22-31 (10 days)")

    // Boundary visits
    const repDay7: RawReportRecord[] = [{ id: "r7", status: "submitted", submitted_at: "2026-09-07T00:00:00Z", visit_date: "2026-09-07" }]
    const repDay8: RawReportRecord[] = [{ id: "r8", status: "submitted", submitted_at: "2026-09-08T00:00:00Z", visit_date: "2026-09-08" }]
    const repDay14: RawReportRecord[] = [{ id: "r14", status: "submitted", submitted_at: "2026-09-14T00:00:00Z", visit_date: "2026-09-14" }]
    const repDay15: RawReportRecord[] = [{ id: "r15", status: "submitted", submitted_at: "2026-09-15T00:00:00Z", visit_date: "2026-09-15" }]
    const repDay21: RawReportRecord[] = [{ id: "r21", status: "submitted", submitted_at: "2026-09-21T00:00:00Z", visit_date: "2026-09-21" }]
    const repDay22: RawReportRecord[] = [{ id: "r22", status: "submitted", submitted_at: "2026-09-22T00:00:00Z", visit_date: "2026-09-22" }]

    console.assert(evaluateCompliancePeriod({ projectId: "p1", monthKey: "2026-09", template: m4Templates[0], projectReports: repDay7, projectStartDate: null, projectStatus: "active", today }).status === "done", "Day 7 satisfies P1")
    console.assert(evaluateCompliancePeriod({ projectId: "p1", monthKey: "2026-09", template: m4Templates[1], projectReports: repDay8, projectStartDate: null, projectStatus: "active", today }).status === "done", "Day 8 satisfies P2")
    console.assert(evaluateCompliancePeriod({ projectId: "p1", monthKey: "2026-09", template: m4Templates[1], projectReports: repDay14, projectStartDate: null, projectStatus: "active", today }).status === "done", "Day 14 satisfies P2")
    console.assert(evaluateCompliancePeriod({ projectId: "p1", monthKey: "2026-09", template: m4Templates[2], projectReports: repDay15, projectStartDate: null, projectStatus: "active", today }).status === "done", "Day 15 satisfies P3")
    console.assert(evaluateCompliancePeriod({ projectId: "p1", monthKey: "2026-09", template: m4Templates[2], projectReports: repDay21, projectStartDate: null, projectStatus: "active", today }).status === "done", "Day 21 satisfies P3")
    console.assert(evaluateCompliancePeriod({ projectId: "p1", monthKey: "2026-09", template: m4Templates[3], projectReports: repDay22, projectStartDate: null, projectStatus: "active", today }).status === "done", "Day 22 satisfies P4")

    console.log("✓ Monthly 4 periods, day 7/8/14/15/21/22 boundaries, and variable final periods verified.")
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 5: Critical Project Start Rules (Cases A, B, C)
  // -----------------------------------------------------------------------------
  console.log("\n--- 5. Critical Project Start Date Rules ---")
  {
    const sepM2 = generateRequirementPeriodTemplates("2026-09", "monthly_2")
    const p1Template = sepM2[0] // Sep 1–15
    const p2Template = sepM2[1] // Sep 16–30

    // Starts BEFORE period start (2026-08-15) -> Normal requirement
    const startsBefore = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: p1Template,
      projectReports: [],
      projectStartDate: "2026-08-15",
      projectStatus: "active",
      today,
    })
    console.assert(startsBefore.status === "missing" && startsBefore.requiredVisits === 1, "Starts before period -> Normal required = 1, missing")

    // Starts EXACTLY ON period start (2026-09-01) -> Normal requirement
    const startsOnStart = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: p1Template,
      projectReports: [],
      projectStartDate: "2026-09-01",
      projectStatus: "active",
      today,
    })
    console.assert(startsOnStart.status === "missing" && startsOnStart.requiredVisits === 1, "Starts on period start -> Normal required = 1, missing")

    // Starts INSIDE period (2026-09-12):
    // MUST NOT create a Missing status for P1 (Sep 1-15)!
    const startsInsideNoVisits = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: p1Template,
      projectReports: [],
      projectStartDate: "2026-09-12",
      projectStatus: "active",
      today,
    })
    console.assert(startsInsideNoVisits.status === "not_applicable", `Starts inside period (Sep 12) -> P1 MUST be not_applicable, got ${startsInsideNoVisits.status}`)
    console.assert(startsInsideNoVisits.requiredVisits === 0, "Starts inside period -> P1 requiredVisits must be 0")

    // Starts INSIDE period (2026-09-12) with an actual visit on Sep 14:
    // Actual visit is recorded, status is not_applicable
    const startsInsideWithVisit = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: p1Template,
      projectReports: [{ id: "r14", status: "submitted", submitted_at: "2026-09-14T00:00:00Z", visit_date: "2026-09-14" }],
      projectStartDate: "2026-09-12",
      projectStatus: "active",
      today,
    })
    console.assert(startsInsideWithVisit.actualVisits === 1, "Actual visit during partial period is credited/displayed")

    // Next period P2 (Sep 16-30): Project started Sep 12, so P2 applies normally!
    const p2StartsInside = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: p2Template,
      projectReports: [],
      projectStartDate: "2026-09-12",
      projectStatus: "active",
      today,
    })
    console.assert(p2StartsInside.status === "upcoming" && p2StartsInside.requiredVisits === 1, "P2 applies normally after mid-period start")

    // Starts ON period end (2026-09-15) -> Inside period rule applies (not_applicable for P1)
    const startsOnEnd = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: p1Template,
      projectReports: [],
      projectStartDate: "2026-09-15",
      projectStatus: "active",
      today,
    })
    console.assert(startsOnEnd.status === "not_applicable" && startsOnEnd.requiredVisits === 0, "Starts on period end -> not_applicable for P1")

    // Starts AFTER period end (2026-09-20) -> not_applicable for P1
    const startsAfterEnd = evaluateCompliancePeriod({
      projectId: "p1",
      monthKey: "2026-09",
      template: p1Template,
      projectReports: [],
      projectStartDate: "2026-09-20",
      projectStatus: "active",
      today,
    })
    console.assert(startsAfterEnd.status === "not_applicable" && startsAfterEnd.requiredVisits === 0, "Starts after period end -> not_applicable for P1")

    console.log("✓ All Project Start rules (before, exact start, inside, exact end, after end) strictly verified.")
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 6: Project Completion / Ended Rules
  // -----------------------------------------------------------------------------
  console.log("\n--- 6. Project Completion & Inactive Rules ---")
  {
    const sepM2 = generateRequirementPeriodTemplates("2026-09", "monthly_2")
    const p1Template = sepM2[0] // Sep 1-15 (past period before today Sep 18)
    const p2Template = sepM2[1] // Sep 16-30 (active/future period on/after today Sep 18)

    // Completed project:
    // Historical period (P1: Sep 1-15) was before today -> Evaluated normally (e.g. Done if visited, Missing if not)
    const historicalCompleted = evaluateCompliancePeriod({
      projectId: "p_comp",
      monthKey: "2026-09",
      template: p1Template,
      projectReports: [{ id: "r5", status: "submitted", submitted_at: "2026-09-05T00:00:00Z", visit_date: "2026-09-05" }],
      projectStartDate: "2026-01-01",
      projectStatus: "completed",
      today,
    })
    console.assert(historicalCompleted.status === "done", "Completed project retains historical compliance status (Done)")

    // Future period (P2: Sep 16-30) for completed project -> MUST NOT become Missing!
    const futureCompleted = evaluateCompliancePeriod({
      projectId: "p_comp",
      monthKey: "2026-09",
      template: p2Template,
      projectReports: [],
      projectStartDate: "2026-01-01",
      projectStatus: "completed",
      today,
    })
    console.assert(futureCompleted.status === "not_applicable" && futureCompleted.requiredVisits === 0, `Future period for completed project MUST be not_applicable, got ${futureCompleted.status}`)

    console.log("✓ Project completion rules verified: historical periods preserved, future periods not marked Missing.")
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 7: Multiple Supervisors (Shared Workload Invariant)
  // -----------------------------------------------------------------------------
  console.log("\n--- 7. Multiple Supervisors Shared Responsibility ---")
  {
    const weeks = generateWeeklyWindow({ referenceDate: "2026-09-18", pastWeeks: 2, futureWeeks: 2 })

    const project: RawProjectRecord = {
      id: "p_shared",
      name: "Shared Project",
      code: "SHR-1",
      status: "active",
      supervision_type: "monthly_2",
      assigned_supervisor_id: "user_ahmed",
      start_date: "2026-01-01",
    }

    const participants: RawParticipantRecord[] = [
      { project_id: "p_shared", key_contact_user_id: "user_mohammed", status: "active", participant_type: "consultancy", participant_role_label: "Supervisor" },
    ]

    // Ahmed visited on Sep 5 (Period 1), Mohammed visited on Sep 20 (Period 2)
    const reports: RawReportRecord[] = [
      { id: "r_ahmed", project_id: "p_shared", status: "submitted", submitted_at: "2026-09-05T00:00:00Z", visit_date: "2026-09-05", created_by: "user_ahmed" },
      { id: "r_mohammed", project_id: "p_shared", status: "submitted", submitted_at: "2026-09-20T00:00:00Z", visit_date: "2026-09-20", created_by: "user_mohammed" },
    ]

    const timelineRow = buildProjectTimelineRow({
      project,
      participants,
      reports,
      weeks,
      today,
    })

    console.assert(timelineRow.supervisorIds.length === 2, "Project has 2 supervisors (Ahmed + Mohammed)")

    // Check Period 1 (Sep 1-15) and Period 2 (Sep 16-30)
    const p1 = timelineRow.periods.find((p) => p.monthKey === "2026-09" && p.periodIndex === 1)!
    const p2 = timelineRow.periods.find((p) => p.monthKey === "2026-09" && p.periodIndex === 2)!

    console.assert(p1.requiredVisits === 1 && p1.actualVisits === 1 && p1.status === "done", "P1 required=1, satisfied by Ahmed's visit")
    console.assert(p2.requiredVisits === 1 && p2.actualVisits === 1 && p2.status === "done", "P2 required=1, satisfied by Mohammed's visit")

    console.log("✓ Multiple supervisors do NOT double requirements; collective visits satisfy project compliance.")
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 8: Weekly Calendar Window & Mapping (Sunday -> Saturday)
  // -----------------------------------------------------------------------------
  console.log("\n--- 8. Weekly Calendar Window & Sunday-Saturday Mapping ---")
  {
    // Sep 18, 2026 is a Friday.
    // Sunday of that week is Sep 13, Saturday is Sep 19.
    const sunday = getSundayForDateKey("2026-09-18")
    const saturday = getSaturdayForDateKey("2026-09-18")
    console.assert(sunday === "2026-09-13", `Sunday of Sep 18, 2026 should be 2026-09-13, got ${sunday}`)
    console.assert(saturday === "2026-09-19", `Saturday of Sep 18, 2026 should be 2026-09-19, got ${saturday}`)

    // Label format
    const label = formatWeekLabel(sunday, saturday)
    console.assert(label === "Sep 13–19", `Week label should be Sep 13–19, got ${label}`)

    // Month boundary week label e.g. Aug 30 to Sep 5
    const monthBoundaryLabel = formatWeekLabel("2026-08-30", "2026-09-05")
    console.assert(monthBoundaryLabel === "Aug 30 – Sep 5", `Month boundary label should be Aug 30 – Sep 5, got ${monthBoundaryLabel}`)

    // Week Sep 13–19 crosses Monthly 2 period boundary (P1: Sep 1–15, P2: Sep 16–30)
    const weeks = generateCalendarWeeks({ rangeStart: "2026-09-13", rangeEnd: "2026-09-19", referenceDate: "2026-09-18" })
    console.assert(weeks.length === 1, "1 week generated")
    console.assert(weeks[0].isCurrentWeek === true, "Sep 13–19 is current week")

    const project: RawProjectRecord = {
      id: "p_cross",
      name: "Boundary Cross Project",
      code: "BCP",
      status: "active",
      supervision_type: "monthly_2",
      start_date: "2026-01-01",
    }

    const reports: RawReportRecord[] = [
      { id: "r_p1", project_id: "p_cross", status: "submitted", submitted_at: "2026-09-14T00:00:00Z", visit_date: "2026-09-14" },
      { id: "r_p2", project_id: "p_cross", status: "submitted", submitted_at: "2026-09-17T00:00:00Z", visit_date: "2026-09-17" },
    ]

    const timelineRow = buildProjectTimelineRow({
      project,
      participants: [],
      reports,
      weeks,
      today: "2026-09-18",
    })

    const cell = timelineRow.weeklyCells[weeks[0].weekKey]
    console.assert(cell !== undefined, "Cell exists for week")
    console.assert(cell.overlappingPeriods.length === 2, `Week Sep 13–19 MUST overlap 2 periods (P1 and P2), got ${cell.overlappingPeriods.length}`)
    console.assert(cell.actualReports.length === 2, `Week Sep 13–19 has 2 actual reports, got ${cell.actualReports.length}`)
    console.assert(cell.requiredVisits === 1, `Weekly cell requiredVisits should be 1, got ${cell.requiredVisits}`)
    console.assert(cell.completedVisits === 2, `Weekly cell completedVisits should be 2, got ${cell.completedVisits}`)
    console.assert(cell.status === "extra", `Weekly cell status should be extra, got ${cell.status}`)

    console.log("✓ Sunday -> Saturday week boundaries and weekly compliance properties verified.")
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 9: Top-Level calculateSupervisorVisitCompliance Aggregator
  // -----------------------------------------------------------------------------
  console.log("\n--- 9. Full Top-Level Compliance Engine Aggregation ---")
  {
    const weeks = generateWeeklyWindow({ referenceDate: "2026-09-18", pastWeeks: 2, futureWeeks: 2 })

    const projects: RawProjectRecord[] = [
      { id: "p1", name: "Project Alpha", code: "PA", status: "active", supervision_type: "monthly_2", assigned_supervisor_id: "sup_1", start_date: "2026-01-01" },
      { id: "p2", name: "Project Beta", code: "PB", status: "active", supervision_type: "monthly_4", assigned_supervisor_id: "sup_2", start_date: "2026-01-01" },
    ]

    const participants: RawParticipantRecord[] = [
      { project_id: "p1", key_contact_user_id: "sup_2", status: "active", participant_type: "consultancy", participant_role_label: "Supervisor" },
    ]

    const profiles = new Map([
      ["sup_1", { id: "sup_1", name: "Ahmed Al-Harthy", email: "ahmed@example.com", avatarUrl: null }],
      ["sup_2", { id: "sup_2", name: "Fatima Al-Said", email: "fatima@example.com", avatarUrl: null }],
    ])

    const reports: RawReportRecord[] = [
      { id: "rep1", project_id: "p1", status: "submitted", submitted_at: "2026-09-05T00:00:00Z", visit_date: "2026-09-05", created_by: "sup_1", report_number: "PA/001" },
    ]

    const dashboard = calculateSupervisorVisitCompliance({
      projects,
      participants,
      reports,
      supervisorProfiles: profiles,
      weeks,
      today: "2026-09-18",
    })

    console.assert(dashboard.projects.length === 2, "2 project rows returned")
    console.assert(dashboard.supervisors.length === 2, "2 supervisors returned")
    console.assert(dashboard.weeks.length === 5, "5 weeks generated (2 past + 1 current + 2 future)")

    const p1Row = dashboard.projects.find((p) => p.projectId === "p1")!
    console.assert(p1Row.supervisors.length === 2, "Project Alpha has 2 supervisors")
    console.assert(p1Row.supervisors.some((s) => s.id === "sup_1" && s.isPrimary), "sup_1 is primary")

    console.log("✓ Top-level calculateSupervisorVisitCompliance generated complete dashboard model.")
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 10: Weekly Compliance Cell Status Isolation (Regression Test)
  // -----------------------------------------------------------------------------
  console.log("\n--- 10. Weekly Compliance Cell Status Isolation (Regression Test) ---")
  {
    // Today is Sep 10, 2026
    const refDate = "2026-09-10"
    // Weeks:
    // Week 1: Aug 23 - Aug 29 (Past)
    // Week 2: Aug 30 - Sep 05 (Past)
    // Week 3: Sep 06 - Sep 12 (Current: ends Sep 12 >= Sep 10)
    // Week 4: Sep 13 - Sep 19 (Future: ends Sep 19 > Sep 10)
    const weeks = generateCalendarWeeks({ rangeStart: "2026-08-23", rangeEnd: "2026-09-19", referenceDate: refDate })

    const project: RawProjectRecord = {
      id: "p_regression",
      name: "Regression Test Project",
      code: "REG-1",
      status: "active",
      supervision_type: "monthly_4",
      start_date: "2026-01-01",
    }

    // Week 1 (Aug 23-29) has 2 visits -> Extra
    // Week 2 (Aug 30 - Sep 05) has 0 visits -> MUST be Missing (week ended), NOT Extra!
    // Week 3 (Sep 06 - Sep 12) has 0 visits -> MUST be Upcoming (week current/not ended), NOT Extra!
    const reports: RawReportRecord[] = [
      { id: "r1", project_id: "p_regression", status: "submitted", submitted_at: "2026-08-24T00:00:00Z", visit_date: "2026-08-24" },
      { id: "r2", project_id: "p_regression", status: "submitted", submitted_at: "2026-08-26T00:00:00Z", visit_date: "2026-08-26" },
    ]

    const timelineRow = buildProjectTimelineRow({
      project,
      participants: [],
      reports,
      weeks,
      today: refDate,
    })

    const week1Cell = timelineRow.weeklyCells[weeks[0].weekKey]
    const week2Cell = timelineRow.weeklyCells[weeks[1].weekKey]
    const week3Cell = timelineRow.weeklyCells[weeks[2].weekKey]
    const week4Cell = timelineRow.weeklyCells[weeks[3].weekKey]

    // Week 1: Required=1, Done=2 -> status: extra
    console.assert(week1Cell.requiredVisits === 1 && week1Cell.completedVisits === 2 && week1Cell.status === "extra",
      `Week 1 should be extra (Req 1, Done 2), got req=${week1Cell.requiredVisits}, done=${week1Cell.completedVisits}, status=${week1Cell.status}`)

    // Week 2: Required=1, Done=0, Week Ended (Aug 30 - Sep 05 < Sep 10) -> status: missing (MUST NOT BE extra!)
    console.assert(week2Cell.requiredVisits === 1 && week2Cell.completedVisits === 0 && week2Cell.status === "missing",
      `Week 2 MUST be missing (Req 1, Done 0, past), got req=${week2Cell.requiredVisits}, done=${week2Cell.completedVisits}, status=${week2Cell.status}`)

    // Week 3: Required=1, Done=0, Week Active (Sep 06 - Sep 12 >= Sep 10) -> status: upcoming (MUST NOT BE extra!)
    console.assert(week3Cell.requiredVisits === 1 && week3Cell.completedVisits === 0 && week3Cell.status === "upcoming",
      `Week 3 MUST be upcoming (Req 1, Done 0, current/future), got req=${week3Cell.requiredVisits}, done=${week3Cell.completedVisits}, status=${week3Cell.status}`)

    // Week 4: Required=1, Done=0, Future -> status: upcoming
    console.assert(week4Cell.requiredVisits === 1 && week4Cell.completedVisits === 0 && week4Cell.status === "upcoming",
      `Week 4 MUST be upcoming (Req 1, Done 0, future), got req=${week4Cell.requiredVisits}, done=${week4Cell.completedVisits}, status=${week4Cell.status}`)

    console.log("✓ Regression test passed: A period with extra visits does NOT mark following empty weeks as Extra.")
  }

  // -----------------------------------------------------------------------------
  // TEST GROUP 11: Timeline Start Week Navigation & 8-Week Window
  // -----------------------------------------------------------------------------
  console.log("\n--- 11. Timeline Start Week Navigation & 8-Week Window ---")
  {
    const today = "2026-09-06" // Sunday, Sep 6, 2026

    // 1. Normalization of selected date to Sunday-Saturday week
    // User selects Thursday, Sep 10, 2026 -> normalized start Sunday is Sep 6, 2026
    const selectedDate = "2026-09-10"
    const normalizedSunday = getSundayForDateKey(selectedDate)
    console.assert(normalizedSunday === "2026-09-06", `Selected date ${selectedDate} MUST normalize to Sunday 2026-09-06, got ${normalizedSunday}`)

    // 2. Fixed 8-week window generation starting from Sep 6, 2026
    const VISIBLE_WEEKS_COUNT = 8
    const endSaturday = addCalendarDays(normalizedSunday, VISIBLE_WEEKS_COUNT * 7 - 1)
    console.assert(endSaturday === "2026-10-31", `8-week end Saturday MUST be 2026-10-31, got ${endSaturday}`)

    const weeks = generateCalendarWeeks({
      rangeStart: normalizedSunday,
      rangeEnd: endSaturday,
      referenceDate: today,
    })

    console.assert(weeks.length === 8, `Visible window MUST contain exactly 8 weeks, got ${weeks.length}`)
    console.assert(weeks[0].startDate === "2026-09-06" && weeks[0].endDate === "2026-09-12", `Week 1 should be Sep 6-12, got ${weeks[0].label}`)
    console.assert(weeks[1].startDate === "2026-09-13" && weeks[1].endDate === "2026-09-19", `Week 2 should be Sep 13-19, got ${weeks[1].label}`)
    console.assert(weeks[2].startDate === "2026-09-20" && weeks[2].endDate === "2026-09-26", `Week 3 should be Sep 20-26, got ${weeks[2].label}`)
    console.assert(weeks[3].startDate === "2026-09-27" && weeks[3].endDate === "2026-10-03", `Week 4 should be Sep 27-Oct 3, got ${weeks[3].label}`)
    console.assert(weeks[4].startDate === "2026-10-04" && weeks[4].endDate === "2026-10-10", `Week 5 should be Oct 4-10, got ${weeks[4].label}`)
    console.assert(weeks[5].startDate === "2026-10-11" && weeks[5].endDate === "2026-10-17", `Week 6 should be Oct 11-17, got ${weeks[5].label}`)
    console.assert(weeks[6].startDate === "2026-10-18" && weeks[6].endDate === "2026-10-24", `Week 7 should be Oct 18-24, got ${weeks[6].label}`)
    console.assert(weeks[7].startDate === "2026-10-25" && weeks[7].endDate === "2026-10-31", `Week 8 should be Oct 25-31, got ${weeks[7].label}`)

    // 3. Backward Navigation (Previous: -7 days)
    const prevSunday = addCalendarDays(normalizedSunday, -7)
    console.assert(prevSunday === "2026-08-30", `Previous week from Sep 6 MUST be Aug 30, got ${prevSunday}`)

    // 4. Forward Navigation (Next: +7 days)
    const nextSunday = addCalendarDays(normalizedSunday, 7)
    console.assert(nextSunday === "2026-09-13", `Next week from Sep 6 MUST be Sep 13, got ${nextSunday}`)

    console.log("✓ Timeline 8-week window, date normalization, and backward/forward navigation verified.")
  }

  console.log("\n================================================================================")
  console.log("ALL SUPERVISOR VISIT COMPLIANCE DOMAIN ENGINE TESTS PASSED! 🎉")
  console.log("================================================================================\n")
}

runUnitTests()

