"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Download, Languages, Loader2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import type { ProjectStageTranslationSummary } from "@/lib/db/project-stages"
import { downloadPdfBlob, exportTranslationPdf, storeTranslationPdf } from "@/lib/stage-translations/client-pdf"
import type { StageTranslationPageData } from "@/lib/stage-translations/types"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { logDiagnosticEvent } from "@/lib/stage-translations/debug-timeline"

const COPY = {
  en: {
    translate: "Translate",
    english: "EN",
    arabic: "AR",
    bilingual: "EN / AR",
    stale: "The report changed after translation. Regenerate the translation before downloading Arabic or bilingual PDFs.",
    failed: "Unable to generate or download the PDF.",
    preparing: "Translation and PDFs are still being prepared.",
  },
  ar: {
    translate: "ترجمة",
    english: "EN",
    arabic: "AR",
    bilingual: "EN / AR",
    stale: "تم تعديل التقرير بعد الترجمة. أعد إنشاء الترجمة قبل تنزيل ملف PDF العربي أو ثنائي اللغة.",
    failed: "تعذر إنشاء ملف PDF أو تنزيله.",
    preparing: "لا تزال الترجمة وملفات PDF قيد الإعداد.",
  },
} as const

type PdfKind = "original" | "arabic" | "bilingual"

function pdfPath(translation: ProjectStageTranslationSummary, kind: PdfKind) {
  if (kind === "original") return translation.originalPdfPath
  if (kind === "arabic") return translation.arabicPdfPath
  return translation.bilingualPdfPath
}

