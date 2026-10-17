"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ClipboardList, Download, Eye, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"
import { softDeleteSiteVisitReportAction } from "@/lib/actions/site-visit-reports"

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

const HOLD_DURATION_MS = 400

function HoldToDeleteSiteVisitReportButton({
  reportTitle,
  onHoldComplete,
  compact = false,
}: {
  reportTitle: string
  onHoldComplete: () => void
  compact?: boolean
}) {
  const [progress, setProgress] = useState(0)
  const [isHolding, setIsHolding] = useState(false)
  const animFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const completedRef = useRef(false)
  const pointerIdRef = useRef<number | null>(null)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)

  const cancelHold = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    startTimeRef.current = null
    setIsHolding(false)
    setProgress(0)
  }, [])

  const startHold = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
    }
    completedRef.current = false
    setIsHolding(true)
    setProgress(0)
    const startTime = performance.now()
    startTimeRef.current = startTime

    const step = (now: number) => {
      const elapsed = now - startTime
      const currentProgress = Math.min(Math.max(elapsed / HOLD_DURATION_MS, 0), 1)
      setProgress(currentProgress)

      if (elapsed >= HOLD_DURATION_MS) {
        completedRef.current = true
        setIsHolding(false)
        setProgress(0)
        animFrameRef.current = null
        onHoldComplete()
      } else {
        animFrameRef.current = requestAnimationFrame(step)
      }
    }

    animFrameRef.current = requestAnimationFrame(step)
  }, [onHoldComplete])

  useEffect(() => {
    const handleBlur = () => {
      if (!completedRef.current) {
        cancelHold()
      }
    }
    const handleVisibilityChange = () => {
      if (window.document.hidden && !completedRef.current) {
        cancelHold()
      }
    }

    window.addEventListener("blur", handleBlur)
    window.document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      cancelHold()
      window.removeEventListener("blur", handleBlur)
      window.document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [cancelHold])

  const radius = 8
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <button
      type="button"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors select-none",
        compact ? "size-9 border" : "size-8",
        "hover:bg-destructive/10 hover:text-destructive focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-destructive",
        isHolding && "bg-destructive/15 text-destructive font-medium",
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        pointerIdRef.current = e.pointerId
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {}
        startHold()
      }}
      onPointerUp={(e) => {
        try {
          if (pointerIdRef.current !== null && e.currentTarget.hasPointerCapture(pointerIdRef.current)) {
            e.currentTarget.releasePointerCapture(pointerIdRef.current)
          }
        } catch {}
        pointerIdRef.current = null
        e.preventDefault()
        e.stopPropagation()
        if (!completedRef.current) {
          cancelHold()
        } else {
          completedRef.current = false
        }
      }}
      onPointerLeave={() => {
        if (!completedRef.current && pointerIdRef.current === null) {
          cancelHold()
        }
      }}
      onPointerCancel={(e) => {
        try {
          if (pointerIdRef.current !== null && e.currentTarget.hasPointerCapture(pointerIdRef.current)) {
            e.currentTarget.releasePointerCapture(pointerIdRef.current)
          }
        } catch {}
        pointerIdRef.current = null
        if (!completedRef.current) {
          cancelHold()
        } else {
          completedRef.current = false
        }
      }}
      onTouchStart={(e) => {
        const touch = e.touches[0]
        if (touch) {
          touchStartPosRef.current = { x: touch.clientX, y: touch.clientY }
        }
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0]
        if (touch && touchStartPosRef.current && !completedRef.current) {
          const dx = Math.abs(touch.clientX - touchStartPosRef.current.x)
          const dy = Math.abs(touch.clientY - touchStartPosRef.current.y)
          if (dx > 6 || dy > 6) {
            cancelHold()
          }
        }
      }}
      onTouchEnd={(e) => {
        touchStartPosRef.current = null
        e.stopPropagation()
        if (!completedRef.current) {
          cancelHold()
        } else {
          completedRef.current = false
        }
      }}
      onTouchCancel={() => {
        touchStartPosRef.current = null
        if (!completedRef.current) {
          cancelHold()
        } else {
          completedRef.current = false
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          e.stopPropagation()
          if (!e.repeat && !isHolding) {
            startHold()
          }
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          e.stopPropagation()
          if (!completedRef.current) {
            cancelHold()
          } else {
            completedRef.current = false
          }
        }
      }}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      aria-label={`Remove ${reportTitle} (press and hold for 400 ms)`}
      title="Press and hold for 400 ms"
    >
      <svg
        className={cn(
          "absolute inset-0 size-full -rotate-90 pointer-events-none transition-opacity duration-150 p-1",
          isHolding || progress > 0 ? "opacity-100" : "opacity-0",
        )}
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-destructive/25"
        />
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-destructive"
        />
      </svg>
      <Trash2 className={cn("size-4 text-inherit transition-transform duration-100", isHolding && "scale-90")} />
    </button>
  )
}

