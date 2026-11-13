import ExcelJS from "exceljs"
import { supervisionTypeLabel } from "@/lib/projects/project-options"
import { projectStatusLabel } from "@/lib/projects/project-status"
import type { ProjectRow, ProjectReportSchedule } from "@/components/projects/projects-list"

export interface ActiveFiltersInfo {
  searchQuery?: string
  status?: string
  projectType?: string
  supervisionType?: string
  supervisor?: string
  areaDistrict?: string
  projectYear?: string
  zone?: string
}

export interface BuildProjectsWorkbookOptions {
  projects: ProjectRow[]
  activeFilters?: ActiveFiltersInfo
  locale?: string
}

export interface ExportProjectsExcelOptions extends BuildProjectsWorkbookOptions {
  customFilename?: string
}

function parseProjectStartDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr === "—" || dateStr === "Not set") return null
  const clean = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split("-").map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }
  const parsed = Date.parse(clean)
  if (Number.isNaN(parsed)) return null
  const d = new Date(parsed)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export function formatReportScheduleText(schedule: ProjectReportSchedule | null | undefined): string {
  if (!schedule) return "No reports yet"

  const parts: string[] = []

  if (schedule.compliance) {
    const comp = schedule.compliance
    if (comp.state === "overdue") {
      const days = comp.daysOverdue ?? 0
      parts.push(`Overdue ${days} ${days === 1 ? "day" : "days"}`)
    } else if (comp.state === "due_today") {
      parts.push("Due today")
    } else if (comp.state === "due_soon") {
      const days = comp.daysRemaining ?? 0
      parts.push(`Due in ${days} ${days === 1 ? "day" : "days"}`)
    } else if (comp.nextRequiredVisitDate) {
      parts.push(`Due ${comp.nextRequiredVisitDate}`)
    }
  }

  if (schedule.latestReport) {
    const rep = schedule.latestReport
    const dateFormatted = rep.submittedAt ? rep.submittedAt.slice(0, 10) : ""
    const dateSuffix = dateFormatted ? ` (${dateFormatted})` : ""
    parts.push(`Latest: ${rep.title}${dateSuffix}`)
  }

  return parts.length > 0 ? parts.join(" | ") : "No reports yet"
}

export function formatActiveFiltersSummary(filters?: ActiveFiltersInfo): string {
  if (!filters) return "None (All Projects)"

  const activeParts: string[] = []
  if (filters.searchQuery?.trim()) activeParts.push(`Search: "${filters.searchQuery.trim()}"`)
  if (filters.status && filters.status !== "all") activeParts.push(`Status: ${filters.status}`)
  if (filters.projectType && filters.projectType !== "all") activeParts.push(`Type: ${filters.projectType}`)
  if (filters.supervisionType && filters.supervisionType !== "all") activeParts.push(`Supervision: ${filters.supervisionType}`)
  if (filters.supervisor && filters.supervisor !== "all") activeParts.push(`Supervisor: ${filters.supervisor}`)
  if (filters.areaDistrict && filters.areaDistrict !== "all") activeParts.push(`Area: ${filters.areaDistrict}`)
  if (filters.projectYear && filters.projectYear !== "all") activeParts.push(`Year: ${filters.projectYear}`)
  if (filters.zone && filters.zone !== "all") activeParts.push(`Zone: ${filters.zone}`)

  return activeParts.length > 0 ? activeParts.join(" | ") : "None (All Projects)"
}

export function generateProjectsExportFilename(statusFilter?: string): string {
  const dateStr = new Date().toISOString().slice(0, 10)
  if (statusFilter && statusFilter !== "all") {
    const sanitizedStatus = statusFilter.toLowerCase().replace(/[^a-z0-9_-]+/g, "_")
    return `BuildSight_Projects_${sanitizedStatus}_${dateStr}.xlsx`
  }
  return `BuildSight_Projects_${dateStr}.xlsx`
}

