"use client"

import Link from "next/link"
import { useState } from "react"
import { ChevronDown, ClipboardList } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

export type ProjectSiteVisitReport = {
  id: string
  stageId: string
  reportTitle: string
  reportNumber: string
  stageName: string
  visitNumber: number | null
  createdAt: string
  supervisorName: string
}

function displayDate(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

function displayVisitNumber(value: number | null) {
  return Number.isInteger(value) && Number(value) > 0 ? String(value).padStart(3, "0") : "—"
}

export function ProjectSiteVisitReports({
  projectId,
  reports,
  memberMobile = false,
}: {
  projectId: string
  reports: ProjectSiteVisitReport[]
  memberMobile?: boolean
}) {
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const [mobileOpen, setMobileOpen] = useState(false)
  const labels = isArabic
    ? {
        title: "٤. تقارير زيارات الموقع",
        mobileTitle: "تقارير زيارات الموقع",
        report: "التقرير",
        stage: "المرحلة",
        visitNo: "رقم الزيارة",
        date: "التاريخ",
        supervisor: "المشرف",
        empty: "لم يتم تسجيل أي تقارير زيارات موقع لهذا المشروع حتى الآن.",
      }
    : {
        title: "4. Site Visit Reports",
        mobileTitle: "Site Visit Reports",
        report: "Report",
        stage: "Stage",
        visitNo: "Visit No.",
        date: "Date",
        supervisor: "Supervisor",
        empty: "No site visit reports have been recorded for this project yet.",
      }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className={cn("border-b px-5 py-4 sm:px-6", memberMobile && "max-md:px-3 max-md:py-2.5")}>
        {memberMobile ? (
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2 text-start md:hidden"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <ClipboardList className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 text-sm font-semibold">
              {labels.mobileTitle}
            </span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", mobileOpen && "rotate-180")} />
          </button>
        ) : null}
        <CardTitle className={cn("flex items-center gap-2 text-base font-semibold sm:text-lg", memberMobile && "max-md:hidden")}>
          <ClipboardList className="size-5 text-primary" />
          {labels.title}
        </CardTitle>
      </CardHeader>

      <CardContent className={cn("p-0", memberMobile && !mobileOpen && "max-md:hidden")}>
        {reports.length ? (
          <>
            <div className={cn("overflow-x-auto", memberMobile && "max-md:hidden")}>
              <table className="w-full min-w-[760px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "15%" }} />
                </colgroup>
                <thead className="border-b bg-muted/45 text-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="py-3 ps-5 pe-3 text-start sm:ps-6">{labels.report}</th>
                    <th className="px-3 py-3 text-start">{labels.stage}</th>
                    <th className="px-3 py-3 text-start">{labels.visitNo}</th>
                    <th className="px-3 py-3 text-start">{labels.date}</th>
                    <th className="py-3 ps-3 pe-5 text-start sm:pe-6">{labels.supervisor}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reports.map((report) => (
                    <tr key={report.id} className="transition-colors hover:bg-muted/30">
                      <td className="py-3.5 ps-5 pe-3 sm:ps-6">
                        <Link
                          href={`/projects/${projectId}/stages/${report.stageId}/reports/${report.id}`}
                          className="block truncate font-medium text-foreground hover:text-primary hover:underline"
                          title={report.reportTitle}
                        >
                          {report.reportTitle}
                        </Link>
                        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={report.reportNumber}>
                          {report.reportNumber}
                        </p>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="block truncate" title={report.stageName}>{report.stageName}</span>
                      </td>
                      <td className="px-3 py-3.5 font-mono text-xs">{displayVisitNumber(report.visitNumber)}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-muted-foreground">{displayDate(report.createdAt, locale)}</td>
                      <td className="py-3.5 ps-3 pe-5 sm:pe-6">
                        <span className="block truncate" title={report.supervisorName}>{report.supervisorName}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {memberMobile ? (
              <div className="divide-y md:hidden">
                {reports.map((report) => (
                  <div key={report.id} className="px-3 py-2.5">
                    <Link
                      href={`/projects/${projectId}/stages/${report.stageId}/reports/${report.id}`}
                      className="line-clamp-2 text-[13px] font-semibold leading-[1.1rem] text-foreground hover:text-primary hover:underline"
                    >
                      {report.reportTitle}
                    </Link>
                    <p className="mt-0.5 break-words font-mono text-[10px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                      {report.reportNumber}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      <span className="font-medium text-foreground/80">{report.stageName}</span>
                      <span className="px-1" aria-hidden="true">•</span>
                      {isArabic ? "زيارة" : "Visit"} {displayVisitNumber(report.visitNumber)}
                    </p>
                    <p className="text-[10px] leading-4 text-muted-foreground">
                      {displayDate(report.createdAt, locale)}
                      <span className="px-1" aria-hidden="true">•</span>
                      {report.supervisorName}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className={cn("px-5 py-5 text-sm text-muted-foreground sm:px-6", memberMobile && "max-md:px-3 max-md:py-4 max-md:text-xs")}>
            {labels.empty}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
