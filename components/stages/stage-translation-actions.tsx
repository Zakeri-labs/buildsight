"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Download, Languages, Loader2 } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { TranslationPdfReport } from "@/components/stages/stage-translation-viewer"
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
    stale: "The report changed after translation. Regenerate the translation before downloading PDFs.",
    failed: "Unable to generate or download the PDF.",
  },
  ar: {
    translate: "ترجمة",
    english: "PDF إنجليزي",
    arabic: "PDF عربي",
    bilingual: "PDF ثنائي اللغة",
    stale: "تم تعديل التقرير بعد الترجمة. أعد إنشاء الترجمة قبل تنزيل ملفات PDF.",
    failed: "تعذر إنشاء ملف PDF أو تنزيله.",
  },
} as const

type PdfKind = "original" | "arabic" | "bilingual"
type ExportJob = { kind: PdfKind; data: StageTranslationPageData }

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
  const [job, setJob] = useState<ExportJob | null>(null)
  const sourceRef = useRef<HTMLElement>(null)

  const stale = Boolean(
    translation.generatedAt && new Date(responseUpdatedAt).getTime() > new Date(translation.generatedAt).getTime(),
  )

  useEffect(() => {
    if (!job) return
    let cancelled = false

    async function runExport() {
      const source = sourceRef.current
      const record = job.data.translation
      if (!source || !record?.translatedContent) throw new Error(copy.failed)

      const exported = await exportTranslationPdf({
        source,
        projectName: job.data.project.name,
        projectReference: job.data.project.code,
        documentNumber: job.data.response.reportNumber,
        kind: job.kind,
      })
      if (cancelled) return

      const form = new FormData()
      form.set("projectId", projectId)
      form.set("translationId", record.id)
      form.set("kind", job.kind)
      form.set("file", new File([exported.blob], exported.filename, { type: "application/pdf" }))
      const response = await fetch("/api/stage-translations/pdf", { method: "POST", body: form })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || copy.failed)
      if (cancelled) return

      const storagePath = String(payload.storagePath)
      setTranslation((current) => ({
        ...current,
        originalPdfPath: job.kind === "original" ? storagePath : current.originalPdfPath,
        arabicPdfPath: job.kind === "arabic" ? storagePath : current.arabicPdfPath,
        bilingualPdfPath: job.kind === "bilingual" ? storagePath : current.bilingualPdfPath,
      }))
    }

    void runExport()
      .catch((exportError) => {
        if (!cancelled) setError(exportError instanceof Error ? exportError.message : copy.failed)
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(null)
          setJob(null)
        }
      })

    return () => { cancelled = true }
  }, [copy.failed, job, projectId])

  async function download(kind: PdfKind) {
    if (busy || stale) return
    setError(null)
    const storedPath = pdfPath(translation, kind)
    if (storedPath) {
      const params = new URLSearchParams({ projectId, translationId: translation.id, kind })
      window.location.assign(`/api/stage-translations/pdf?${params.toString()}`)
      return
    }

    setBusy(kind)
    try {
      const params = new URLSearchParams({ projectId, stageId, termId })
      const response = await fetch(`/api/stage-translations?${params.toString()}`, { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || copy.failed)
      const data = payload?.data as StageTranslationPageData | undefined
      if (!data?.translation?.translatedContent || data.translation.status !== "completed") throw new Error(copy.failed)
      const isStale = Boolean(
        data.translation.generatedAt && new Date(data.response.updatedAt).getTime() > new Date(data.translation.generatedAt).getTime(),
      )
      if (isStale) throw new Error(copy.stale)
      setJob({ kind, data })
    } catch (downloadError) {
      setBusy(null)
      setError(downloadError instanceof Error ? downloadError.message : copy.failed)
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
        <Button size="xs" variant="outline" disabled={busy !== null || stale} title={stale ? copy.stale : copy.english} onClick={() => void download("original")}>
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
      {job?.data.translation ? (
        <div className="pointer-events-none fixed -left-[20000px] top-0 bg-white" style={{ width: job.kind === "bilingual" ? 1123 : 794 }} aria-hidden="true" inert>
          <TranslationPdfReport ref={sourceRef} kind={job.kind} data={job.data} translation={job.data.translation} />
        </div>
      ) : null}
    </div>
  )
}
