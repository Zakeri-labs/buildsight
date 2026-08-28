"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Check, Copy, Download, FileDown, Loader2, RotateCw, Share2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { ProjectStageTranslationSummary } from "@/lib/db/project-stages"
import { enqueueStageTranslationJob } from "@/lib/stage-translations/client-auto-generation"
import { exportTranslationPdf, downloadPdfBlob, storeTranslationPdf, ensureBilingualPdfStored } from "@/lib/stage-translations/client-pdf"
import { buildShareMessage, buildWhatsAppShareUrl } from "@/lib/stage-translations/whatsapp-share"
import { cn } from "@/lib/utils"
import { logDiagnosticEvent } from "@/lib/stage-translations/debug-timeline"
import { DebugTimelinePanel } from "@/components/stages/debug-timeline-panel"

export function ReportDownloadSection({
  projectId,
  projectName,
  stageId,
  termId,
  responseId,
  reportTitle,
  reportSubject,
  visitNumber,
  supervisorName,
  initialTranslation,
  responseUpdatedAt,
  locale,
  variant = "card",
}: {
  projectId: string
  projectName?: string
  stageId: string
  termId?: string
  responseId: string
  reportTitle?: string
  reportSubject?: string
  visitNumber?: number | string
  supervisorName?: string
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
  const [sharing, setSharing] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)

  const hasStoredPdf = Boolean(translation?.bilingualPdfPath || translation?.originalPdfPath)
  const status = translation?.status ?? "pending"
  const isFailed = (status === "failed" || status === "error") && !hasStoredPdf
  const isCompleted = status === "completed" || hasStoredPdf
  const isPending = !isCompleted && !isFailed

  const isStale = Boolean(
    translation?.generatedAt &&
      responseUpdatedAt &&
      new Date(responseUpdatedAt).getTime() > new Date(translation.generatedAt).getTime(),
  )

  useEffect(() => {
    logDiagnosticEvent(responseId, "DOWNLOAD_SECTION_STATE", {
      localStatus: translation?.status || null,
      initialPropStatus: initialTranslation?.status || null,
      originalPathPresence: Boolean(translation?.originalPdfPath),
      bilingualPathPresence: Boolean(translation?.bilingualPdfPath),
      translatedContentPresence: Boolean(translation?.translatedContent),
    })
  }, [responseId, translation?.status, initialTranslation?.status, translation?.originalPdfPath, translation?.bilingualPdfPath, translation?.translatedContent])

  useEffect(() => {
    if (initialTranslation) {
      setTranslation((current) => {
        if (!current) return initialTranslation
        return {
          ...current,
          ...initialTranslation,
          bilingualPdfPath: initialTranslation.bilingualPdfPath || current.bilingualPdfPath,
          originalPdfPath: initialTranslation.originalPdfPath || current.originalPdfPath,
        }
      })
    }
  }, [initialTranslation])

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
    if (retryBusy) return
    setRetryBusy(true)
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

  async function ensureBilingualPdfReady(): Promise<string | null> {
    const hasLocal = Boolean(translation?.bilingualPdfPath)
    logDiagnosticEvent(responseId, "PAGE_BILINGUAL_LOCAL_CHECK", {
      pathExists: hasLocal,
      bilingualPdfPath: translation?.bilingualPdfPath || null,
    })
    if (translation?.bilingualPdfPath) return translation.bilingualPdfPath

    logDiagnosticEvent(responseId, "PAGE_BILINGUAL_SERVER_LOOKUP_STARTED", {
      projectId,
      stageId,
      termId: termId || null,
      responseId,
    })

    const res = await ensureBilingualPdfStored({
      projectId,
      stageId,
      termId: termId || undefined,
      responseId,
      existingPath: translation?.bilingualPdfPath,
      caller: "report_download_section",
    })

    logDiagnosticEvent(responseId, "PAGE_BILINGUAL_SERVER_LOOKUP_RESULT", {
      storagePath: res.storagePath,
    })

    if (res.translation) {
      setTranslation((current) => ({ ...(current || {}), ...res.translation }))
    }
    return res.storagePath
  }

  async function handleWhatsAppShare() {
    if (sharing) return
    setSharing(true)
    const newTab = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null
    try {
      if (isLinkExpired || isStale) {
        handleRetry()
      }
      await ensureBilingualPdfReady()
      const url = buildWhatsAppShareUrl({
        projectName: projectName || "Project",
        reportTitle: reportTitle || "Inspection Report",
        reportSubject: reportSubject || reportTitle || "Inspection Report",
        visitNumber,
        supervisorName,
        projectId,
        stageId: termId || stageId,
        responseId,
        translationId: translation?.id,
      })
      if (newTab) {
        newTab.location.href = url
      } else if (typeof window !== "undefined") {
        window.location.href = url
      }
    } catch (err) {
      if (newTab) newTab.close()
      console.error("WhatsApp share PDF preparation error:", err)
    } finally {
      setSharing(false)
    }
  }

  async function handleCopyShare() {
    if (sharing) return
    setSharing(true)
    try {
      if (isLinkExpired || isStale) {
        handleRetry()
      }
      await ensureBilingualPdfReady()
      const msg = buildShareMessage({
        projectName: projectName || "Project",
        reportTitle: reportTitle || "Inspection Report",
        reportSubject: reportSubject || reportTitle || "Inspection Report",
        visitNumber,
        supervisorName,
        projectId,
        stageId: termId || stageId,
        responseId,
        translationId: translation?.id,
      })

      let success = false
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(msg.text)
          success = true
        } catch {
          // Fall back to legacy document.execCommand if writeText fails
        }
      }

      if (!success && typeof document !== "undefined") {
        try {
          const textarea = document.createElement("textarea")
          textarea.value = msg.text
          textarea.style.position = "fixed"
          textarea.style.opacity = "0"
          document.body.appendChild(textarea)
          textarea.focus()
          textarea.select()
          success = document.execCommand("copy")
          document.body.removeChild(textarea)
        } catch {
          // Ignore copy fallback failure
        }
      }

      if (success) {
        setCopiedShare(true)
        setTimeout(() => setCopiedShare(false), 2000)
      }
    } catch (err) {
      console.error("Copy share text error:", err)
    } finally {
      setSharing(false)
    }
  }

  async function handleDownload(kind: "original" | "bilingual") {
    if (downloading) return
    setDownloading(kind)

    if (kind === "bilingual") {
      logDiagnosticEvent(responseId, "PAGE_BILINGUAL_CLICK", {
        kind,
        localBilingualPdfPath: translation?.bilingualPdfPath || null,
      })
    }

    try {
      if (kind === "bilingual") {
        const storedPath = await ensureBilingualPdfReady()
        if (storedPath && translation?.id) {
          logDiagnosticEvent(responseId, "PAGE_BILINGUAL_STORED_DOWNLOAD_SELECTED", {
            storedPath,
            translationId: translation.id,
          })
          const params = new URLSearchParams({
            projectId,
            translationId: translation.id,
            kind: "bilingual",
          })
          window.location.assign(`/api/stage-translations/pdf?${params.toString()}`)
          setTimeout(() => setDownloading(null), 2500)
          return
        }
      } else {
        const storedPath = translation?.originalPdfPath
        if (storedPath && translation?.id) {
          const params = new URLSearchParams({
            projectId,
            translationId: translation.id,
            kind: "original",
          })
          window.location.assign(`/api/stage-translations/pdf?${params.toString()}`)
          setTimeout(() => setDownloading(null), 2500)
          return
        }
      }

      if (kind === "bilingual") {
        logDiagnosticEvent(responseId, "PAGE_BILINGUAL_FALLBACK_SELECTED", {
          reason: "stored_path_creation_or_lookup_returned_null",
        })
      }

      // Fallback export if storage path creation failed
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

      if (kind === "bilingual") {
        logDiagnosticEvent(responseId, "PAGE_BILINGUAL_EXPORT_STARTED", {
          hasData: Boolean(data),
          hasTranslation: Boolean(data.translation),
        })
      }

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
      if (kind === "bilingual") {
        logDiagnosticEvent(responseId, "PAGE_BILINGUAL_DOWNLOAD_FAILED", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      console.error("PDF download error:", err)
    } finally {
      setDownloading(null)
    }
  }

  if (variant === "sticky") {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={downloading !== null}
          onClick={() => handleDownload("original")}
          className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
        >
          {downloading === "original" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          <span>English PDF</span>
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={downloading !== null}
          onClick={() => handleDownload("bilingual")}
          className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
        >
          {downloading === "bilingual" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          <span>Bilingual PDF</span>
        </Button>
      </div>
    )
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {locale === "ar" ? "ملفات PDF للتقرير والترجمة" : "Report PDFs & Translation"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isCompleted
                ? locale === "ar"
                  ? "تنزيل أو مشاركة وثائق التقرير المعتمدة."
                  : "Download or share the official report documents."
                : isPending
                  ? locale === "ar"
                    ? "الترجمة والملفات قيد المعالجة التلقائية."
                    : "Translation and PDFs are generating automatically in the background."
                  : locale === "ar"
                    ? "تعذر إكمال عملية الترجمة التلقائية."
                    : "Automatic translation processing was not completed."}
            </p>
          </div>
          {isStale && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              <AlertCircle className="size-3.5" />
              <span>{locale === "ar" ? "محتوى التقرير مُعدّل" : "Report Content Updated"}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 sm:justify-between">
          {isPending ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>{locale === "ar" ? "جاري الترجمة وإعداد ملفات PDF..." : "Translating & generating PDFs..."}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={downloading !== null}
                onClick={() => handleDownload("original")}
                className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
              >
                {downloading === "original" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                <span>English PDF</span>
              </Button>
            </div>
          ) : isFailed ? (
            <div className="flex items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="size-4" />
                <span>{locale === "ar" ? "تعذر إنشاء الترجمة تلقائياً." : "Automatic translation generation failed."}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={downloading !== null}
                  onClick={() => handleDownload("original")}
                  className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
                >
                  {downloading === "original" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                  <span>English PDF</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={retryBusy}
                  onClick={handleRetry}
                  className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
                >
                  {retryBusy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                  <span>{locale === "ar" ? "إعادة المحاولة" : "Retry"}</span>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sharing}
                onClick={handleWhatsAppShare}
                className="h-9 gap-1.5 rounded-xl border-emerald-500/40 bg-emerald-50/60 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-100/80 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 shadow-2xs"
              >
                {sharing ? <Loader2 className="size-4 animate-spin text-emerald-600" /> : <Share2 className="size-4 text-emerald-600 dark:text-emerald-400" />}
                <span>{locale === "ar" ? "مشاركة" : "Share"}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sharing}
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

        <DebugTimelinePanel responseId={responseId} />
      </div>
    </Card>
  )
}
