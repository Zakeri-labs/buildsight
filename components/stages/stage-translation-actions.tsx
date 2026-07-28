"use client"

import Link from "next/link"
import { useState } from "react"
import { Download, Languages, Loader2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import type { ProjectStageTranslationSummary } from "@/lib/db/project-stages"
import { exportTranslationPdf } from "@/lib/stage-translations/client-pdf"
import type { StageTranslationPageData } from "@/lib/stage-translations/types"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const COPY = {
  en: {
    translate: "Translate",
    english: "English PDF",
    arabic: "Arabic PDF",
    bilingual: "Bilingual PDF",
    stale: "The report changed after translation. Regenerate the translation before downloading Arabic or bilingual PDFs.",
    failed: "Unable to generate or download the PDF.",
  },
  ar: {
    translate: "ترجمة",
    english: "PDF إنجليزي",
    arabic: "PDF عربي",
    bilingual: "PDF ثنائي اللغة",
    stale: "تم تعديل التقرير بعد الترجمة. أعد إنشاء الترجمة قبل تنزيل ملف PDF العربي أو ثنائي اللغة.",
    failed: "تعذر إنشاء ملف PDF أو تنزيله.",
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
  responseUpdatedAt,
  translation: initialTranslation,
}: {
  projectId: string
  stageId: string
  termId: string
  responseUpdatedAt: string
  translation: ProjectStageTranslationSummary
}) {
  const { locale } = useI18n()
  const copy = COPY[locale]
  const [translation, setTranslation] = useState(initialTranslation)
  const [busy, setBusy] = useState<PdfKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stale = Boolean(
    translation.generatedAt && new Date(responseUpdatedAt).getTime() > new Date(translation.generatedAt).getTime(),
  )

  async function generateAndStore(kind: PdfKind) {
    const params = new URLSearchParams({ projectId, stageId, termId })
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
    const form = new FormData()
    form.set("projectId", projectId)
    form.set("translationId", record.id)
    form.set("kind", kind)
    form.set("file", new File([exported.blob], exported.filename, { type: "application/pdf" }))
    const uploadResponse = await fetch("/api/stage-translations/pdf", { method: "POST", body: form })
    const uploadPayload = await uploadResponse.json().catch(() => null)
    if (!uploadResponse.ok) throw new Error(uploadPayload?.error || copy.failed)

    const storagePath = String(uploadPayload.storagePath)
    setTranslation((current) => ({
      ...current,
      originalPdfPath: kind === "original" ? storagePath : current.originalPdfPath,
      arabicPdfPath: kind === "arabic" ? storagePath : current.arabicPdfPath,
      bilingualPdfPath: kind === "bilingual" ? storagePath : current.bilingualPdfPath,
    }))
  }

  async function download(kind: PdfKind) {
    if (busy || (kind !== "original" && stale)) return
    setError(null)
    const storedPath = pdfPath(translation, kind)
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

  return (
    <div className="flex min-w-0 flex-col items-end gap-2" onClick={(event) => event.stopPropagation()}>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Link
          href={`/projects/${projectId}/stages/${stageId}/terms/${termId}/translate`}
          className={cn(buttonVariants({ size: "xs", variant: "secondary" }))}
        >
          <Languages className="size-3" />{copy.translate}
        </Link>
        <Button size="xs" variant="outline" disabled={busy !== null} title={copy.english} onClick={() => void download("original")}>
          {busy === "original" ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}{copy.english}
        </Button>
        <Button size="xs" variant="outline" disabled={busy !== null || stale} title={stale ? copy.stale : copy.arabic} onClick={() => void download("arabic")}>
          {busy === "arabic" ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}{copy.arabic}
        </Button>
        <Button size="xs" variant="outline" disabled={busy !== null || stale} title={stale ? copy.stale : copy.bilingual} onClick={() => void download("bilingual")}>
          {busy === "bilingual" ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}{copy.bilingual}
        </Button>
      </div>
      {error ? <p role="alert" className="max-w-md text-end text-[11px] text-red-600">{error}</p> : null}
      {stale ? <p className="max-w-md text-end text-[11px] text-amber-700">{copy.stale}</p> : null}
    </div>
  )
}