export function buildProjectsWorkbook({
  projects,
  activeFilters,
}: BuildProjectsWorkbookOptions): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "BuildSight"
  workbook.lastModifiedBy = "BuildSight"
  workbook.created = new Date()
  workbook.modified = new Date()

  const worksheet = workbook.addWorksheet("Projects", {
    views: [{ state: "frozen", ySplit: 6 }],
    properties: { defaultRowHeight: 22 },
  })

  // ─── Header Summary Section (Rows 1 to 4) ──────────────────────────────
  worksheet.getCell("A1").value = "BuildSight Projects Export"
  worksheet.getCell("A1").font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } }

  const todayStr = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date())

  const filterSummary = formatActiveFiltersSummary(activeFilters)

  const summaryItems = [
    { label: "Export Date & Time:", value: todayStr },
    { label: "Total Projects:", value: projects.length },
    { label: "Active Filters:", value: filterSummary },
  ]

  summaryItems.forEach((item, idx) => {
    const rowIndex = idx + 2
    const labelCell = worksheet.getCell(`A${rowIndex}`)
    const valueCell = worksheet.getCell(`B${rowIndex}`)

    labelCell.value = item.label
    labelCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF475569" } }

    valueCell.value = item.value
    valueCell.font = { name: "Arial", size: 10, bold: idx === 1, color: { argb: "FF0F172A" } }
  })

  // Row 5 is empty spacing

  // ─── Table Headers (Row 6) ──────────────────────────────────────────────
  const columns = [
    { header: "Project Name", key: "name", width: 34, align: "left" as const },
    { header: "Project Code", key: "code", width: 16, align: "left" as const },
    { header: "Owner / Client", key: "ownerClient", width: 26, align: "left" as const },
    { header: "Supervisor", key: "supervisor", width: 22, align: "left" as const },
    { header: "Supervision Type", key: "supervisionType", width: 22, align: "left" as const },
    { header: "Area / District", key: "areaDistrict", width: 20, align: "left" as const },
    { header: "Project Type", key: "projectType", width: 18, align: "left" as const },
    { header: "Plot No.", key: "plotNo", width: 16, align: "left" as const },
    { header: "Status", key: "status", width: 16, align: "center" as const },
    { header: "Start Date", key: "startDate", width: 16, align: "center" as const },
    { header: "Report Schedule", key: "reportSchedule", width: 32, align: "left" as const },
    { header: "Progress (%)", key: "progress", width: 16, align: "center" as const },
  ]

  const headerRow = worksheet.getRow(6)
  headerRow.height = 26

  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = col.header
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" }, // Dark slate navy (BuildSight identity)
    }
    cell.alignment = { vertical: "middle", horizontal: col.align }
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    }
  })

  // ─── Data Rows (Row 7+) ─────────────────────────────────────────────────
  projects.forEach((project, index) => {
    const rowNumber = index + 7
    const row = worksheet.getRow(rowNumber)
    row.height = 22

    const supervisorText = project.assignedSupervisorId
      ? project.supervisorName?.trim() || "Assigned Supervisor"
      : "Unassigned"

    const supervisionTypeText = project.supervisionType?.trim()
      ? supervisionTypeLabel(project.supervisionType, project.supervisionTypeOther)
      : "Not set"

    const statusText = projectStatusLabel(project.status)
    const startDateObj = parseProjectStartDate(project.startDate)
    const scheduleText = formatReportScheduleText(project.reportSchedule)
    const progressVal = project.progress != null ? project.progress / 100 : null

    // Set cells
    const cellValues: Array<{
      value: string | number | Date | null
      numFmt?: string
      align: "left" | "center" | "right"
    }> = [
      { value: project.name || "—", align: "left" },
      { value: project.code || "—", numFmt: "@", align: "left" },
      { value: project.ownerClient || "—", align: "left" },
      { value: supervisorText, align: "left" },
      { value: supervisionTypeText, align: "left" },
      { value: project.areaDistrict?.trim() || "—", align: "left" },
      { value: project.projectType || "—", align: "left" },
      { value: project.plotNo?.trim() || "—", numFmt: "@", align: "left" },
      { value: statusText, align: "center" },
      {
        value: startDateObj ?? "—",
        numFmt: startDateObj ? "yyyy-mm-dd" : undefined,
        align: "center",
      },
      { value: scheduleText, align: "left" },
      {
        value: progressVal != null ? progressVal : "—",
        numFmt: progressVal != null ? "0%" : undefined,
        align: progressVal != null ? "right" : "center",
      },
    ]

    const isEven = index % 2 === 1

    cellValues.forEach((cellData, colIdx) => {
      const cell = row.getCell(colIdx + 1)
      cell.value = cellData.value as any

      if (cellData.numFmt) {
        cell.numFmt = cellData.numFmt
      }

      cell.font = { name: "Arial", size: 10, color: { argb: "FF1E293B" } }
      cell.alignment = {
        vertical: "middle",
        horizontal: cellData.align,
      }
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
    })
  })

  // Set column widths
  columns.forEach((col, idx) => {
    worksheet.getColumn(idx + 1).width = col.width
  })

  // AutoFilter on the table header row
  worksheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: Math.max(6, 6 + projects.length), column: columns.length },
  }

  return workbook
}

export async function exportProjectsToExcel(
  options: ExportProjectsExcelOptions,
): Promise<{ success: boolean; filename: string; rowCount: number }> {
  const { projects, activeFilters, customFilename } = options

  if (projects.length === 0) {
    return { success: false, filename: "", rowCount: 0 }
  }

  const workbook = buildProjectsWorkbook({ projects, activeFilters })
  const filename = customFilename || generateProjectsExportFilename(activeFilters?.status)

  const buffer = await workbook.xlsx.writeBuffer()

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return { success: true, filename, rowCount: projects.length }
}
