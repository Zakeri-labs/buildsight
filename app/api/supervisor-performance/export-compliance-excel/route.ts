import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { requireOnboarded } from "@/lib/auth/session"
import { loadSupervisorVisitComplianceData } from "@/lib/supervisor-performance/server"
import {
  addCalendarDays,
  generateCalendarWeeks,
  getSaturdayForDateKey,
} from "@/lib/supervisor-performance/compliance-engine"
import { PROJECT_STATUS_OPTIONS } from "@/lib/projects/project-status"
import type {
  ComplianceCalendarWeek,
  ProjectComplianceTimelineRow,
} from "@/lib/supervisor-performance/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function formatShortDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr
  const [, monthStr, dayStr] = dateStr.slice(0, 10).split("-")
  const monthIndex = parseInt(monthStr, 10) - 1
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[monthIndex]} ${parseInt(dayStr, 10)}`
}

function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return "—"
  const clean = dateStr.split("T")[0].trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split("-").map(Number)
    const utcDate = new Date(Date.UTC(y, m - 1, d))
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(utcDate)
  }
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime())
    ? dateStr
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(d)
}

function formatFrequencyLabel(type: string | null): string {
  if (!type) return "Not Set"
  const clean = type.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
  if (clean === "monthly2") return "Monthly 2 (2/mo)"
  if (clean === "monthly3") return "Monthly 3 (3/mo)"
  if (clean === "monthly4") return "Monthly 4 (4/mo)"
  return type
}

function formatVisibleTimelineRange(startDateKey: string, endDateKey: string): string {
  const [sYear, sMonth, sDay] = startDateKey.split("-").map(Number)
  const [eYear, eMonth, eDay] = endDateKey.split("-").map(Number)
  const sDate = new Date(Date.UTC(sYear, sMonth - 1, sDay))
  const eDate = new Date(Date.UTC(eYear, eMonth - 1, eDay))

  const sMonthName = sDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
  const eMonthName = eDate.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })

  return `${sMonthName} ${sDay}, ${sYear} – ${eMonthName} ${eDay}, ${eYear}`
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireOnboarded()
    const supervisingOrg = session.supervisingOrg

    const isManagerOrAdmin =
      supervisingOrg != null &&
      session.memberships.some(
        (m) =>
          m.organization?.id === supervisingOrg.id &&
          (m.role === "org_admin" || m.role === "org_manager"),
      )

    if (!supervisingOrg || !isManagerOrAdmin) {
      return NextResponse.json({ error: "Unauthorized access to compliance export." }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const searchQuery = (searchParams.get("searchQuery") || "").trim()
    const selectedSupervisor = (searchParams.get("selectedSupervisor") || "all").trim()
    const selectedFrequency = (searchParams.get("selectedFrequency") || "all").trim()
    const selectedStatus = (searchParams.get("selectedStatus") || "active").trim()
    const showIssuesOnly = searchParams.get("showIssuesOnly") === "true"
    const rawAnchorSaturday = searchParams.get("anchorSaturday")?.trim() || ""

    // 1. Load normalized compliance data from server engine
    const data = await loadSupervisorVisitComplianceData({
      organizationId: supervisingOrg.id,
      pastWeeks: 12,
      futureWeeks: 16,
    })

    const { projects, supervisors, referenceDate } = data

    // 2. Resolve anchor week and 8 visible weeks (exact same logic as Grid)
    let anchorSaturday: string
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawAnchorSaturday)) {
        anchorSaturday = getSaturdayForDateKey(rawAnchorSaturday)
      } else {
        anchorSaturday = getSaturdayForDateKey(referenceDate)
      }
    } catch {
      anchorSaturday = referenceDate.slice(0, 10)
    }

    const startSaturday = addCalendarDays(anchorSaturday, -42)
    const endFriday = addCalendarDays(startSaturday, 8 * 7 - 1)
    const visibleWeeks = generateCalendarWeeks({
      rangeStart: startSaturday,
      rangeEnd: endFriday,
      referenceDate,
    })

    const visibleTimelineLabel =
      visibleWeeks.length > 0
        ? formatVisibleTimelineRange(visibleWeeks[0].startDate, visibleWeeks[visibleWeeks.length - 1].endDate)
        : "Timeline"

    // 3. Filter projects matching the exact UI criteria (without pagination limit)
    const filtered = projects.filter((project) => {
      // 1. Search Query (Project Name, Code, or Supervisor Name)
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchName = project.projectName.toLowerCase().includes(q)
        const matchCode = project.projectCode.toLowerCase().includes(q)
        const matchSup = project.supervisors.some((s) => s.name.toLowerCase().includes(q))
        if (!matchName && !matchCode && !matchSup) {
          return false
        }
      }

      // 2. Supervisor Filter
      if (selectedSupervisor !== "all") {
        const isAssigned =
          project.assignedSupervisorId === selectedSupervisor ||
          project.supervisorIds.includes(selectedSupervisor)
        if (!isAssigned) return false
      }

      // 3. Visit Frequency Filter
      if (selectedFrequency !== "all") {
        if (selectedFrequency === "monthly") {
          const isMonthly =
            project.normalizedSupervisionType === "monthly_2" ||
            project.normalizedSupervisionType === "monthly_3" ||
            project.normalizedSupervisionType === "monthly_4"
          if (!isMonthly) return false
        } else if (selectedFrequency === "lump_sum") {
          if (project.normalizedSupervisionType !== null) return false
        } else if (
          selectedFrequency === "monthly_2" ||
          selectedFrequency === "monthly_3" ||
          selectedFrequency === "monthly_4"
        ) {
          if (project.normalizedSupervisionType !== selectedFrequency) return false
        }
      }

      // 4. Project Status Filter
      if (selectedStatus !== "all") {
        if (project.normalizedStatus !== selectedStatus && project.status !== selectedStatus) {
          return false
        }
      }

      // 5. Quick Action: Show Issues Only
      if (showIssuesOnly) {
        const hasIssues = Object.values(project.weeklyCells).some(
          (cell) => cell.status === "missing" || cell.status === "extra",
        )
        if (!hasIssues) return false
      }

      return true
    })

    // Deduplicate by projectId
    const seenIds = new Set<string>()
    const filteredProjects: ProjectComplianceTimelineRow[] = []
    for (const p of filtered) {
      if (!seenIds.has(p.projectId)) {
        seenIds.add(p.projectId)
        filteredProjects.push(p)
      }
    }

    // 4. Resolve labels for the Information Section
    let supervisorFilterLabel = "All Supervisors"
    if (selectedSupervisor !== "all") {
      const sup = supervisors.find((s) => s.id === selectedSupervisor)
      supervisorFilterLabel = sup?.name || "Selected Supervisor"
    }

    let frequencyLabel = "All Frequencies"
    if (selectedFrequency === "monthly") frequencyLabel = "Monthly"
    else if (selectedFrequency === "lump_sum") frequencyLabel = "Lump Sum"
    else if (selectedFrequency === "monthly_2") frequencyLabel = "Monthly 2 (2/mo)"
    else if (selectedFrequency === "monthly_3") frequencyLabel = "Monthly 3 (3/mo)"
    else if (selectedFrequency === "monthly_4") frequencyLabel = "Monthly 4 (4/mo)"

    let statusLabel = "All Statuses"
    if (selectedStatus !== "all") {
      const st = PROJECT_STATUS_OPTIONS.find((s) => s.value === selectedStatus)
      statusLabel = st?.label || selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1)
    }

    const todayDisplay = formatDisplayDate(new Date().toISOString())

    // ─── 5. Build Excel Workbook ─────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "BuildSight"
    workbook.lastModifiedBy = "BuildSight"
    workbook.created = new Date()
    workbook.modified = new Date()

    const worksheet = workbook.addWorksheet("Compliance Matrix", {
      views: [{ state: "frozen", ySplit: 11, xSplit: 4 }],
      properties: { defaultRowHeight: 22 },
    })

    // ─── Export Information Section (Rows 1 to 8) ────────────────────────────
    worksheet.getCell("A1").value = "Export Information"
    worksheet.getCell("A1").font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } }

    const infoRows = [
      { label: "Export Date:", val: todayDisplay },
      { label: "Timeline:", val: visibleTimelineLabel },
      { label: "Supervisor Filter:", val: supervisorFilterLabel },
      { label: "Frequency:", val: frequencyLabel },
      { label: "Status:", val: statusLabel },
      { label: "Issues Only:", val: showIssuesOnly ? "Yes" : "No" },
      { label: "Projects Exported:", val: filteredProjects.length },
    ]

    infoRows.forEach((item, index) => {
      const rowIndex = index + 2
      const labelCell = worksheet.getCell(`A${rowIndex}`)
      const valCell = worksheet.getCell(`B${rowIndex}`)

      labelCell.value = item.label
      labelCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF475569" } }

      valCell.value = item.val
      valCell.font = { name: "Arial", size: 10, bold: index === 6, color: { argb: "FF0F172A" } }
    })

    // Row 9 is empty spacing

    // ─── Table Headers (Row 10) ──────────────────────────────────────────────
    const fixedColumns = [
      { header: "Project", key: "project", width: 32 },
      { header: "Project Code", key: "projectCode", width: 16 },
      { header: "Supervisor", key: "supervisor", width: 28 },
      { header: "Frequency", key: "frequency", width: 20 },
    ]

    const headerRow = worksheet.getRow(10)
    headerRow.height = 28

    fixedColumns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1)
      cell.value = col.header
      cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } }
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F172A" },
      }
      cell.alignment = { vertical: "middle", horizontal: "left" }
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "medium", color: { argb: "FF0F172A" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      }
      worksheet.getColumn(idx + 1).width = col.width
    })

    visibleWeeks.forEach((week, wIdx) => {
      const colIdx = fixedColumns.length + wIdx + 1
      const cell = headerRow.getCell(colIdx)
      cell.value = week.isCurrentWeek ? `${week.label}\n(Current Week)` : week.label
      cell.font = { name: "Arial", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } }
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: week.isCurrentWeek ? "FF1E3A8A" : "FF0F172A" }, // Darker blue accent for current week
      }
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "medium", color: { argb: "FF0F172A" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      }
      worksheet.getColumn(colIdx).width = 24
    })

    // ─── Row 11: Week Summary Row ────────────────────────────────────────────
    const summaryRow = worksheet.getRow(11)
    summaryRow.height = 68

    const summaryLabelCell = summaryRow.getCell(1)
    summaryLabelCell.value = "Week Summary"
    summaryLabelCell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF0F172A" } }
    summaryLabelCell.alignment = { vertical: "middle", horizontal: "left" }

    const summarySubCell = summaryRow.getCell(2)
    summarySubCell.value = `Aggregated for ${filteredProjects.length} projects`
    summarySubCell.font = { name: "Arial", size: 9.5, italic: true, color: { argb: "FF64748B" } }
    summarySubCell.alignment = { vertical: "middle", horizontal: "left" }

    const emptyCell3 = summaryRow.getCell(3)
    emptyCell3.value = ""
    const emptyCell4 = summaryRow.getCell(4)
    emptyCell4.value = ""

    for (let c = 1; c <= 4; c++) {
      const cell = summaryRow.getCell(c)
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      }
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "medium", color: { argb: "FF94A3B8" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      }
    }

    visibleWeeks.forEach((week, wIdx) => {
      const colIdx = fixedColumns.length + wIdx + 1
      const cell = summaryRow.getCell(colIdx)

      let totalRequired = 0
      let totalCompleted = 0
      let totalMissing = 0
      let totalExtra = 0

      for (const project of filteredProjects) {
        const c = project.weeklyCells[week.weekKey]
        if (c) {
          totalRequired += c.requiredVisits || 0
          totalCompleted += c.completedVisits || 0
          if (c.status === "missing") {
            totalMissing += Math.max(1, (c.requiredVisits || 1) - (c.completedVisits || 0))
          } else if (c.status === "extra") {
            totalExtra += Math.max(1, (c.completedVisits || 0) - (c.requiredVisits || 0))
          }
        }
      }

      cell.value = `Required: ${totalRequired}\nDone: ${totalCompleted}\nMissing: ${totalMissing}\nExtra: ${totalExtra}`
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF0F172A" } }
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: week.isCurrentWeek ? "FFE0E7FF" : "FFF1F5F9" },
      }
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "medium", color: { argb: "FF94A3B8" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      }
    })

    // ─── Rows 12+: Project Rows ──────────────────────────────────────────────
    filteredProjects.forEach((project, pIdx) => {
      const rowIdx = 12 + pIdx
      const row = worksheet.getRow(rowIdx)
      const isEven = pIdx % 2 === 1

      // Determine appropriate height depending on visits in cells
      let maxVisitsInRow = 0
      for (const week of visibleWeeks) {
        const c = project.weeklyCells[week.weekKey]
        if (c && c.actualReports.length > maxVisitsInRow) {
          maxVisitsInRow = c.actualReports.length
        }
      }
      row.height = maxVisitsInRow > 2 ? 80 : maxVisitsInRow > 0 ? 64 : 48

      // Column 1: Project Name
      const nameCell = row.getCell(1)
      nameCell.value = project.projectName
      nameCell.font = { name: "Arial", size: 10.5, bold: true, color: { argb: "FF0F172A" } }
      nameCell.alignment = { vertical: "middle", horizontal: "left" }

      // Column 2: Project Code
      const codeCell = row.getCell(2)
      codeCell.value = project.projectCode && project.projectCode !== "N/A" ? project.projectCode : "—"
      codeCell.font = { name: "Arial", size: 10, color: { argb: "FF475569" } }
      codeCell.alignment = { vertical: "middle", horizontal: "left" }

      // Column 3: Supervisor
      const supCell = row.getCell(3)
      const supNames = project.supervisors.length > 0
        ? project.supervisors.map((s) => (s.isPrimary ? `${s.name} (Primary)` : s.name)).join(", ")
        : "Not Assigned"
      supCell.value = supNames
      supCell.font = { name: "Arial", size: 10, color: { argb: "FF1E293B" } }
      supCell.alignment = { vertical: "middle", horizontal: "left" }

      // Column 4: Frequency
      const freqCell = row.getCell(4)
      freqCell.value = formatFrequencyLabel(project.normalizedSupervisionType || project.supervisionType)
      freqCell.font = { name: "Arial", size: 10, color: { argb: "FF475569" } }
      freqCell.alignment = { vertical: "middle", horizontal: "left" }

      for (let c = 1; c <= 4; c++) {
        const cell = row.getCell(c)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isEven ? "FFF8FAFC" : "FFFFFFFF" },
        }
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        }
      }

      // Weekly Cells (Columns 5+)
      visibleWeeks.forEach((week, wIdx) => {
        const colIdx = fixedColumns.length + wIdx + 1
        const cell = row.getCell(colIdx)
        const weeklyCell = project.weeklyCells[week.weekKey]

        if (!weeklyCell) {
          cell.value = "—"
          cell.alignment = { vertical: "middle", horizontal: "center" }
          cell.font = { name: "Arial", size: 10, color: { argb: "FF94A3B8" } }
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: isEven ? "FFF8FAFC" : "FFFFFFFF" },
          }
        } else {
          const { status, requiredVisits, completedVisits, actualReports } = weeklyCell
          const isCompleted =
            status === "done" ||
            (status === "extra" && requiredVisits > 0 && completedVisits >= requiredVisits) ||
            (status === "extra" && requiredVisits === 0)

          const missingCount = status === "missing" ? Math.max(1, requiredVisits - completedVisits) : 0
          const extraVisitsCount =
            requiredVisits > 0 ? Math.max(0, completedVisits - requiredVisits) : completedVisits

          let statusTitle = "N/A"
          let fgColorHex = isEven ? "FFF8FAFC" : "FFFFFFFF"
          let textColorHex = "FF1E293B"

          if (isCompleted) {
            statusTitle = extraVisitsCount > 0 ? "Completed (+Extra)" : "Completed"
            fgColorHex = "FFECFDF5" // Emerald-50
            textColorHex = "FF065F46" // Emerald-800
          } else if (status === "missing") {
            statusTitle = "Missing"
            fgColorHex = "FFFFF1F2" // Rose-50
            textColorHex = "FF9F1239" // Rose-800
          } else if (status === "upcoming") {
            statusTitle = "Upcoming"
            fgColorHex = "FFF0F9FF" // Sky-50
            textColorHex = "FF075985" // Sky-800
          } else if (status === "extra") {
            statusTitle = "Extra Visit"
            fgColorHex = "FFFEF3C7" // Amber-50
            textColorHex = "FF92400E" // Amber-800
          }

          const lines: string[] = []
          lines.push(statusTitle)
          lines.push(`Required: ${requiredVisits} | Done: ${completedVisits}`)
          if (missingCount > 0) lines.push(`Missing: ${missingCount}`)
          if (extraVisitsCount > 0) lines.push(`Extra: ${extraVisitsCount}`)

          if (actualReports.length > 0) {
            const visitStrings = actualReports.map(
              (r) => `${formatShortDate(r.visitDate)} (#${r.visitNumber || r.reportNumber || "Report"})`,
            )
            lines.push(`Visits: ${visitStrings.join(", ")}`)
          }

          cell.value = lines.join("\n")
          cell.font = {
            name: "Arial",
            size: 9.5,
            bold: status === "missing" || isCompleted,
            color: { argb: textColorHex },
          }
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: fgColorHex },
          }
        }

        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        }
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const exportFileDate = new Date().toISOString().slice(0, 10)
    const filename = `BuildSight_Compliance_Matrix_${exportFileDate}.xlsx`

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    })
  } catch (error) {
    console.error("[export-compliance-excel route] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export Compliance Matrix." },
      { status: 500 },
    )
  }
}
