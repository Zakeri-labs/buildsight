import { describe, expect, it } from "vitest"
import {
  calculateTodayReportsProgress,
  isReportStatusCompleted,
  REPORT_COMPLETION_STATUSES,
  type TodayLinkedReportProgressRow,
  type TodayVisitProgressRow,
} from "./reports-progress"
import { currentCalendarDateKey } from "@/lib/calendar/date"

describe("calculateTodayReportsProgress", () => {
  const visit1: TodayVisitProgressRow = {
    id: "v-11111111-1111-1111-1111-111111111111",
    projectId: "p-11111111-1111-1111-1111-111111111111",
    status: "scheduled",
  }

  const visit2: TodayVisitProgressRow = {
    id: "v-22222222-2222-2222-2222-222222222222",
    projectId: "p-22222222-2222-2222-2222-222222222222",
    status: "scheduled",
  }

  const visit3: TodayVisitProgressRow = {
    id: "v-33333333-3333-3333-3333-333333333333",
    projectId: "p-33333333-3333-3333-3333-333333333333",
    status: "scheduled",
  }

  it("returns 0 / 0 when there are no scheduled visits for today", () => {
    const result = calculateTodayReportsProgress({
      visitRows: [],
      linkedReportRows: [],
    })

    expect(result).toEqual({
      requiredReportsToday: 0,
      completedReportsToday: 0,
    })
  })

  it("Scenario 1: returns 0 completed when all visits are scheduled and have no reports (0 / 2)", () => {
    const result = calculateTodayReportsProgress({
      visitRows: [visit1, visit2],
      linkedReportRows: [],
    })

    expect(result).toEqual({
      requiredReportsToday: 2,
      completedReportsToday: 0,
    })
  })

  it("Scenario 2: counts a visit completed via submitting a Stage Report (1 / 2)", () => {
    const report: TodayLinkedReportProgressRow = {
      id: "r-1",
      projectId: visit1.projectId,
      siteVisitRequestId: visit1.id,
      status: "submitted",
    }

    const result = calculateTodayReportsProgress({
      visitRows: [visit1, visit2],
      linkedReportRows: [report],
    })

    expect(result).toEqual({
      requiredReportsToday: 2,
      completedReportsToday: 1,
    })
  })

  it("Scenario 3: counts a visit marked completed manually without a report (1 / 2)", () => {
    const manuallyCompletedVisit1: TodayVisitProgressRow = {
      ...visit1,
      status: "completed",
    }

    const result = calculateTodayReportsProgress({
      visitRows: [manuallyCompletedVisit1, visit2],
      linkedReportRows: [], // No report in term_responses
    })

    expect(result).toEqual({
      requiredReportsToday: 2,
      completedReportsToday: 1,
    })
  })

  it("Scenario 4: handles mixed completion types correctly (2 / 3)", () => {
    const manuallyCompletedVisit1: TodayVisitProgressRow = {
      ...visit1,
      status: "completed",
    }
    // visit2 is completed via report
    const reportForVisit2: TodayLinkedReportProgressRow = {
      id: "r-2",
      projectId: visit2.projectId,
      siteVisitRequestId: visit2.id,
      status: "approved",
    }
    // visit3 remains scheduled without report

    const result = calculateTodayReportsProgress({
      visitRows: [manuallyCompletedVisit1, visit2, visit3],
      linkedReportRows: [reportForVisit2],
    })

    expect(result).toEqual({
      requiredReportsToday: 3,
      completedReportsToday: 2,
    })
  })

  it("Scenario 5 (Deduplication): counts a visit completed both manually and via report only once (1 / 1)", () => {
    const manuallyCompletedVisit1: TodayVisitProgressRow = {
      ...visit1,
      status: "completed",
    }
    const reportForVisit1: TodayLinkedReportProgressRow = {
      id: "r-1",
      projectId: visit1.projectId,
      siteVisitRequestId: visit1.id,
      status: "completed",
    }

    const result = calculateTodayReportsProgress({
      visitRows: [manuallyCompletedVisit1],
      linkedReportRows: [reportForVisit1],
    })

    expect(result).toEqual({
      requiredReportsToday: 1,
      completedReportsToday: 1,
    })
  })

  it("does not count a report if the report's project does not match the visit's project", () => {
    const reportWithWrongProject: TodayLinkedReportProgressRow = {
      id: "r-wrong",
      projectId: "p-other-project",
      siteVisitRequestId: visit1.id,
      status: "completed",
    }

    const result = calculateTodayReportsProgress({
      visitRows: [visit1],
      linkedReportRows: [reportWithWrongProject],
    })

    expect(result).toEqual({
      requiredReportsToday: 1,
      completedReportsToday: 0,
    })
  })

  it("does not count a report with draft or rejected status", () => {
    const draftReport: TodayLinkedReportProgressRow = {
      id: "r-draft",
      projectId: visit1.projectId,
      siteVisitRequestId: visit1.id,
      status: "draft",
    }

    const result = calculateTodayReportsProgress({
      visitRows: [visit1],
      linkedReportRows: [draftReport],
    })

    expect(result).toEqual({
      requiredReportsToday: 1,
      completedReportsToday: 0,
    })
  })

  it("recognizes all valid completion statuses", () => {
    for (const status of REPORT_COMPLETION_STATUSES) {
      expect(isReportStatusCompleted(status)).toBe(true)

      const report: TodayLinkedReportProgressRow = {
        id: `r-${status}`,
        projectId: visit1.projectId,
        siteVisitRequestId: visit1.id,
        status,
      }

      const result = calculateTodayReportsProgress({
        visitRows: [visit1],
        linkedReportRows: [report],
      })

      expect(result.completedReportsToday).toBe(1)
    }

    expect(isReportStatusCompleted("draft")).toBe(false)
    expect(isReportStatusCompleted("in_progress")).toBe(false)
    expect(isReportStatusCompleted(null)).toBe(false)
    expect(isReportStatusCompleted(undefined)).toBe(false)
  })

  it("handles null or undefined linkedReportRows gracefully", () => {
    const manuallyCompletedVisit1: TodayVisitProgressRow = {
      ...visit1,
      status: "completed",
    }

    const resultWithNull = calculateTodayReportsProgress({
      visitRows: [manuallyCompletedVisit1, visit2],
      linkedReportRows: null,
    })
    expect(resultWithNull).toEqual({
      requiredReportsToday: 2,
      completedReportsToday: 1,
    })

    const resultWithUndefined = calculateTodayReportsProgress({
      visitRows: [manuallyCompletedVisit1, visit2],
      linkedReportRows: undefined,
    })
    expect(resultWithUndefined).toEqual({
      requiredReportsToday: 2,
      completedReportsToday: 1,
    })
  })

  it("caps completedReportsToday at requiredReportsToday", () => {
    // If somehow extra completed reports are present
    const completedVisit1: TodayVisitProgressRow = {
      ...visit1,
      status: "completed",
    }

    const result = calculateTodayReportsProgress({
      visitRows: [completedVisit1],
      linkedReportRows: [
        {
          id: "r-1",
          projectId: visit1.projectId,
          siteVisitRequestId: visit1.id,
          status: "completed",
        },
      ],
    })

    expect(result.completedReportsToday).toBeLessThanOrEqual(result.requiredReportsToday)
  })

  it("preserves calendar date key format YYYY-MM-DD", () => {
    const today = currentCalendarDateKey()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