export function StageTranslationActions({
  projectId,
  stageId,
  termId,
  responseId,
  responseUpdatedAt = new Date().toISOString(),
  translation: initialTranslation,
  inHeader = false,
}: {
  projectId: string
  stageId: string
  termId: string
  responseId: string
  responseUpdatedAt?: string
  translation?: ProjectStageTranslationSummary | null
  inHeader?: boolean
}) {
  const { locale } = useI18n()
  const copy = COPY[locale]
  const [translation, setTranslation] = useState<ProjectStageTranslationSummary>(
    initialTranslation ?? {
      id: "",
      status: "pending",
      generatedAt: null,
      originalPdfPath: null,
      arabicPdfPath: null,
      bilingualPdfPath: null,
      translatedContent: null,
    },
  )
  const [busy, setBusy] = useState<PdfKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isDirectStage = !termId || termId === stageId

  const stale = Boolean(
    translation.generatedAt && new Date(responseUpdatedAt).getTime() > new Date(translation.generatedAt).getTime(),
  )

  const allGeneratedPdfsReady = Boolean(
    translation?.originalPdfPath && translation?.arabicPdfPath && translation?.bilingualPdfPath,
  )

  const isFullyReady = Boolean(
    translation?.status === "completed" &&
      !stale &&
      (isDirectStage ? allGeneratedPdfsReady : Boolean(translation?.translatedContent)),
  )

  const isFailed = translation?.status === "failed" || translation?.status === "error"
  const isProcessing = !isFullyReady && !isFailed

  useEffect(() => {
    if (initialTranslation) {
      setTranslation((current) => ({
        ...current,
        ...initialTranslation,
        bilingualPdfPath: initialTranslation.bilingualPdfPath ?? current.bilingualPdfPath,
        originalPdfPath: initialTranslation.originalPdfPath ?? current.originalPdfPath,
        arabicPdfPath: initialTranslation.arabicPdfPath ?? current.arabicPdfPath,
        translatedContent: initialTranslation.translatedContent ?? current.translatedContent,
      }))
    }
  }, [initialTranslation])

  useEffect(() => {
    logDiagnosticEvent(responseId, "TRANSLATION_UI_STATE", {
      status: translation.status,
      isFullyReady,
      isProcessing,
      stale,
      originalPdfPath: translation.originalPdfPath || null,
      bilingualPdfPath: translation.bilingualPdfPath || null,
      hasTranslatedContent: Boolean(translation.translatedContent),
    })

    logDiagnosticEvent(responseId, "READINESS_CHECK", {
      component: "StageTranslationActions",
      isDirectStage,
      statusCompleted: translation.status === "completed",
      stale,
      translatedContentPresent: Boolean(translation.translatedContent),
      originalPdfPresent: Boolean(translation.originalPdfPath),
      bilingualPdfPresent: Boolean(translation.bilingualPdfPath),
      arabicPdfPresent: Boolean(translation.arabicPdfPath),
      allGeneratedPdfsReady,
      result: isFullyReady,
    })
  }, [responseId, translation.status, isFullyReady, isProcessing, stale, translation.originalPdfPath, translation.bilingualPdfPath, translation.arabicPdfPath, translation.translatedContent, isDirectStage, allGeneratedPdfsReady])

  useEffect(() => {
    if (isFullyReady || isFailed) {
      return
    }

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
          setTranslation((current) => ({
            ...current,
            id: fetched.id || current.id,
            status: fetched.status,
            generatedAt: fetched.generatedAt || current.generatedAt,
            originalPdfPath: fetched.originalPdfPath ?? current.originalPdfPath,
            arabicPdfPath: fetched.arabicPdfPath ?? current.arabicPdfPath,
            bilingualPdfPath: fetched.bilingualPdfPath ?? current.bilingualPdfPath,
            translatedContent: fetched.translatedContent ?? current.translatedContent,
          }))
        }
      } catch {
        // Safe status poll - ignore errors
      }
    }, 3000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [projectId, stageId, termId, responseId, isFullyReady, isFailed])

  async function generateAndStore(kind: PdfKind) {
    const params = new URLSearchParams({ projectId, stageId, termId, responseId })
    const response = await fetch(`/api/stage-translations?${params.toString()}`, { cache: "no-store" })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.data) throw new Error(payload?.error || copy.failed)

    const pageData = payload.data as StageTranslationPageData
    const pdf = await exportTranslationPdf({
      data: pageData,
      translation: pageData.translation,
      kind,
      ccRecipients: payload.ccRecipients ?? [],
      appendClosingBlock: true,
    })

    downloadPdfBlob(pdf.blob, pdf.filename)

    if (pageData.translation?.id) {
      const savedPath = await storeTranslationPdf({
        projectId,
        translationId: pageData.translation.id,
        kind,
        blob: pdf.blob,
        filename: pdf.filename,
      })
      setTranslation((current) => ({
        ...current,
        id: pageData.translation!.id,
        status: "completed",
        generatedAt: pageData.translation!.generatedAt ?? new Date().toISOString(),
        originalPdfPath: kind === "original" ? savedPath : current.originalPdfPath,
        arabicPdfPath: kind === "arabic" ? savedPath : current.arabicPdfPath,
        bilingualPdfPath: kind === "bilingual" ? savedPath : current.bilingualPdfPath,
      }))
    }
  }

  const [downloading, setDownloading] = useState<PdfKind | null>(null)

  async function download(kind: PdfKind) {
    if (busy || downloading || (kind !== "original" && stale)) return
    setError(null)
    setDownloading(kind)
    const storedPath = pdfPath(translation, kind)

    logDiagnosticEvent(responseId, "PAGE_BILINGUAL_CLICK", {
      kind,
      hasStoredPath: Boolean(storedPath),
      isDirectStage,
    })

    if (isDirectStage) {
      if (!storedPath || !translation.id) {
        setError(copy.preparing)
        setDownloading(null)
        return
      }
      const params = new URLSearchParams({ projectId, translationId: translation.id, kind })
      const endpointPath = `/api/stage-translations/pdf?${params.toString()}`

      logDiagnosticEvent(responseId, "BROWSER_DOWNLOAD_STORED_STARTED", {
        caller: "stage_translation_actions",
        kind,
        translationId: translation.id,
        endpointPath,
      })
      logDiagnosticEvent(responseId, "BROWSER_DOWNLOAD_STORED_TRIGGERED", {
        caller: "stage_translation_actions",
        kind,
        endpointPath,
      })

      window.location.assign(endpointPath)
      setTimeout(() => setDownloading(null), 2000)
      return
    }
    if (storedPath && kind !== "original") {
      const params = new URLSearchParams({ projectId, translationId: translation.id, kind })
      const endpointPath = `/api/stage-translations/pdf?${params.toString()}`

      logDiagnosticEvent(responseId, "BROWSER_DOWNLOAD_STORED_STARTED", {
        caller: "stage_translation_actions",
        kind,
        translationId: translation.id,
        endpointPath,
      })
      logDiagnosticEvent(responseId, "BROWSER_DOWNLOAD_STORED_TRIGGERED", {
        caller: "stage_translation_actions",
        kind,
        endpointPath,
      })

      window.location.assign(endpointPath)
      setTimeout(() => setDownloading(null), 2000)
      return
    }

    setBusy(kind)
    try {
      await generateAndStore(kind)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : copy.failed)
    } finally {
      setBusy(null)
      setDownloading(null)
    }
  }

  const btnSize = inHeader ? "sm" : "xs"
  const translateBtnClass = inHeader ? "bg-white text-primary hover:bg-white/90 font-medium" : ""
  const downloadBtnClass = inHeader
    ? "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
    : ""

  const isTranslated = Boolean(
    translation?.status === "completed" && translation?.generatedAt && (isDirectStage || translation?.translatedContent)
  )

  const untranslatedHint = locale === "ar" ? "ترجم التقرير أولاً لتفعيل التنزيل" : "Translate report first to enable PDF download"
  const directOriginalReady = !isDirectStage || Boolean(translation.originalPdfPath && translation.id && !stale)
  const directArabicReady = !isDirectStage || Boolean(translation.arabicPdfPath && translation.id && !stale)
  const directBilingualReady = !isDirectStage || Boolean(translation.bilingualPdfPath && translation.id && !stale)

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", inHeader ? "w-full sm:w-auto items-stretch sm:items-end" : "items-end")} onClick={(event) => event.stopPropagation()}>
      <div className={cn(
        "items-center gap-1.5",
        inHeader
          ? "flex w-full justify-end sm:grid sm:grid-cols-[1fr_auto_1fr] sm:w-auto"
          : "grid grid-cols-[1fr_auto_1fr] w-full sm:flex sm:w-auto sm:justify-start"
      )}>
        <Link
          href={
            !termId || termId === stageId
              ? `/projects/${projectId}/stages/${stageId}/reports/${responseId}/translate`
              : `/projects/${projectId}/stages/${stageId}/terms/${termId}/reports/${responseId}/translate`
          }
          className={cn(buttonVariants({ size: btnSize, variant: inHeader ? "secondary" : "secondary" }), "h-8 min-w-0 px-2 text-xs font-semibold gap-1.5 justify-center", translateBtnClass)}
        >
          {isProcessing ? <Loader2 className="size-3.5 animate-spin shrink-0" /> : <Languages className="size-3.5 shrink-0" />}
          <span className="truncate sm:inline hidden">{copy.translate}</span>
        </Link>
        <Button
          size={btnSize}
          variant="outline"
          className={cn("h-8 shrink-0 px-2.5 text-xs font-semibold gap-1.5 justify-center hidden sm:flex", downloadBtnClass)}
          disabled={busy !== null || downloading !== null || !directOriginalReady}
          title={!directOriginalReady ? copy.preparing : copy.english}
          onClick={() => void download("original")}
        >
          {downloading === "original" || busy === "original" ? <Loader2 className="size-3.5 animate-spin shrink-0" /> : <Download className="size-3.5 shrink-0" />}
          <span>{copy.english}</span>
        </Button>
        <Button
          size={btnSize}
          variant="outline"
          className={cn("h-8 min-w-0 px-2 text-xs font-semibold gap-1.5 justify-center hidden sm:flex", downloadBtnClass, (!isTranslated || !directBilingualReady) && "opacity-50 cursor-not-allowed")}
          disabled={busy !== null || downloading !== null || !isTranslated || stale || !directBilingualReady}
          title={!directBilingualReady ? copy.preparing : !isTranslated ? untranslatedHint : stale ? copy.stale : copy.bilingual}
          onClick={() => void download("bilingual")}
        >
          {downloading === "bilingual" || busy === "bilingual" ? <Loader2 className="size-3.5 animate-spin shrink-0" /> : <Download className="size-3.5 shrink-0" />}
          <span className="truncate">{copy.bilingual}</span>
        </Button>
      </div>
      {error ? <p role="alert" className={cn("max-w-md text-end text-[11px]", inHeader ? "text-amber-200" : "text-red-600")}>{error}</p> : null}
      {stale ? <p className={cn("max-w-md text-end text-[11px]", inHeader ? "text-amber-200" : "text-amber-700")}>{copy.stale}</p> : null}

      {isFullyReady ? (
        <div className="fixed inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom duration-500 ease-out border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.45)] backdrop-blur md:hidden">
          <div className="mx-auto grid h-14 max-w-lg grid-cols-2 gap-2 px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 min-w-0 px-2 text-xs font-bold gap-1.5 text-foreground dark:text-foreground bg-background hover:bg-accent border-input shadow-xs disabled:opacity-50"
              onClick={() => void download("original")}
              disabled={busy !== null || downloading !== null || !directOriginalReady}
            >
              {downloading === "original" || busy === "original" ? <Loader2 className="size-3.5 animate-spin text-foreground" /> : <Download className="size-3.5 text-foreground stroke-[2.5]" />}
              <span className="text-foreground font-bold">EN</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 min-w-0 px-2 text-xs font-bold gap-1.5 text-foreground dark:text-foreground bg-background hover:bg-accent border-input shadow-xs disabled:opacity-50"
              onClick={() => void download("bilingual")}
              disabled={busy !== null || downloading !== null || !isTranslated || stale || !directBilingualReady}
            >
              {downloading === "bilingual" || busy === "bilingual" ? <Loader2 className="size-3.5 animate-spin text-foreground" /> : <Download className="size-3.5 text-foreground stroke-[2.5]" />}
              <span className="text-foreground font-bold">EN / AR</span>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
