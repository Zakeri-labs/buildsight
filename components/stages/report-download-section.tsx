"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Check, Copy, Download, FileDown, Loader2, RotateCw, Share2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { ProjectStageTranslationSummary } from "@/lib/db/project-stages"
import { enqueueStageTranslationJob } from "@/lib/stage-translations/client-auto-generation"
import { exportTranslationPdf, downloadPdfBlob, storeTranslationPdf } from "@/lib/stage-translations/client-pdf"
import { buildShareMessage, buildWhatsAppShareUrl } from "@/lib/stage-translations/whatsapp-share"
import { cn } from "@/lib/utils"

export function ReportDownloadSection({
  projectId,
  stageId,
  termId,
  responseId,
  initialTranslation,
  responseUpdatedAt,
  locale,
  variant = "card",
}: {
  projectId: string
  stageId: string
  termId?: string
  responseId: string
  initialTranslation?: ProjectStageTranslationSummary | null
  responseUpdatedAt?: string
  locale: "en" | "ar"
  variant?: "card" | "sticky"
}) {
  const [translation, setTranslation] = useState<ProjectStageTranslationSummary | null>(
    initialTranslation ?? null,
  )
  const [retryBusy, setRetryBusy] = useState(false)
  const [downloading, setDownloading] = useState<"original" | "bilingual" | null>(null)
  const [copiedShare, setCopiedShare] = useState(false)

  const status = translation?.status ?? "pending"
  const isFailed = status === "failed" || status === "error"
  const isCompleted = status === "completed"
  const isPending = !isCompleted && !isFailed

  const isStale = Boolean(
    translation?.generatedAt &&
      responseUpdatedAt &&
      new Date(responseUpdatedAt).getTime() > new Date(translation.generatedAt).getTime(),
  )

  useEffect(() => {
    if (isCompleted && !isStale) return

    let isMounted = true
    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams({
          projectId,
          stageId,
          responseId,
          ...(termId ? { termId } : {}),
          statusOnly: "1",
          background: "1",
        })
        const res = await fetch(`/api/stage-translations?${params.toString()}`, { cache: "no-store" })
        if (!res.ok) return
        const payload = await res.json()
        const fetched = payload?.data?.translation
        if (isMounted && fetched) {
          setTranslation(fetched)
          if (fetched.status === "completed") {
            setRetryBusy(false)
          }
        }
      } catch {
        // Ignore status check errors
      }
    }, 3000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [projectId, stageId, termId, responseId, isCompleted, isStale])

  function handleRetry() {
    setRetryBusy(true)
    setTranslation((current) => (current ? { ...current, status: "pending" } : null))
    enqueueStageTranslationJob({
      projectId,
      stageId: termId || stageId,
      responseId,
      retry: true,
    })
  }

  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000
  const isLinkExpired = Boolean(
    translation?.generatedAt &&
      Date.now() - new Date(translation.generatedAt).getTime() > FIVE_DAYS_MS,
  )

  function handleWhatsAppShare() {
    if (isLinkExpired || isStale) {
      handleRetry()
    }
    const url = buildWhatsAppShareUrl({
      projectName: "Project",
      projectId,
      stageId: termId || stageId,
      responseId,
      translationId: translation?.id,
    })
    window.open(url, "_blank")
  }

  function handleCopyShare() {
    if (isLinkExpired || isStale) {
      handleRetry()
    }
    const msg = buildShareMessage({
      projectName: "Project",
      projectId,
      stageId: termId || stageId,
      responseId,
      translationId: translation?.id,
    })
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(msg.text)
      setCopiedShare(true)
      setTimeout(() => setCopiedShare(false), 2000)
    }
  }

  async function handleDownload(kind: "original" | "bilingual") {
    if (downloading) return
    setDownloading(kind)

    try {
      const storedPath =
        kind === "original"
          ? translation?.originalPdfPath
          : translation?.bilingualPdfPath

      if (storedPath && translation?.id) {
        const params = new URLSearchParams({
          projectId,
          translationId: translation.id,
          kind,
        })
        window.location.assign(`/api/stage-translations/pdf?${params.toString()}`)
        setTimeout(() => setDownloading(null), 2500)
        return
      }

      // Live client PDF generation fallback without navigating to secondary page
      const params = new URLSearchParams({
        projectId,
        stageId: termId || stageId,
        responseId,
        ...(termId ? { termId } : {}),
      })
      const res = await fetch(`/api/stage-translations?${params.toString()}`, { cache: "no-store" })
      if (!res.ok) throw new Error("Unable to load report translation data.")
      const payload = await res.json()
      const data = payload?.data
      if (!data) throw new Error("Report data unavailable.")

      const pdfResult = await exportTranslationPdf({
        data,
        translation: data.translation,
        kind,
        ccRecipients: payload?.ccRecipients ?? [],
        appendClosingBlock: true,
      })

      downloadPdfBlob(pdfResult.blob, pdfResult.filename)

      if (data.translation?.id) {
        storeTranslationPdf({
          projectId,
          translationId: data.translation.id,
          kind,
          blob: pdfResult.blob,
          filename: pdfResult.filename,
        }).catch(() => undefined)
      }
    } catch (err) {
      console.error("PDF download error:", err)
    } finally {
      setDownloading(null)
    }
  }

  if (variant === "sticky") {
    return (
      <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
        {isFailed ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={retryBusy}
            onClick={handleRetry}
            className="h-9 gap-1.5 rounded-lg text-xs font-semibold shadow-xs"
          >
            {retryBusy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
            <span>{locale === "ar" ? "إعادة محاولة إنشاء PDF" : "Retry PDF Generation"}</span>
          </Button>
        ) : isPending || retryBusy ? (
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span>{locale === "ar" ? "جارٍ إعداد PDF..." : "Preparing PDF..."}</span>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleWhatsAppShare}
              className="h-9 gap-1.5 rounded-lg border-emerald-500/40 bg-emerald-50/60 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100/80 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 shadow-xs"
            >
              <Share2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{locale === "ar" ? "مشاركة" : "Share"}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyShare}
              className="h-9 gap-1.5 rounded-lg border-primary/30 bg-background px-3 text-xs font-semibold shadow-xs hover:bg-accent"
            >
              {copiedShare ? (
                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="size-3.5 text-muted-foreground" />
              )}
              <span>{copiedShare ? (locale === "ar" ? "تم النسخ!" : "Copied!") : (locale === "ar" ? "نسخ" : "Copy")}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={downloading !== null}
              onClick={() => handleDownload("original")}
              className="h-9 gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-xs"
            >
              {downloading === "original" ? (
                <Loader2 className="size-3.5 animate-spin text-primary" />
              ) : (
                <Download className="size-3.5 text-primary" />
              )}
              <span>English PDF</span>
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={downloading !== null}
              onClick={() => handleDownload("bilingual")}
              className="h-9 gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-xs"
            >
              {downloading === "bilingual" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              <span>Bilingual PDF</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={locale === "ar" ? "إعادة محاولة / توليد الترجمة" : "Regenerate PDF"}
              onClick={handleRetry}
              className="h-9 size-9 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RotateCw className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <Card
      className={cn(
        "overflow-hidden p-3 sm:p-4 transition-colors",
        isFailed
          ? "border-amber-300 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30"
          : "border-primary/30 bg-primary/5",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              isFailed
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                : "bg-primary/10 text-primary",
            )}
          >
            {isFailed ? (
              <AlertCircle className="size-5" />
            ) : isPending || retryBusy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <FileDown className="size-5" />
            )}
          </span>
          <div>
            <h3 className="text-xs font-bold text-foreground sm:text-sm">
              {isFailed
                ? locale === "ar"
                  ? "تعذر إكمال إعداد PDF التقرير"
                  : "PDF Preparation Incomplete"
                : isPending || retryBusy
                  ? locale === "ar"
                    ? "جارٍ ترجمة وإعداد ملفات PDF..."
                    : "Preparing Translation & PDFs..."
                  : locale === "ar"
                    ? "تحميل ملف PDF للتقرير"
                    : "Download Report PDF"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {isFailed
                ? locale === "ar"
                  ? "التقرير المحفوظ آمن. يمكنك اضغط إعادة المحاولة لبدء الإعداد فوراً."
                  : "The submitted report is saved safely. Click retry to generate PDFs."
                : isPending || retryBusy
                  ? locale === "ar"
                    ? "قد تستغرق العملية چند لحظة. ستظهر أزرار التحميل تلقائياً عند الاكتمال."
                    : "Please wait a moment. Download buttons will appear automatically."
                  : locale === "ar"
                    ? "تنزيل تقرير المعاينة المعتمد بالإنجليزية أو دوزبانه"
                    : "Download official inspection report in English or bilingual format"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {isFailed ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={retryBusy}
              onClick={handleRetry}
              className="h-9 gap-2 rounded-xl px-4 text-xs font-bold shadow-xs"
            >
              {retryBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCw className="size-4" />
              )}
              <span>{locale === "ar" ? "إعادة محاولة إنشاء PDF" : "Retry PDF Generation"}</span>
            </Button>
          ) : isPending || retryBusy ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              className="h-9 gap-2 rounded-xl border-primary/20 bg-background px-3 text-xs font-semibold"
            >
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>{locale === "ar" ? "جارٍ المعالجة..." : "Processing..."}</span>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleWhatsAppShare}
                className="h-9 gap-1.5 rounded-xl border-emerald-500/40 bg-emerald-50/60 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100/80 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 shadow-2xs"
              >
                <Share2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>{locale === "ar" ? "مشاركة" : "Share"}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyShare}
                className="h-9 gap-1.5 rounded-xl border-primary/30 bg-background px-3 text-xs font-bold shadow-2xs hover:bg-accent"
              >
                {copiedShare ? (
                  <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy className="size-4 text-muted-foreground" />
                )}
                <span>{copiedShare ? (locale === "ar" ? "تم النسخ!" : "Copied!") : (locale === "ar" ? "نسخ" : "Copy")}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={downloading !== null}
                onClick={() => handleDownload("original")}
                className="h-9 gap-1.5 rounded-xl border-primary/30 bg-background px-3 text-xs font-bold shadow-2xs hover:bg-accent"
              >
                {downloading === "original" ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : (
                  <Download className="size-4 text-primary" />
                )}
                <span>English PDF</span>
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={downloading !== null}
                onClick={() => handleDownload("bilingual")}
                className="h-9 gap-1.5 rounded-xl px-3 text-xs font-bold shadow-2xs"
              >
                {downloading === "bilingual" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                <span>Bilingual PDF</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={locale === "ar" ? "إعادة توليد الترجمة" : "Regenerate Translation"}
                onClick={handleRetry}
                className="h-9 size-9 text-muted-foreground hover:text-foreground"
              >
                <RotateCw className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
