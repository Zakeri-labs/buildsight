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

  function handleDownload(kind: PdfKind) {
    const existing = pdfPath(translation, kind)
    if (existing && translation.id) {
      const params = new URLSearchParams({ projectId, translationId: translation.id, kind })
      window.location.assign(`/api/stage-translations/pdf?${params.toString()}`)
      return
    }

    setBusy(kind)
    setError(null)
    generateAndStore(kind)
      .catch((err) => setError(err instanceof Error ? err.message : copy.failed))
      .finally(() => setBusy(null))
  }

  const translateHref = `/projects/${projectId}/stages/${stageId}/terms/${termId}/translate?responseId=${responseId}`

  if (inHeader) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href={translateHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5 text-xs font-medium")}
        >
          <Languages className="size-3.5" />
          <span>{copy.translate}</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => handleDownload("original")}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          {busy === "original" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          <span>{copy.english}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null || !isFullyReady}
          onClick={() => handleDownload("bilingual")}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          {busy === "bilingual" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          <span>{copy.bilingual}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null || !isFullyReady}
          onClick={() => handleDownload("arabic")}
          className="h-8 gap-1.5 text-xs font-medium"
        >
          {busy === "arabic" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          <span>{copy.arabic}</span>
        </Button>

        <Link
          href={translateHref}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 gap-1.5 text-xs text-muted-foreground")}
        >
          <Languages className="size-3.5" />
          <span>{copy.translate}</span>
        </Link>
      </div>

      {isProcessing && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>{copy.preparing}</span>
        </div>
      )}

      {stale && <p className="text-xs text-amber-600 dark:text-amber-400">{copy.stale}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