export function ProjectSiteVisitReports({
  projectId,
  reports,
  memberMobile = false,
  canDeleteReport = false,
}: {
  projectId: string
  reports: ProjectSiteVisitReport[]
  memberMobile?: boolean
  canDeleteReport?: boolean
}) {
  const router = useRouter()
  const { locale } = useI18n()
  const isArabic = locale === "ar"
  const [mobileOpen, setMobileOpen] = useState(false)
  const [items, setItems] = useState<ProjectSiteVisitReport[]>(reports)

  useEffect(() => {
    setItems(reports)
  }, [reports])

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [reportToDelete, setReportToDelete] = useState<ProjectSiteVisitReport | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleHoldComplete = useCallback((report: ProjectSiteVisitReport) => {
    setReportToDelete(report)
    setDeleteError(null)
    setDeleteDialogOpen(true)
  }, [])

  const handleConfirmDelete = async () => {
    if (!reportToDelete || isDeleting) return
    setIsDeleting(true)
    setDeleteError(null)

    try {
      const res = await softDeleteSiteVisitReportAction({
        reportId: reportToDelete.id,
        projectId,
      })

      if (!res.ok) {
        setDeleteError(res.error || "Failed to remove report.")
        setIsDeleting(false)
        return
      }

      setItems((prev) => prev.filter((r) => r.id !== reportToDelete.id))
      setDeleteDialogOpen(false)
      setReportToDelete(null)
      setIsDeleting(false)
      router.refresh()
    } catch (err) {
      setIsDeleting(false)
      setDeleteError(err instanceof Error ? err.message : "An unexpected error occurred while removing the report.")
    }
  }

  const labels = isArabic
    ? {
        title: "٤. تقارير زيارات الموقع",
        mobileTitle: "تقارير زيارات الموقع",
        report: "التقرير",
        stage: "المرحلة",
        visitNo: "رقم الزيارة",
        date: "التاريخ",
        supervisor: "المشرف",
        actions: "الإجراءات",
        viewReport: "عرض التقرير",
        downloadPdf: "تحميل PDF",
        empty: "لم يتم تسجيل أي تقارير زيارات موقع لهذا المشروع حتى الآن.",
        dialogTitle: "إزالة تقرير زيارة الموقع من المشروع؟",
        dialogDescPrefix: "هل أنت متأكد من رغبتك في إزالة ",
        dialogDescSuffix: " من تقارير هذا المشروع؟ سيبقى التقرير متاحاً في سجلات الاشتراك واستخدام أرصدة التقارير. لا يؤدي هذا الإجراء إلى استرداد أو إلغاء الأرصدة المستهلكة.",
        cancel: "إلغاء",
        removeReport: "إزالة التقرير",
        removing: "جاري الإزالة...",
      }
    : {
        title: "4. Site Visit Reports",
        mobileTitle: "Site Visit Reports",
        report: "Report",
        stage: "Stage",
        visitNo: "Visit No.",
        date: "Date",
        supervisor: "Supervisor",
        actions: "Actions",
        viewReport: "View report",
        downloadPdf: "Download PDF",
        empty: "No site visit reports have been recorded for this project yet.",
        dialogTitle: "Remove this Site Visit Report from the project?",
        dialogDescPrefix: "Are you sure you want to remove ",
        dialogDescSuffix: " from this project's reports? The report will remain available in subscription and Report Credit records. This action does not refund or reverse consumed credits.",
        cancel: "Cancel",
        removeReport: "Remove Report",
        removing: "Removing...",
      }

  return (
    <>
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
          {items.length ? (
            <>
              <div className={cn("overflow-x-auto", memberMobile && "max-md:hidden")}>
                <table className="w-full min-w-[760px] table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead className="border-b bg-muted/45 text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="py-3 ps-5 pe-3 text-start sm:ps-6">{labels.report}</th>
                      <th className="px-3 py-3 text-start">{labels.stage}</th>
                      <th className="px-3 py-3 text-start">{labels.visitNo}</th>
                      <th className="px-3 py-3 text-start">{labels.date}</th>
                      <th className="px-3 py-3 text-start">{labels.supervisor}</th>
                      <th className="py-3 ps-3 pe-5 text-end sm:pe-6">{labels.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((report) => (
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
                        <td className="px-3 py-3.5">
                          <span className="block truncate" title={report.supervisorName}>{report.supervisorName}</span>
                        </td>
                        <td className="py-3.5 ps-3 pe-5 text-end sm:pe-6">
                          <div className="inline-flex items-center gap-1">
                            <Link
                              href={`/projects/${projectId}/stages/${report.stageId}/reports/${report.id}`}
                              title={labels.viewReport}
                              aria-label={`${labels.viewReport} ${report.reportTitle}`}
                              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <Eye className="size-4" />
                            </Link>
                            <a
                              href={`/api/stage-translations/pdf?projectId=${encodeURIComponent(projectId)}&responseId=${encodeURIComponent(report.id)}&kind=bilingual`}
                              title={labels.downloadPdf}
                              aria-label={`${labels.downloadPdf} ${report.reportTitle}`}
                              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <Download className="size-4" />
                            </a>
                            {canDeleteReport ? (
                              <HoldToDeleteSiteVisitReportButton
                                reportTitle={report.reportTitle}
                                onHoldComplete={() => handleHoldComplete(report)}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {memberMobile ? (
                <div className="divide-y md:hidden">
                  {items.map((report) => (
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
                      <div className="mt-2 flex items-center justify-end gap-1.5 border-t pt-2">
                        <Link
                          href={`/projects/${projectId}/stages/${report.stageId}/reports/${report.id}`}
                          title={labels.viewReport}
                          aria-label={`${labels.viewReport} ${report.reportTitle}`}
                          className="inline-flex size-8 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Eye className="size-4" />
                        </Link>
                        <a
                          href={`/api/stage-translations/pdf?projectId=${encodeURIComponent(projectId)}&responseId=${encodeURIComponent(report.id)}&kind=bilingual`}
                          title={labels.downloadPdf}
                          aria-label={`${labels.downloadPdf} ${report.reportTitle}`}
                          className="inline-flex size-8 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Download className="size-4" />
                        </a>
                        {canDeleteReport ? (
                          <HoldToDeleteSiteVisitReportButton
                            reportTitle={report.reportTitle}
                            onHoldComplete={() => handleHoldComplete(report)}
                            compact={true}
                          />
                        ) : null}
                      </div>
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

      <Dialog
        open={deleteDialogOpen}
        disablePointerDismissal={true}
        onOpenChange={(open: boolean, eventDetails?: { reason?: string }) => {
          if (!isDeleting) {
            const reason = eventDetails?.reason
            if (!open && (reason === "outside-press" || reason === "outsidePress" || reason === "focus-out" || reason === "focusOut")) {
              return
            }
            setDeleteDialogOpen(open)
            if (!open) {
              setReportToDelete(null)
              setDeleteError(null)
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{labels.dialogTitle}</DialogTitle>
            <DialogDescription className="text-pretty break-words">
              {labels.dialogDescPrefix}
              <span className="font-semibold text-foreground break-all inline-block max-w-full">
                &ldquo;{reportToDelete?.reportTitle}&rdquo;
              </span>
              {labels.dialogDescSuffix}
            </DialogDescription>
          </DialogHeader>

          {deleteError ? (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {deleteError}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!isDeleting) {
                  setDeleteDialogOpen(false)
                  setReportToDelete(null)
                  setDeleteError(null)
                }
              }}
              disabled={isDeleting}
            >
              {labels.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {labels.removing}
                </>
              ) : (
                labels.removeReport
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
