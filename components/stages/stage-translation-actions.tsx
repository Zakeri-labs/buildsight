"use client"

import Link from "next/link"
import { useState } from "react"
import { Download, Languages, Loader2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import type { ProjectStageTranslationSummary } from "@/lib/db/project-stages"
import { downloadPdfBlob, exportTranslationPdf, storeTranslationPdf } from "@/lib/stage-translations/client-pdf"
import type { StageTranslationPageData } from "@/lib/stage-translations/types"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

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

  const stale = Boolean(
    translation.generatedAt && new Date(responseUpdatedAt).getTime() > new Date(translation.generatedAt).getTime(),
  )

  const isDirectStage = !termId || termId === stageId

  async function generateAndStore(kind: PdfKind) {
    const params = new URLSearchParams({ projectId, stageId, termId, responseId })
    const response = await fetch(`/api/stage-translations?${params.toString()}`, { cache: "no-store" })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error || copy.failed)
    const data = payload?.data as StageTranslationPageData | undefined
    const record = data?.translation
    if (!data || !record || record.status !== "completed") throw new Error(copy.failed)
    if (kind !== "original" && !record.translatedContent) throw new Error(copy.failed)

    const isStale = Boolean(
      record.generatedAt && new Date(data.response.updatedAt).getTime() > new Date(record.generatedAt).getTime(),
    )
    if (kind !== "original" && isStale) throw new Error(copy.stale)

    const exported = await exportTranslationPdf({ data, translation: record, kind })
    const storagePath = await storeTranslationPdf({
      projectId,
      translationId: record.id,
      kind,
      blob: exported.blob,
      filename: exported.filename,
    })
    setTranslation((current) => ({
      ...current,
      id: record.id,
      status: record.status,
      generatedAt: record.generatedAt,
      translatedContent: record.translatedContent,
      originalPdfPath: kind === "original" ? storagePath : current.originalPdfPath,
      arabicPdfPath: kind === "arabic" ? storagePath : current.arabicPdfPath,
      bilingualPdfPath: kind === "bilingual" ? storagePath : current.bilingualPdfPath,
    }))
    downloadPdfBlob(exported.blob, exported.filename)
  }

  async function download(kind: PdfKind) {
    if (busy || (kind !== "original" && stale)) return
    setError(null)
    const storedPath = pdfPath(translation, kind)
    if (isDirectStage) {
      if (!storedPath || !translation.id) {
        setError(copy.preparing)
        return
      }
      const params = new URLSearchParams({ projectId, translationId: translation.id, kind })
      window.location.assign(`/api/stage-translations/pdf?${params.toString()}`)
      return
    }
    if (storedPath && kind !== "original") {
      const params = new URLSearchParams({ projectId, translationId: translation.id, kind })
      window.location.assign(`/api/stage-translations/pdf?${params.toString()}`)
      return
    }

    setBusy(kind)
    try {
      await generateAndStore(kind)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : copy.failed)
    } finally {
      setBusy(null)
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
    <div className={cn("flex min-w-0 flex-col gap-1.5", inHeader ? "items-start sm:items-end" : "items-end")} onClick={(event) => event.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={
            !termId || termId === stageId
              ? `/projects/${projectId}/stages/${stageId}/reports/${responseId}/translate`
              : `/projects/${projectId}/stages/${stageId}/terms/${termId}/reports/${responseId}/translate`
          }
          className={cn(buttonVariants({ size: btnSize, variant: inHeader ? "secondary" : "secondary" }), translateBtnClass)}
        >
          <Languages className="size-4" />{copy.translate}
        </Link>
        <Button size={btnSize} variant="outline" className={downloadBtnClass} disabled={busy !== null || !directOriginalReady} title={!directOriginalReady ? copy.preparing : copy.english} onClick={() => void download("original")}>
          {busy === "original" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{copy.english}
        </Button>
        <Button
          size={btnSize}
          variant="outline"
          className={cn(downloadBtnClass, (!isTranslated || !directArabicReady) && "opacity-50 cursor-not-allowed")}
          disabled={busy !== null || !isTranslated || stale || !directArabicReady}
          title={!directArabicReady ? copy.preparing : !isTranslated ? untranslatedHint : stale ? copy.stale : copy.arabic}
          onClick={() => void download("arabic")}
        >
          {busy === "arabic" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{copy.arabic}
        </Button>
        <Button
          size={btnSize}
          variant="outline"
          className={cn(downloadBtnClass, (!isTranslated || !directBilingualReady) && "opacity-50 cursor-not-allowed")}
          disabled={busy !== null || !isTranslated || stale || !directBilingualReady}
          title={!directBilingualReady ? copy.preparing : !isTranslated ? untranslatedHint : stale ? copy.stale : copy.bilingual}
          onClick={() => void download("bilingual")}
        >
          {busy === "bilingual" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{copy.bilingual}
        </Button>
      </div>
      {error ? <p role="alert" className={cn("max-w-md text-end text-[11px]", inHeader ? "text-amber-200" : "text-red-600")}>{error}</p> : null}
      {stale ? <p className={cn("max-w-md text-end text-[11px]", inHeader ? "text-amber-200" : "text-amber-700")}>{copy.stale}</p> : null}
    </div>
  )
}
