import { describe, expect, it } from "vitest"
import {
  buildProjectsWorkbook,
  formatActiveFiltersSummary,
  formatReportScheduleText,
  generateProjectsExportFilename,
  exportProjectsToExcel,
} from "./export-projects-excel"
import type { ProjectRow } from "@/components/projects/projects-list"

const sampleProjects: ProjectRow[] = [
  {
    id: "proj-1",
    code: "B-2026-001",
    name: "Al Mouj Villa Complex",
    ownerClient: "Al Mouj LLC",
    supervisorName: "Salim Al Harthy",
    assignedSupervisorId: "user-1",
    address: "Al Mouj Street, Seeb",
    areaDistrict: "Al Mouj",
    projectType: "Residents",
    projectTypeValue: "residential",
    plotNo: "PL-10492",
    supervisionType: "monthly_4",
    supervisionTypeOther: null,
    supervisionStartDate: "2026-01-15",
    description: "Luxury residential complex",
    status: "active",
    startDate: "Jan 15, 2026",
    progress: 75,
    imageUrl: "",
    reportSchedule: {
      latestReport: {
        id: "rep-101",
        stageId: "stage-1",
        title: "Foundation Inspection",
        submittedAt: "2026-02-01T10:00:00Z",
      },
      compliance: {
        state: "on_track",
        nextRequiredVisitDate: "2026-02-15",
        daysRemaining: 14,
        daysOverdue: null,
      },
    },
  },
  {
    id: "proj-2",
    code: "B-2025-089",
    name: "Barka Commercial Hub",
    ownerClient: "Barka Developments",
    supervisorName: null,
    assignedSupervisorId: null,
    address: "Main Coastal Highway",
    areaDistrict: "Barka",
    projectType: "Commercial",
    projectTypeValue: "commercial",
    plotNo: "00123",
    supervisionType: "lump_sum",
    supervisionTypeOther: null,
    supervisionStartDate: null,
    description: "Commercial plaza",
    status: "stopped",
    startDate: "—",
    progress: null,
    imageUrl: "",
    reportSchedule: null,
  },
]

describe("export-projects-excel", () => {
  it("generates correct export filename", () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(generateProjectsExportFilename()).toBe(`BuildSight_Projects_${today}.xlsx`)
    expect(generateProjectsExportFilename("active")).toBe(`BuildSight_Projects_active_${today}.xlsx`)
    expect(generateProjectsExportFilename("all")).toBe(`BuildSight_Projects_${today}.xlsx`)
  })

  it("formats active filter summaries correctly", () => {
    expect(formatActiveFiltersSummary()).toBe("None (All Projects)")
    expect(formatActiveFiltersSummary({})).toBe("None (All Projects)")
    expect(
      formatActiveFiltersSummary({
        searchQuery: "Villa",
        status: "active",
        projectType: "Residents",
        areaDistrict: "Al Mouj",
      }),
    ).toBe('Search: "Villa" | Status: active | Type: Residents | Area: Al Mouj')
  })

  it("formats report schedule status correctly", () => {
    expect(formatReportScheduleText(null)).toBe("No reports yet")
    expect(
      formatReportScheduleText({
        latestReport: {
          id: "r1",
          stageId: "s1",
          title: "Site Visit 1",
          submittedAt: "2026-03-01T08:00:00Z",
        },
        compliance: {
          state: "overdue",
          nextRequiredVisitDate: "2026-02-20",
          daysRemaining: null,
          daysOverdue: 5,
        },
      }),
    ).toBe("Overdue 5 days | Latest: Site Visit 1 (2026-03-01)")
  })

  it("builds a workbook with expected structure and formatting", () => {
    const workbook = buildProjectsWorkbook({
      projects: sampleProjects,
      activeFilters: { status: "active" },
    })

    const worksheet = workbook.getWorksheet("Projects")
    expect(worksheet).toBeDefined()
    if (!worksheet) return

    // Verify title and metadata
    expect(worksheet.getCell("A1").value).toBe("BuildSight Projects Export")
    expect(worksheet.getCell("B3").value).toBe(2) // Total projects
    expect(worksheet.getCell("B4").value).toBe("Status: active")

    // Verify headers on row 6
    const expectedHeaders = [
      "Project Name",
      "Project Code",
      "Owner / Client",
      "Supervisor",
      "Supervision Type",
      "Area / District",
      "Project Type",
      "Plot No.",
      "Status",
      "Start Date",
      "Report Schedule",
      "Progress (%)",
    ]

    expectedHeaders.forEach((header, index) => {
      const cell = worksheet.getRow(6).getCell(index + 1)
      expect(cell.value).toBe(header)
      expect(cell.font?.bold).toBe(true)
    })

    // Verify Row 7 (Project 1)
    const row1 = worksheet.getRow(7)
    expect(row1.getCell(1).value).toBe("Al Mouj Villa Complex")
    expect(row1.getCell(2).value).toBe("B-2026-001")
    expect(row1.getCell(3).value).toBe("Al Mouj LLC")
    expect(row1.getCell(4).value).toBe("Salim Al Harthy")
    expect(row1.getCell(5).value).toBe("Monthly 4")
    expect(row1.getCell(6).value).toBe("Al Mouj")
    expect(row1.getCell(7).value).toBe("Residents")
    expect(row1.getCell(8).value).toBe("PL-10492")
    expect(row1.getCell(9).value).toBe("Active")
    // Date
    expect(row1.getCell(10).value).toBeInstanceOf(Date)
    expect(row1.getCell(10).numFmt).toBe("yyyy-mm-dd")
    // Schedule
    expect(row1.getCell(11).value).toContain("Due 2026-02-15")
    expect(row1.getCell(11).value).toContain("Foundation Inspection")
    // Progress
    expect(row1.getCell(12).value).toBe(0.75)
    expect(row1.getCell(12).numFmt).toBe("0%")

    // Verify Row 8 (Project 2 - Unassigned & stopped)
    const row2 = worksheet.getRow(8)
    expect(row2.getCell(1).value).toBe("Barka Commercial Hub")
    expect(row2.getCell(4).value).toBe("Unassigned")
    expect(row2.getCell(8).value).toBe("00123")
    expect(row2.getCell(8).numFmt).toBe("@")
    expect(row2.getCell(9).value).toBe("Stopped")
    expect(row2.getCell(10).value).toBe("—")
    expect(row2.getCell(11).value).toBe("No reports yet")
    expect(row2.getCell(12).value).toBe("—")

    // Verify views and autofilter
    expect((worksheet.views[0] as any)?.state).toBe("frozen")
    expect((worksheet.views[0] as any)?.ySplit).toBe(6)
    expect(worksheet.autoFilter).toBeDefined()
  })

  it("handles empty project collections gracefully", async () => {
    const res = await exportProjectsToExcel({
      projects: [],
    })
    expect(res.success).toBe(false)
    expect(res.rowCount).toBe(0)
  })

  it("writes valid xlsx binary buffer", async () => {
    const res = await exportProjectsToExcel({
      projects: sampleProjects,
    })
    expect(res.success).toBe(true)
    expect(res.rowCount).toBe(2)
    expect(res.filename).toContain("BuildSight_Projects_")
    expect(res.filename.endsWith(".xlsx")).toBe(true)
  })
})
