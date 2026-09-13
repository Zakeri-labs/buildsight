import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { requireOnboarded } from "@/lib/auth/session"
import { resolveDashboardDateRange } from "@/lib/dashboard/date-range"
import { getAllReportsForExcelExport } from "@/lib/db/reports-list"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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

function formatStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireOnboarded()

    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get("range") || undefined
    const from = searchParams.get("from") || undefined
    const to = searchParams.get("to") || undefined
    const supervisorId = searchParams.get("supervisorId")?.trim() || null

    const primaryMembership = session.memberships[0]
    const organizationId = session.supervisingOrg?.id ?? primaryMembership?.organization?.id

    const dateRange = resolveDashboardDateRange({ range, from, to })

    // Resolve supervisor name for Information Section
    let supervisorFilterLabel = "All Supervisors"
    if (supervisorId) {
      const admin = createAdminClient()
      const { data: supProfile } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", supervisorId)
        .maybeSingle()
      if (supProfile) {
        supervisorFilterLabel = supProfile.full_name?.trim() || supProfile.email?.trim() || "Supervisor"
      }
    }

    // Resolve date range label for Information Section
    let dateRangeLabel = "All Time"
    if (dateRange?.preset === "today") {
      dateRangeLabel = `Today (${formatDisplayDate(dateRange.startDate)})`
    } else if (dateRange?.preset === "yesterday") {
      dateRangeLabel = `Yesterday (${formatDisplayDate(dateRange.startDate)})`
    } else if (dateRange?.preset === "thisMonth") {
      dateRangeLabel = `Current Month (${formatDisplayDate(dateRange.startDate)} - ${formatDisplayDate(dateRange.endDate)})`
    } else if (dateRange?.startDate && dateRange?.endDate) {
      dateRangeLabel = `${formatDisplayDate(dateRange.startDate)} - ${formatDisplayDate(dateRange.endDate)}`
    }

    const reports = await getAllReportsForExcelExport({
      userId: session.userId,
      organizationId,
      dateRange,
      supervisorId,
    })

    const appOrigin =
      request.headers.get("x-forwarded-host")
        ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("x-forwarded-host")}`
        : request.nextUrl.origin || "https://app.bonyanec.com"

    const todayStr = formatDisplayDate(new Date().toISOString())

    // ─── Build Excel Workbook ────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "BuildSight"
    workbook.lastModifiedBy = "BuildSight"
    workbook.created = new Date()
    workbook.modified = new Date()

    const worksheet = workbook.addWorksheet("Reports", {
      views: [{ state: "frozen", ySplit: 7 }],
      properties: { defaultRowHeight: 22 },
    })

    // ─── Export Information Section (Rows 1 to 5) ────────────────────────────
    worksheet.getCell("A1").value = "Export Information"
    worksheet.getCell("A1").font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } }

    const infoRows = [
      { label: "Export Date:", val: todayStr },
      { label: "Date Range:", val: dateRangeLabel },
      { label: "Supervisor Filter:", val: supervisorFilterLabel },
      { label: "Total Reports:", val: reports.length },
    ]

    infoRows.forEach((item, index) => {
      const rowIndex = index + 2
      const labelCell = worksheet.getCell(`A${rowIndex}`)
      const valCell = worksheet.getCell(`B${rowIndex}`)

      labelCell.value = item.label
      labelCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF475569" } }

      valCell.value = item.val
      valCell.font = { name: "Arial", size: 10, bold: index === 3, color: { argb: "FF0F172A" } }
    })

    // Row 6 is empty spacing

    // ─── Table Headers (Row 7) ───────────────────────────────────────────────
    const headers = [
      { header: "Report Title", key: "reportTitle", width: 34 },
      { header: "Report Number", key: "reportNumber", width: 16 },
      { header: "Project Name", key: "projectName", width: 28 },
      { header: "Project Code", key: "projectCode", width: 15 },
      { header: "Client / Owner", key: "clientName", width: 24 },
      { header: "Stage Name", key: "stageName", width: 24 },
      { header: "Visit Number", key: "visitNumber", width: 14 },
      { header: "Visit Date", key: "visitDate", width: 16 },
      { header: "Submission Date", key: "submissionDate", width: 18 },
      { header: "Submitted By", key: "submittedBy", width: 22 },
      { header: "Status", key: "status", width: 16 },
      { header: "Bilingual PDF", key: "bilingualPdf", width: 18 },
      { header: "Report Page Link", key: "reportPageLink", width: 18 },
    ]

    const headerRow = worksheet.getRow(7)
    headerRow.height = 26

    headers.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1)
      cell.value = col.header
      cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } }
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F172A" }, // Dark slate navy
      }
      cell.alignment = { vertical: "middle", horizontal: idx === 6 ? "center" : "left" }
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "medium", color: { argb: "FF0F172A" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      }
    })

    // ─── Data Rows (Starting at Row 8) ───────────────────────────────────────
    reports.forEach((report, index) => {
      const rowNumber = index + 8
      const row = worksheet.getRow(rowNumber)
      row.height = 22

      const visitDateFormatted = formatDisplayDate(report.visitDate || report.submittedAt || report.createdAt)
      const submissionDateFormatted = formatDisplayDate(report.submittedAt || report.createdAt)
      const microCode = report.id.split("-")[0]
      const pdfUrl = `https://app.bonyanec.com/r/${microCode}`
      const reportPageUrl = `${appOrigin}/projects/${report.projectId}/stages/${report.stageId}/reports/${report.id}`

      const values: (string | number | { text: string; hyperlink: string })[] = [
        report.reportTitle,
        report.reportNumber || "—",
        report.projectName,
        report.projectCode || "—",
        report.clientName || "—",
        report.stageName,
        report.visitNumber != null ? report.visitNumber : "—",
        visitDateFormatted,
        submissionDateFormatted,
        report.authorName,
        formatStatus(report.status),
        { text: "Download PDF", hyperlink: pdfUrl },
        { text: "Open Report", hyperlink: reportPageUrl },
      ]

      values.forEach((val, colIdx) => {
        const cell = row.getCell(colIdx + 1)
        const isEven = index % 2 === 1

        cell.value = val as any
        cell.alignment = {
          vertical: "middle",
          horizontal: colIdx === 6 ? "center" : "left",
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

        // Hyperlinks styling (Columns 12 and 13)
        if (colIdx === 11 || colIdx === 12) {
          cell.font = {
            name: "Arial",
            size: 10,
            color: { argb: "FF2563EB" }, // Tailwind blue-600
            underline: true,
          }
        } else {
          cell.font = { name: "Arial", size: 10, color: { argb: "FF1E293B" } }
        }
      })
    })

    // Set explicit column widths
    headers.forEach((col, idx) => {
      worksheet.getColumn(idx + 1).width = col.width
    })

    // Write workbook buffer
    const buffer = await workbook.xlsx.writeBuffer()

    const exportFileDate = new Date().toISOString().slice(0, 10)
    const filename = `BuildSight_Reports_${exportFileDate}.xlsx`

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    })
  } catch (error) {
    console.error("[export-excel route] Error generating Excel:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate Excel export." },
      { status: 500 },
    )
  }
}
